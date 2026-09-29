import type { Stopper } from 'kefir-stopper';
import type { RouteType } from '../constants/router';
import type { EventRef } from './event-view-driver';

/** What the public `RouteView` needs from a site driver. */
export interface RouteViewDriver {
  getType(): RouteType;
  /** `YYYY-MM-DD` taken from the URL, or null when the URL carries no date. */
  getAnchorDate(): string | null;
  getSearchQuery(): string | null;
  /** `EVENT_EDIT` of an existing item; null for a new event or any other route. */
  getEventRef(): EventRef | null;
  /** Ends when this route ends. */
  getStopper(): Stopper;
}
