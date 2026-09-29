import SafeEventEmitter from '../lib/safe-event-emitter';
import type {
  EventRef,
  EventSegment,
  EventViewDriver,
} from '../driver-interfaces/event-view-driver';

/**
 * One chip of a calendar item that is currently rendered. It is created when
 * the chip becomes an event and emits `destroy` when the chip goes away or
 * stops showing that item. A multi-day event has one `EventView` per chip.
 * When Calendar replaces a chip (for example after dragging it to another day)
 * the old view is destroyed and a new one is created, so handlers run again.
 */
export default class EventView extends SafeEventEmitter {
  destroyed = false;
  readonly #driver: EventViewDriver;

  constructor(driver: EventViewDriver) {
    super();
    this.#driver = driver;
    driver.getStopper().onValue(() => {
      this.destroyed = true;
      this.emit('destroy');
      this.removeAllListeners();
    });
  }

  /** The item this view shows. It never changes for the lifetime of a view. */
  getEventRef(): EventRef {
    return this.#driver.getEventRef();
  }

  /**
   * Which chip of a multi-day event this is (document order). Recomputed on
   * every call because chips come and go as the user navigates or drags.
   */
  getSegment(): EventSegment {
    return this.#driver.getSegment();
  }

  /** Recomputed on every call: dragging can turn a timed event into an all-day one. */
  isAllDay(): boolean {
    return this.#driver.isAllDay();
  }
}
