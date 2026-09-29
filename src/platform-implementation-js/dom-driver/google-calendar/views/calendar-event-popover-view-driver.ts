import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { EventRef } from '../../../driver-interfaces/event-view-driver';
import type {
  EventPopoverViewDriver,
  PopoverButtonDescriptor,
  PopoverButtonHandle,
} from '../../../driver-interfaces/event-popover-view-driver';

/** What a popover driver needs from the service that owns it. */
export interface PopoverHost {
  addButton(
    driver: CalendarEventPopoverViewDriver,
    descriptor: PopoverButtonDescriptor,
  ): PopoverButtonHandle;
}

/** One open event popover. Lives until it closes or shows another event. */
export default class CalendarEventPopoverViewDriver
  implements EventPopoverViewDriver
{
  readonly element: HTMLElement;
  readonly #ref: EventRef;
  readonly #host: PopoverHost;
  readonly #stopper: Stopper = kefirStopper();

  constructor(element: HTMLElement, ref: EventRef, host: PopoverHost) {
    this.element = element;
    this.#ref = ref;
    this.#host = host;
  }

  getEventRef(): EventRef {
    return this.#ref;
  }

  addButton(descriptor: PopoverButtonDescriptor): PopoverButtonHandle {
    return this.#host.addButton(this, descriptor);
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  destroy(): void {
    this.#stopper.destroy();
  }
}
