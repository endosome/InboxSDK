import SafeEventEmitter from '../../lib/safe-event-emitter';
import type { RouteType } from '../../constants/router';
import type { EventRef } from '../../driver-interfaces/event-view-driver';
import type { RouteViewDriver } from '../../driver-interfaces/route-view-driver';

/**
 * A page the user is on. A new `RouteView` is created whenever the route type,
 * date or search query changes; the previous one emits `destroy`.
 */
export default class RouteView extends SafeEventEmitter {
  destroyed = false;
  readonly #driver: RouteViewDriver;

  constructor(driver: RouteViewDriver) {
    super();
    this.#driver = driver;
    driver.getStopper().onValue(() => {
      this.destroyed = true;
      this.emit('destroy');
      this.removeAllListeners();
    });
  }

  getType(): RouteType {
    return this.#driver.getType();
  }

  /**
   * `YYYY-MM-DD` from the URL, or null when the URL has no date (for example
   * right after "Today"). It is the date the view is anchored on, not the
   * full range shown (the range depends on the user's week-start setting).
   */
  getAnchorDate(): string | null {
    return this.#driver.getAnchorDate();
  }

  /** The query of a `SEARCH` route, else null. */
  getSearchQuery(): string | null {
    return this.#driver.getSearchQuery();
  }

  /**
   * On an `EVENT_EDIT` route of an existing item, which item; null for a new
   * event and for every other route type.
   */
  getEventRef(): EventRef | null {
    return this.#driver.getEventRef();
  }
}
