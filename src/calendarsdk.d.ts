/**
 * Public types of @calendarsdk/core. Handwritten so that the public surface is
 * decoupled from internal classes.
 */
export const LOADER_VERSION: string;

export interface Reporter {
  error(err: unknown, details?: unknown): void;
  event(name: string, details?: unknown): void;
}

export interface AppLogger {
  error(err: Error | unknown, details?: any): void;
  event(name: string, details?: any): void;
}

export interface LoadOptions {
  /** Opaque namespace for your extension. */
  appId: string;
  /** Extra selector candidates PREPENDED to the SDK's bundled chains. */
  selectorOverrides?: Record<string, readonly string[]>;
  /** Called for each override selector dropped as invalid CSS in this browser. */
  onInvalidSelector?: (key: string, selector: string) => void;
  /** Receives SDK diagnostics; defaults to the console. Nothing is sent anywhere. */
  reporter?: Reporter;
  /** How long to wait for Calendar to render before load() rejects (default 15000). */
  readyTimeoutMs?: number;
}

export type RouteType =
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'YEAR'
  | 'AGENDA'
  | 'CUSTOM_DAYS'
  | 'SEARCH'
  | 'EVENT_EDIT'
  | 'SETTINGS'
  | 'UNKNOWN';

/** A page the user is on. A new one is created when type, date or query change. */
export interface RouteView {
  readonly destroyed: boolean;
  getType(): RouteType;
  /** `YYYY-MM-DD` from the URL, or null (e.g. right after "Today"). */
  getAnchorDate(): string | null;
  /** The query of a SEARCH route, else null. */
  getSearchQuery(): string | null;
  on(event: 'destroy', listener: () => void): this;
}

export interface Router {
  readonly RouteTypes: { readonly [K in RouteType]: K };
  getCurrentRouteView(): RouteView;
  /** Called for the current route and every later one; returns an unregister function. */
  registerRouteViewHandler(handler: (routeView: RouteView) => void): () => void;
}

export interface User {
  getEmailAddress(): string;
  /** UI language, e.g. `en`. */
  getLanguage(): string;
  /** IANA time zone of the calendar, e.g. `Europe/Warsaw`, or null. */
  getTimeZone(): string | null;
}

export interface CalendarSDK {
  readonly Router: Router;
  readonly User: User;
  readonly LOADER_VERSION: string;
  readonly IMPL_VERSION: string;
  readonly Logger: AppLogger;
  readonly destroyed: boolean;
  destroy(): void;
  on(event: 'destroy', listener: () => void): this;
}

export function load(version: 1, opts: LoadOptions): Promise<CalendarSDK>;

declare const CalendarSDK: {
  load: typeof load;
  LOADER_VERSION: string;
};
export { CalendarSDK };
export default CalendarSDK;
