import { BUILD_VERSION } from '../common/version';
import SafeEventEmitter from './lib/safe-event-emitter';
import { reportError, reportEvent, setReporter } from './lib/reporter';
import type { AppLogger, Reporter } from './lib/reporter';
import type { Driver } from './driver-interfaces/driver';
import CalendarDriver from './dom-driver/google-calendar/calendar-driver';
import CalendarRouteViewDriver from './dom-driver/google-calendar/views/calendar-route-view-driver';
import Membrane from './lib/Membrane';
import RouteView from './views/route-view/route-view';
import Router from './namespaces/router';
import User from './namespaces/user';
import type { SelectorOverrides } from './dom-driver/google-calendar/selectors';
import type { InvalidSelectorReporter } from './lib/dom/mergeSelectorOverrides';

export const CALENDAR_ORIGIN = 'https://calendar.google.com';

/** API versions this implementation can serve. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [1];

export type PiOpts = {
  /** Opaque namespace for the embedding extension. */
  appId: string;
  /** Additional selector candidates to PREPEND to the bundled chains. */
  selectorOverrides?: SelectorOverrides;
  /** Fires for each override candidate dropped as invalid CSS in this browser. */
  onInvalidSelector?: InvalidSelectorReporter;
  /** Where diagnostics go; defaults to the console. Nothing is sent anywhere. */
  reporter?: Reporter;
  /** How long to wait for Calendar to render before load() rejects (default 15000). */
  readyTimeoutMs?: number;
  REQUESTED_API_VERSION: number;
  VERSION: string;
};

export class PlatformImplementation extends SafeEventEmitter {
  destroyed = false;
  readonly LOADER_VERSION: string;
  readonly IMPL_VERSION: string = BUILD_VERSION;
  readonly Logger: AppLogger;
  readonly Router: Router;
  readonly User: User;
  readonly #driver: Driver;

  constructor(driver: Driver, opts: PiOpts) {
    super();
    this.#driver = driver;
    this.LOADER_VERSION = opts.VERSION;
    this.Logger = {
      error: (err, details) => reportError(err, details),
      event: (name, details) => reportEvent(name, details),
    };
    const membrane = new Membrane([
      [CalendarRouteViewDriver, (d) => new RouteView(d)],
    ]);
    this.Router = new Router(driver, membrane);
    this.User = new User(driver);
    // Events, Toolbar and Compat are added in later phases.
  }

  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.#driver.destroy();
      this.emit('destroy');
    }
  }
}

/** The origin the SDK is running on (overridable under Jest only). */
function getPageOrigin(): string {
  return (
    (process.env.NODE_ENV === 'test' && globalThis.__test_origin) ||
    document.location.origin
  );
}

declare global {
  var __test_origin: string | undefined;
}

export function makePlatformImplementation(
  opts: PiOpts,
): Promise<PlatformImplementation> {
  if (typeof opts?.appId !== 'string' || !opts.appId) {
    throw new Error('CalendarSDK: appId must be a non-empty string');
  }
  if (!SUPPORTED_API_VERSIONS.includes(opts.REQUESTED_API_VERSION)) {
    throw new Error(
      `CalendarSDK: unsupported API version ${opts.REQUESTED_API_VERSION}`,
    );
  }
  const origin = getPageOrigin();
  if (origin !== CALENDAR_ORIGIN) {
    // Reject loudly: silently never resolving hides a misconfigured manifest.
    throw new Error(
      `CalendarSDK only runs on ${CALENDAR_ORIGIN} (current origin: ${origin})`,
    );
  }

  if (opts.reporter) setReporter(opts.reporter);
  const driver = new CalendarDriver(opts.appId, {
    selectorOverrides: opts.selectorOverrides,
    onInvalidSelector: opts.onInvalidSelector,
    readyTimeoutMs: opts.readyTimeoutMs,
  });
  return driver.onready.then(
    () => new PlatformImplementation(driver, opts),
    (err) => {
      driver.destroy();
      throw err;
    },
  );
}
