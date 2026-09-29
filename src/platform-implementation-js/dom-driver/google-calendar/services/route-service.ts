import {
  classifyRoute,
  routeKey,
  type RouteDescriptor,
  type RouteInput,
} from '../route-classifier';
import CalendarRouteViewDriver from '../views/calendar-route-view-driver';
import { buildRouteUrl, type GotoTarget } from '../route-url';
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
  /** Pushes a URL and tells Calendar's router (default: `history.pushState` + a `popstate` event). */
  navigate?: (url: string) => void;
  /** URL and body attributes disagreed for longer than `settleMs`. */
  onDisagreement?: (input: RouteInput, descriptor: RouteDescriptor) => void;
  /** How long the URL may lead the DOM before the DOM is trusted anyway. */
  settleMs?: number;
};

const RECHECK_MS = 50;

function defaultNavigate(url: string) {
  // A fresh state object: re-using Calendar's own state makes its router treat this as
  // "back to that entry" and restore the previous URL (verified live).
  history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

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

  /**
   * Navigate inside Calendar (no reload) and resolve once the route has
   * changed to the requested kind. Verified live: `history.pushState` plus a
   * `popstate` event makes Calendar switch view without a page load, whereas
   * `navigation.navigate()` and link clicks reload the page.
   */
  goto(target: GotoTarget, timeoutMs = 5000): Promise<void> {
    if (this.#stopped)
      return Promise.reject(new Error('Router.goto: the SDK was destroyed'));
    const { url, expected } = buildRouteUrl(
      target,
      this.#env.location.pathname,
    );
    const matches = (d: CalendarRouteViewDriver) => {
      const desc = d.getDescriptor();
      return (
        desc.type === expected.type &&
        desc.eventRawId === expected.eventRawId &&
        desc.searchQuery === expected.searchQuery
      );
    };
    const [path, query = ''] = url.split('?');
    const already =
      this.#env.location.pathname === path &&
      this.#env.location.search === (query ? `?${query}` : '') &&
      matches(this.#current!);
    if (already) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = (err?: Error) => {
        clearTimeout(timer);
        unsubscribe();
        if (err) reject(err);
        else resolve();
      };
      const unsubscribe = this.subscribe((d) => {
        if (matches(d)) done();
      });
      const timer = setTimeout(
        () =>
          done(new Error(`Router.goto: Calendar did not navigate to ${url}`)),
        timeoutMs,
      );
      try {
        (this.#env.navigate ?? defaultNavigate)(url);
      } catch (err) {
        done(err as Error);
      }
    });
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
