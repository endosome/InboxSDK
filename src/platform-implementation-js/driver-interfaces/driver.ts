import type { Stopper } from 'kefir-stopper';
import type { RouteViewDriver } from './route-view-driver';

export type UserInfo = {
  emailAddress: string;
  /** Empty string when Calendar has no display name for the account. */
  name: string;
  /** IANA time zone of the calendar, e.g. `Europe/Warsaw`. */
  timeZone: string | null;
  /** UTC offset in minutes at load time, or null if unparsable. */
  gmtOffsetMinutes: number | null;
  /** UI language, e.g. `en`. */
  language: string;
};

/**
 * What the platform-independent code (namespaces, public views) needs from a
 * site driver. Site-specific drivers (see `dom-driver/`) implement this; the
 * namespaces must depend on this interface and never on a concrete driver.
 */
export interface Driver {
  getAppId(): string;
  /** Ends when the driver is destroyed. Use with `takeUntilBy` to bound lifetimes. */
  getStopper(): Stopper;
  getUserInfo(): UserInfo;
  /** The route the page is on right now. */
  getCurrentRouteViewDriver(): RouteViewDriver;
  /**
   * Called with each NEW route (after the current one). Returns an unsubscribe
   * function. The previous route's stopper fires before the callback runs.
   */
  onRouteViewDriver(cb: (driver: RouteViewDriver) => void): () => void;
  destroy(): void;
}
