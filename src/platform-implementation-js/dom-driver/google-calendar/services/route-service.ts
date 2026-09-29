import {
  classifyRoute,
  routeKey,
  type RouteDescriptor,
  type RouteInput,
} from '../route-classifier';
import CalendarRouteViewDriver from '../views/calendar-route-view-driver';
import { reportError } from '../../../lib/reporter';

type Listener = (type: string, fn: () => void) => void;

/** The browser objects the service observes (injectable for tests). */
export type RouteServiceEnv = {
  document: Document;
  location: Pick<Location, 'pathname' | 'search'>;
  window: {
    addEventListener: Listener;
    removeEventListener: Listener;
  };
  /** The Navigation API, when the browser has it (Chromium). */
  navigation?: {
    addEventListener: Listener;
    removeEventListener: Listener;
  };
  /** URL and body attributes disagreed for longer than `settleMs`. */
  onDisagreement?: (input: RouteInput, descriptor: RouteDescriptor) => void;
  /** How long the URL may lead the DOM before the DOM is trusted anyway. */
  settleMs?: number;
};

const RECHECK_MS = 50;

/**
 * Turns Calendar's navigation into a sequence of route objects. A new route is
 * emitted when the classified type, date or search query changes.
 *
 * Calendar updates the URL first and `body[data-viewkey]` a moment later, so
 * while the two disagree the service waits (up to `settleMs`) instead of
 * emitting a wrong route.
 */
export default class RouteService {
  readonly #env: RouteServiceEnv;
  readonly #settleMs: number;
  readonly #subscribers = new Set<(d: CalendarRouteViewDriver) => void>();
  #current: CalendarRouteViewDriver | null = null;
  #currentKey: string | null = null;
  #disagreeSince: number | null = null;
  #recheckTimer: ReturnType<typeof setTimeout> | null = null;
  #observer: MutationObserver | null = null;
  #titleObserver: MutationObserver | null = null;
  #started = false;
  #stopped = false;

  constructor(env: RouteServiceEnv) {
    this.#env = env;
    this.#settleMs = env.settleMs ?? 500;
  }

  readInput(): RouteInput {
    const { document, location } = this.#env;
    return {
      viewKey: document.body?.getAttribute('data-viewkey') ?? null,
      viewFamily: document.body?.getAttribute('data-viewfamily') ?? null,
      pathname: location.pathname,
      search: location.search,
    };
  }

  /** Emit the initial route synchronously and start observing. */
  start(): CalendarRouteViewDriver {
    if (this.#started) throw new Error('RouteService already started');
    this.#started = true;
    // The first route is taken as-is, even if URL and DOM disagree.
    this.#emit(classifyRoute(this.readInput()).descriptor);

    const { document, window, navigation } = this.#env;
    window.addEventListener('popstate', this.#onNavigationSoon);
    navigation?.addEventListener('navigate', this.#onNavigationSoon);
    navigation?.addEventListener('currententrychange', this.#onNavigationSoon);
    this.#observer = new MutationObserver(this.#evaluate);
    this.#observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-viewkey', 'data-viewfamily'],
    });
    // The title changes with the date; covers browsers without the Navigation API.
    const title = document.querySelector('title');
    if (title) {
      this.#titleObserver = new MutationObserver(this.#evaluate);
      this.#titleObserver.observe(title, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    return this.#current!;
  }

  getCurrent(): CalendarRouteViewDriver {
    if (!this.#current) throw new Error('RouteService not started');
    return this.#current;
  }

  subscribe(cb: (d: CalendarRouteViewDriver) => void): () => void {
    this.#subscribers.add(cb);
    return () => this.#subscribers.delete(cb);
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    const { window, navigation } = this.#env;
    window.removeEventListener('popstate', this.#onNavigationSoon);
    navigation?.removeEventListener('navigate', this.#onNavigationSoon);
    navigation?.removeEventListener(
      'currententrychange',
      this.#onNavigationSoon,
    );
    this.#observer?.disconnect();
    this.#titleObserver?.disconnect();
    if (this.#recheckTimer) clearTimeout(this.#recheckTimer);
    this.#subscribers.clear();
    this.#current?.destroy();
  }

  // The URL is already updated when these fire, the DOM usually is not yet.
  readonly #onNavigationSoon = () => {
    setTimeout(this.#evaluate, 0);
  };

  readonly #evaluate = () => {
    if (this.#stopped) return;
    const input = this.readInput();
    const { descriptor, agrees } = classifyRoute(input);

    if (!agrees) {
      const now = Date.now();
      this.#disagreeSince ??= now;
      if (now - this.#disagreeSince < this.#settleMs) {
        this.#scheduleRecheck();
        return;
      }
      this.#env.onDisagreement?.(input, descriptor);
    }
    this.#disagreeSince = null;

    if (routeKey(descriptor) !== this.#currentKey) {
      this.#emit(descriptor);
    }
  };

  #scheduleRecheck() {
    if (this.#recheckTimer) return;
    this.#recheckTimer = setTimeout(() => {
      this.#recheckTimer = null;
      this.#evaluate();
    }, RECHECK_MS);
  }

  #emit(descriptor: RouteDescriptor) {
    const previous = this.#current;
    const next = new CalendarRouteViewDriver(descriptor);
    this.#current = next;
    this.#currentKey = routeKey(descriptor);
    previous?.destroy();
    for (const cb of [...this.#subscribers]) {
      try {
        cb(next);
      } catch (err) {
        // one subscriber must not break routing
        reportError(err);
      }
    }
  }
}
