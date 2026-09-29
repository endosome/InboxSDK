import HandlerRegistry from '../lib/handler-registry';
import type Membrane from '../lib/Membrane';
import type { Driver } from '../driver-interfaces/driver';
import type { EventKind } from '../driver-interfaces/event-view-driver';
import type EventView from '../views/event-view';
import type EventPopoverView from '../views/event-popover-view';
import type EventEditorView from '../views/event-editor-view';

export type EventViewHandlerOptions = {
  /** Which kinds of calendar items to be called for. Default: `['event']`. */
  kinds?: EventKind[];
};

const ALL_KINDS: EventKind[] = ['event', 'task', 'birthday', 'unknown'];

function makeRegistries<T>() {
  return new Map<EventKind, HandlerRegistry<T>>(
    ALL_KINDS.map((kind) => [kind, new HandlerRegistry<T>()]),
  );
}

function registerForKinds<T>(
  registries: Map<EventKind, HandlerRegistry<T>>,
  handler: (target: T) => void,
  kinds: EventKind[] | undefined,
): () => void {
  const unregisters = [...new Set<EventKind>(kinds ?? ['event'])].map(
    (kind) => {
      const registry = registries.get(kind);
      if (!registry) throw new Error(`Unknown event kind: ${String(kind)}`);
      return registry.registerHandler(handler);
    },
  );
  return () => unregisters.forEach((unregister) => unregister());
}

export default class Events {
  readonly #viewRegistries = makeRegistries<EventView>();
  readonly #popoverRegistries = makeRegistries<EventPopoverView>();
  readonly #editorRegistry = new HandlerRegistry<EventEditorView>();

  constructor(driver: Driver, membrane: Membrane) {
    const addView = (viewDriver: Parameters<Membrane['get']>[0]) => {
      const view = membrane.get(viewDriver) as EventView;
      this.#viewRegistries.get(view.getEventRef().kind)?.addTarget(view);
    };
    const addPopover = (popoverDriver: Parameters<Membrane['get']>[0]) => {
      const view = membrane.get(popoverDriver) as EventPopoverView;
      this.#popoverRegistries.get(view.getEventRef().kind)?.addTarget(view);
    };
    const addEditor = (editorDriver: Parameters<Membrane['get']>[0]) => {
      this.#editorRegistry.addTarget(
        membrane.get(editorDriver) as EventEditorView,
      );
    };
    driver.getEventViewDrivers().forEach(addView);
    driver.getEventEditorViewDrivers().forEach(addEditor);
    driver.getEventPopoverViewDrivers().forEach(addPopover);
    const unsubscribeViews = driver.onEventViewDriver(addView);
    const unsubscribePopovers = driver.onEventPopoverViewDriver(addPopover);
    const unsubscribeEditors = driver.onEventEditorViewDriver(addEditor);
    driver.getStopper().onValue(() => {
      unsubscribeViews();
      unsubscribePopovers();
      unsubscribeEditors();
      this.#editorRegistry.dumpHandlers();
      this.#viewRegistries.forEach((registry) => registry.dumpHandlers());
      this.#popoverRegistries.forEach((registry) => registry.dumpHandlers());
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
    return registerForKinds(this.#viewRegistries, handler, options.kinds);
  }

  /**
   * Called for every event popover that is open now and every one that opens
   * later. Same `kinds` semantics as {@link registerEventViewHandler}.
   */
  registerEventPopoverHandler(
    handler: (popoverView: EventPopoverView) => void,
    options: EventViewHandlerOptions = {},
  ): () => void {
    return registerForKinds(this.#popoverRegistries, handler, options.kinds);
  }

  /**
   * Called for the editor of the current `EVENT_EDIT` route (if that is the
   * route) and for every editor route entered later. Returns an unregister
   * function.
   */
  registerEventEditorHandler(
    handler: (editorView: EventEditorView) => void,
  ): () => void {
    return this.#editorRegistry.registerHandler(handler);
  }
}
