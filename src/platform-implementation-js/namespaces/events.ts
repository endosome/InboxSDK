import HandlerRegistry from '../lib/handler-registry';
import type Membrane from '../lib/Membrane';
import type { Driver } from '../driver-interfaces/driver';
import type { EventKind } from '../driver-interfaces/event-view-driver';
import type EventView from '../views/event-view';

export type EventViewHandlerOptions = {
  /** Which kinds of calendar items to be called for. Default: `['event']`. */
  kinds?: EventKind[];
};

const ALL_KINDS: EventKind[] = ['event', 'task', 'birthday', 'unknown'];

export default class Events {
  readonly #registries = new Map<EventKind, HandlerRegistry<EventView>>(
    ALL_KINDS.map((kind) => [kind, new HandlerRegistry<EventView>()]),
  );

  constructor(driver: Driver, membrane: Membrane) {
    const add = (viewDriver: Parameters<Membrane['get']>[0]) => {
      const view = membrane.get(viewDriver) as EventView;
      this.#registries.get(view.getEventRef().kind)?.addTarget(view);
    };
    driver.getEventViewDrivers().forEach(add);
    const unsubscribe = driver.onEventViewDriver(add);
    driver.getStopper().onValue(() => {
      unsubscribe();
      this.#registries.forEach((registry) => registry.dumpHandlers());
    });
  }

  /**
   * Called for every chip that shows a calendar item — those already on the
   * page and every later one. Returns a function that unregisters the handler.
   * Default kinds: plain events only; pass `{ kinds: ['task', 'birthday'] }` to
   * be called for those too.
   */
  registerEventViewHandler(
    handler: (eventView: EventView) => void,
    options: EventViewHandlerOptions = {},
  ): () => void {
    const kinds = new Set<EventKind>(options.kinds ?? ['event']);
    const unregisters = [...kinds].map((kind) => {
      const registry = this.#registries.get(kind);
      if (!registry) throw new Error(`Unknown event kind: ${String(kind)}`);
      return registry.registerHandler(handler);
    });
    return () => unregisters.forEach((unregister) => unregister());
  }
}
