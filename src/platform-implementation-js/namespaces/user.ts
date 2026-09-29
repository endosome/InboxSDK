import type { Driver } from '../driver-interfaces/driver';

export default class User {
  readonly #driver: Driver;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  getEmailAddress(): string {
    return this.#driver.getUserInfo().emailAddress;
  }

  /** UI language, e.g. `en`. */
  getLanguage(): string {
    return this.#driver.getUserInfo().language;
  }

  /** IANA time zone of the calendar (e.g. `Europe/Warsaw`), or null. */
  getTimeZone(): string | null {
    return this.#driver.getUserInfo().timeZone;
  }
}
