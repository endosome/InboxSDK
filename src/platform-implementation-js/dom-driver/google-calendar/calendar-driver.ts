import kefirStopper from 'kefir-stopper';
import type { Stopper } from 'kefir-stopper';
import type { Driver, UserInfo } from '../../driver-interfaces/driver';
import type { RouteViewDriver } from '../../driver-interfaces/route-view-driver';
import type { EventViewDriver } from '../../driver-interfaces/event-view-driver';
import SelectorRegistry from '../../lib/dom/selectorRegistry';
import type { InvalidSelectorReporter } from '../../lib/dom/mergeSelectorOverrides';
import waitFor from '../../lib/wait-for';
import { reportEvent } from '../../lib/reporter';
import {
  CALENDAR_SELECTORS,
  type CalendarSelectorKey,
  type SelectorOverrides,
} from './selectors';
import RouteService from './services/route-service';
import EventRegistry from './services/event-registry';
import { readUserInfo } from './services/user-info';

export type CalendarDriverOptions = {
  selectorOverrides?: SelectorOverrides;
  onInvalidSelector?: InvalidSelectorReporter;
  /** How long to wait for Calendar to render its user info. */
  readyTimeoutMs?: number;
};

/**
 * Composition root for the Google Calendar integration: owns the lifetime and
 * composes the services (route, user info; observer/identity/views come in
 * later phases, see docs/calendar-sdk-plan.md §3). Keep logic in the services.
 */
export default class CalendarDriver implements Driver {
  readonly selectors: SelectorRegistry<CalendarSelectorKey>;
  /** Resolves once user info is available and routing has started. */
  readonly onready: Promise<void>;
  readonly #appId: string;
  readonly #stopper: Stopper = kefirStopper();
  #userInfo: UserInfo | null = null;
  #routeService: RouteService | null = null;
  #eventRegistry: EventRegistry | null = null;
  #destroyed = false;

  constructor(appId: string, options: CalendarDriverOptions = {}) {
    this.#appId = appId;
    this.selectors = new SelectorRegistry<CalendarSelectorKey>(
      CALENDAR_SELECTORS,
      {
        overrides: options.selectorOverrides,
        onInvalidSelector: options.onInvalidSelector,
      },
    );
    this.onready = this.#start(options.readyTimeoutMs ?? 15_000);
  }

  async #start(timeoutMs: number): Promise<void> {
    try {
      this.#userInfo = await waitFor(
        () => readUserInfo(document),
        timeoutMs,
        100,
      );
    } catch (err) {
      throw new Error(
        "CalendarSDK: Google Calendar's user info (#xUserInfo) did not appear " +
          `within ${timeoutMs} ms. Is this a signed-in Calendar page?`,
        { cause: err },
      );
    }
    if (this.#destroyed) return;
    this.#routeService = new RouteService({
      document,
      location,
      window,
      navigation: (globalThis as any).navigation,
      onDisagreement: (input, descriptor) =>
        reportEvent('route-disagreement', { input, type: descriptor.type }),
    });
    this.#routeService.start();
    // A route change rebuilds the grid: re-check every chip.
    this.#routeService.subscribe(() => this.#eventRegistry?.reconcileAll());
    this.#eventRegistry = new EventRegistry(document, this.selectors);
    this.#eventRegistry.start();
  }

  getAppId(): string {
    return this.#appId;
  }

  getStopper(): Stopper {
    return this.#stopper;
  }

  getUserInfo(): UserInfo {
    if (!this.#userInfo) throw new Error('CalendarDriver is not ready');
    return this.#userInfo;
  }

  getCurrentRouteViewDriver(): RouteViewDriver {
    if (!this.#routeService) throw new Error('CalendarDriver is not ready');
    return this.#routeService.getCurrent();
  }

  onRouteViewDriver(cb: (driver: RouteViewDriver) => void): () => void {
    if (!this.#routeService) throw new Error('CalendarDriver is not ready');
    return this.#routeService.subscribe(cb);
  }

  getEventViewDrivers(): EventViewDriver[] {
    if (!this.#eventRegistry) throw new Error('CalendarDriver is not ready');
    return this.#eventRegistry.getAll();
  }

  onEventViewDriver(cb: (driver: EventViewDriver) => void): () => void {
    if (!this.#eventRegistry) throw new Error('CalendarDriver is not ready');
    return this.#eventRegistry.subscribe(cb);
  }

  destroy(): void {
    this.#destroyed = true;
    this.#eventRegistry?.stop();
    this.#routeService?.stop();
    this.#stopper.destroy();
  }
}
