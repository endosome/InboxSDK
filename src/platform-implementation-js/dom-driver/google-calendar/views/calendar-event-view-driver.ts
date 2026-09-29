import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type {
  EventRef,
  EventSegment,
  EventViewDriver,
} from '../../../driver-interfaces/event-view-driver';

/** What a view driver needs from the registry that owns it. */
export interface SegmentSource {
  getSegment(driver: CalendarEventViewDriver): EventSegment;
}

/** One rendered chip of a calendar item. Lives as long as the chip shows that item. */
export default class CalendarEventViewDriver implements EventViewDriver {
  readonly element: HTMLElement;
  readonly #ref: EventRef;
  readonly #segments: SegmentSource;
  readonly #stopper: Stopper = kefirStopper();

  constructor(element: HTMLElement, ref: EventRef, segments: SegmentSource) {
    this.element = element;
    this.#ref = ref;
    this.#segments = segments;
  }

  getEventRef(): EventRef {
    return this.#ref;
  }

  getSegment(): EventSegment {
    return this.#segments.getSegment(this);
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

  getStopper(): Stopper {
    return this.#stopper;
  }

  destroy(): void {
    this.#stopper.destroy();
  }
}
