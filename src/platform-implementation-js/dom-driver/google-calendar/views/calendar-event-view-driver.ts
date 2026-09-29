import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type {
  BadgeDescriptor,
  BadgeHandle,
  EventRef,
  EventSegment,
  EventViewDriver,
} from '../../../driver-interfaces/event-view-driver';

/** What a view driver needs from the services that own it. */
export interface ViewHost {
  getSegment(driver: CalendarEventViewDriver): EventSegment;
  addBadge(
    driver: CalendarEventViewDriver,
    descriptor: BadgeDescriptor,
  ): BadgeHandle;
}

/** One rendered chip of a calendar item. Lives as long as the chip shows that item. */
export default class CalendarEventViewDriver implements EventViewDriver {
  readonly element: HTMLElement;
  readonly #ref: EventRef;
  readonly #host: ViewHost;
  readonly #stopper: Stopper = kefirStopper();

  constructor(element: HTMLElement, ref: EventRef, host: ViewHost) {
    this.element = element;
    this.#ref = ref;
    this.#host = host;
  }

  getEventRef(): EventRef {
    return this.#ref;
  }

  getSegment(): EventSegment {
    return this.#host.getSegment(this);
  }

  /**
   * `data-dragsource-type`: 2 timed, 6 all-day, 9 read-only (RE §1.15). Read on
   * every call because the same event can flip between all-day and timed. When
   * the attribute is not decisive: all-day chips have no `role` and no
   * `[data-datekey]` ancestor (RE §1.11).
   */
  isAllDay(): boolean {
    const dragClass = this.element.getAttribute('data-dragsource-type');
    if (dragClass === '6') return true;
    if (dragClass === '2') return false;
    return (
      !this.element.hasAttribute('role') &&
      !this.element.closest('[data-datekey]')
    );
  }

  addBadge(descriptor: BadgeDescriptor): BadgeHandle {
    return this.#host.addBadge(this, descriptor);
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  destroy(): void {
    this.#stopper.destroy();
  }
}
