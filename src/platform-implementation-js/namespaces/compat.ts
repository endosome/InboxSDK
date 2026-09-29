import type { Driver } from '../driver-interfaces/driver';
import type { CompatIssue, CompatReport } from '../compat/types';

/**
 * Health of the SDK's selectors against the page it runs on. Everything is
 * computed locally; nothing is sent anywhere.
 */
export default class Compat {
  readonly #driver: Driver;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  /** Check the page now. Contains no titles, ids or other user data. */
  getReport(): CompatReport {
    return this.#driver.getCompatReport();
  }

  /**
   * Called when a check finds a problem (shortly after load and after each
   * route change), once per problem until it goes away. Returns an unregister
   * function.
   */
  onIssue(handler: (issue: CompatIssue) => void): () => void {
    return this.#driver.onCompatIssue(handler);
  }
}
