import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { RouteViewDriver } from '../../../driver-interfaces/route-view-driver';
import type { RouteType } from '../../../constants/router';
import type { RouteDescriptor } from '../route-classifier';
import type { EventRef } from '../../../driver-interfaces/event-view-driver';
import { eventRefFromRawId, withResolvedCalendarId } from '../identity';

/** One Calendar route (page). Destroyed when the route changes. */
export default class CalendarRouteViewDriver implements RouteViewDriver {
  readonly #descriptor: RouteDescriptor;
  readonly #stopper: Stopper = kefirStopper();

  readonly #resolveCalendarId:
    | ((calendarIdHint: string) => string | null)
    | undefined;

  constructor(
    descriptor: RouteDescriptor,
    resolveCalendarId?: (calendarIdHint: string) => string | null,
  ) {
    this.#descriptor = descriptor;
    this.#resolveCalendarId = resolveCalendarId;
  }

  getType(): RouteType {
    return this.#descriptor.type;
  }

  getAnchorDate(): string | null {
    return this.#descriptor.anchorDate;
  }

  getSearchQuery(): string | null {
    return this.#descriptor.searchQuery;
  }

  getEventRef(): EventRef | null {
    const ref = eventRefFromRawId(this.#descriptor.eventRawId);
    // the calendar is learned from chips, which may render after the route starts: look it up per call
    return ref && withResolvedCalendarId(ref, this.#resolveCalendarId);
  }

  /** The descriptor this route was built from (used to spot editor routes). */
  getDescriptor(): RouteDescriptor {
    return this.#descriptor;
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  destroy(): void {
    this.#stopper.destroy();
  }
}
