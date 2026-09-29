import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { RouteViewDriver } from '../../../driver-interfaces/route-view-driver';
import type { RouteType } from '../../../constants/router';
import type { RouteDescriptor } from '../route-classifier';
import type { EventRef } from '../../../driver-interfaces/event-view-driver';
import { eventRefFromRawId } from '../identity';

/** One Calendar route (page). Destroyed when the route changes. */
export default class CalendarRouteViewDriver implements RouteViewDriver {
  readonly #descriptor: RouteDescriptor;
  readonly #stopper: Stopper = kefirStopper();

  constructor(descriptor: RouteDescriptor) {
    this.#descriptor = descriptor;
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
    return eventRefFromRawId(this.#descriptor.eventRawId);
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
