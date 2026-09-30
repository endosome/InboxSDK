import { BUILD_VERSION } from '../common/version';
import SafeEventEmitter from './lib/safe-event-emitter';
import { reportError, reportEvent, setReporter } from './lib/reporter';
import type { AppLogger, Reporter } from './lib/reporter';
import type { Driver } from './driver-interfaces/driver';
import CalendarDriver from './dom-driver/google-calendar/calendar-driver';
import CalendarRouteViewDriver from './dom-driver/google-calendar/views/calendar-route-view-driver';
import Membrane from './lib/Membrane';
import CalendarEventViewDriver from './dom-driver/google-calendar/views/calendar-event-view-driver';
import CalendarEventPopoverViewDriver from './dom-driver/google-calendar/views/calendar-event-popover-view-driver';
import CalendarEventEditorViewDriver from './dom-driver/google-calendar/views/calendar-event-editor-view-driver';
import EventEditorView from './views/event-editor-view';
import EventPopoverView from './views/event-popover-view';
import RouteView from './views/route-view/route-view';
import EventView from './views/event-view';
import Toolbar from './namespaces/toolbar';
import Data from './namespaces/data';
import type { CalendarDataProvider } from './driver-interfaces/data-provider';
import Compat from './namespaces/compat';
import type { CompatIssue } from './compat/types';
import Events from './namespaces/events';
import Router from './namespaces/router';
import User from './namespaces/user';
import type { SelectorOverrides } from './dom-driver/google-calendar/selectors';
import type { InvalidSelectorReporter } from './lib/dom/mergeSelectorOverrides';

const TAKEOVER_ATTR = 'data-calsdk-takeover';
const TAKEOVER_EVENT = 'calsdk-takeover';

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
  /** Optional source of event details, owned by the extension (OAuth stays outside the SDK). */
  dataProvider?: CalendarDataProvider;
  /** Called for each selector/identity problem found by the local self-check. */
  onCompatIssue?: (issue: CompatIssue) => void;
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
  readonly Events: Events;
  readonly Router: Router;
  readonly User: User;
  readonly Compat: Compat;
  readonly Data: Data;
  readonly Toolbar: Toolbar;
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
      [CalendarEventViewDriver, (d) => new EventView(d)],
      [CalendarEventPopoverViewDriver, (d) => new EventPopoverView(d)],
      [CalendarEventEditorViewDriver, (d) => new EventEditorView(d)],
    ]);
    this.Events = new Events(driver, membrane);
    this.Router = new Router(driver, membrane);
    this.User = new User(driver);
    this.Compat = new Compat(driver);
    this.Data = new Data(opts.dataProvider);
    if (opts.onCompatIssue) this.Compat.onIssue(opts.onCompatIssue);
    this.Toolbar = new Toolbar(driver);
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

  // One live SDK per appId: a newer load() replaces an older one, even across
  // script realms (an extension that was reloaded leaves its old content script
  // running), so the page never gets two sets of injected nodes for one app.
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let superseded = false;
  let live: PlatformImplementation | null = null;
  const onTakeover = () => {
    const [appId, other] = (
      document.documentElement.getAttribute(TAKEOVER_ATTR) ?? ''
    ).split('\n');
    if (appId === opts.appId && other !== token) {
      superseded = true;
      live?.destroy();
    }
  };
  document.addEventListener(TAKEOVER_EVENT, onTakeover);
  document.documentElement.setAttribute(
    TAKEOVER_ATTR,
    `${opts.appId}\n${token}`,
  );
  document.dispatchEvent(new Event(TAKEOVER_EVENT));

  const driver = new CalendarDriver(opts.appId, {
    selectorOverrides: opts.selectorOverrides,
    onInvalidSelector: opts.onInvalidSelector,
    readyTimeoutMs: opts.readyTimeoutMs,
  });
  return driver.onready.then(
    () => {
      if (superseded) {
        driver.destroy();
        document.removeEventListener(TAKEOVER_EVENT, onTakeover);
        throw new Error(
          `CalendarSDK: load() for appId "${opts.appId}" was superseded by a newer load() of the same appId`,
        );
      }
      live = new PlatformImplementation(driver, opts);
      live.on('destroy', () =>
        document.removeEventListener(TAKEOVER_EVENT, onTakeover),
      );
      return live;
    },
    (err) => {
      document.removeEventListener(TAKEOVER_EVENT, onTakeover);
      driver.destroy();
      throw err;
    },
  );
}
