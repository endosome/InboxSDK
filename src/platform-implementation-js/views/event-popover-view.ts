import SafeEventEmitter from '../lib/safe-event-emitter';
import type { EventRef } from '../driver-interfaces/event-view-driver';
import type {
  EventPopoverViewDriver,
  PopoverButtonDescriptor,
  PopoverButtonHandle,
} from '../driver-interfaces/event-popover-view-driver';

export type EventPopoverButtonDescriptor = Omit<
  PopoverButtonDescriptor,
  'onClick'
> & {
  /** Called with this popover view when the button is clicked. */
  onClick: (popoverView: EventPopoverView) => void;
};

/**
 * The popover Calendar shows for one event. It is created when the popover
 * opens and emits `destroy` when it closes (or starts showing another event).
 */
export default class EventPopoverView extends SafeEventEmitter {
  destroyed = false;
  readonly #driver: EventPopoverViewDriver;

  constructor(driver: EventPopoverViewDriver) {
    super();
    this.#driver = driver;
    driver.getStopper().onValue(() => {
      this.destroyed = true;
      this.emit('destroy');
      this.removeAllListeners();
    });
  }

  /** The event this popover shows. It never changes for the lifetime of a view. */
  getEventRef(): EventRef {
    return this.#driver.getEventRef();
  }

  /**
   * Add a button to this popover. The SDK keeps it in place if Calendar
   * re-renders the popover, and removes it when the popover closes.
   */
  addButton(descriptor: EventPopoverButtonDescriptor): PopoverButtonHandle {
    if (this.destroyed) {
      throw new Error('addButton: this EventPopoverView has been destroyed');
    }
    const { onClick, ...rest } = descriptor;
    return this.#driver.addButton({ ...rest, onClick: () => onClick(this) });
  }
}
