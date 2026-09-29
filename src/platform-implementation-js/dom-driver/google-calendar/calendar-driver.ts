import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { Driver } from '../../driver-interfaces/driver';
import SelectorRegistry from '../../lib/dom/selectorRegistry';
import type { InvalidSelectorReporter } from '../../lib/dom/mergeSelectorOverrides';
import {
  CALENDAR_SELECTORS,
  type CalendarSelectorKey,
  type SelectorOverrides,
} from './selectors';

export type CalendarDriverOptions = {
  selectorOverrides?: SelectorOverrides;
  onInvalidSelector?: InvalidSelectorReporter;
};

/**
 * Composition root for the Google Calendar integration. Phase 1 only provides
 * lifetime and selector resolution; route, observer, identity and view services
 * are added in later phases and composed here (see docs/calendar-sdk-plan.md §3).
 */
export default class CalendarDriver implements Driver {
  readonly selectors: SelectorRegistry<CalendarSelectorKey>;
  readonly #appId: string;
  readonly #stopper: Stopper = kefirStopper();

  constructor(appId: string, options: CalendarDriverOptions = {}) {
    this.#appId = appId;
    this.selectors = new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
      {
        overrides: options.selectorOverrides,
        onInvalidSelector: options.onInvalidSelector,
      },
    );
  }

  getAppId(): string {
    return this.#appId;
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  destroy(): void {
    this.#stopper.destroy();
  }
}
