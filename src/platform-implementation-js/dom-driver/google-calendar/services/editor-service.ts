import { RouteType } from '../../../constants/router';
import { reportError } from '../../../lib/reporter';
import type SelectorRegistry from '../../../lib/dom/selectorRegistry';
import type { CalendarSelectorKey } from '../selectors';
import { eventRefFromRawId } from '../identity';
import type RouteService from './route-service';
import type CalendarRouteViewDriver from '../views/calendar-route-view-driver';
import CalendarEventEditorViewDriver from '../views/calendar-event-editor-view-driver';

type Subscriber = (driver: CalendarEventEditorViewDriver) => void;

/**
 * One editor view per `EVENT_EDIT` route, on the route's lifetime. It is
 * derived from the route alone (URL + `body[data-viewkey]`, docs RE §1.18), not
 * from editor DOM, so overlays and dialogs cannot affect it.
 */
export default class EditorService {
  readonly #routes: RouteService;
  readonly #document: Document;
  readonly #selectors: SelectorRegistry<CalendarSelectorKey>;
  readonly #subscribers = new Set<Subscriber>();
  #current: CalendarEventEditorViewDriver | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor(
    routes: RouteService,
    document: Document,
    selectors: SelectorRegistry<CalendarSelectorKey>,
  ) {
    this.#routes = routes;
    this.#document = document;
    this.#selectors = selectors;
  }

  start(): void {
    this.#onRoute(this.#routes.getCurrent(), false);
    this.#unsubscribe = this.#routes.subscribe((r) => this.#onRoute(r, true));
  }

  getAll(): CalendarEventEditorViewDriver[] {
    return this.#current ? [this.#current] : [];
  }

  subscribe(cb: Subscriber): () => void {
    this.#subscribers.add(cb);
    return () => this.#subscribers.delete(cb);
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#subscribers.clear();
    this.#current = null;
  }

  #onRoute(route: CalendarRouteViewDriver, notify: boolean) {
    this.#current = null;
    if (route.getType() !== RouteType.EVENT_EDIT) return;
    const ref = eventRefFromRawId(route.getDescriptor().eventRawId);
    const driver = new CalendarEventEditorViewDriver(ref, route.getStopper(), {
      document: this.#document,
      selectors: this.#selectors,
    });
    this.#current = driver;
    route.getStopper().onValue(() => {
      if (this.#current === driver) this.#current = null;
    });
    if (!notify) return;
    for (const cb of [...this.#subscribers]) {
      try {
        cb(driver);
      } catch (err) {
        reportError(err);
      }
    }
  }
}
