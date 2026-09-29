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
  /** On an EVENT_EDIT route of an existing item, which item; else null. */
  getEventRef(): EventRef | null;
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

export type EventKind = 'event' | 'task' | 'birthday' | 'unknown';

/** Identifies one calendar item, or one instance of a recurring one. */
export interface EventRef {
  /** Base id; for a recurring event the series id. */
  eventId: string;
  /** Recurring instances: original start (`20260929T110000Z`, UTC) or all-day date (`20260930`). */
  instanceId?: string;
  /** Full id of the calendar this copy lives on, or null when only the hint is known. */
  calendarId: string | null;
  /** Calendar id as abbreviated in Calendar's DOM (e.g. `owner@m`). */
  calendarIdHint: string;
  kind: EventKind;
  /** Calendar's own token; `/r/eventedit/<rawId>` opens the editor. */
  rawId: string;
  confidence: 'exact' | 'derived';
}

export interface BadgeDescriptor {
  /** Short text. At least one of `text` and `iconUrl` is required. */
  text?: string;
  /** `data:` URL, `chrome-extension://` web-accessible resource or https image. */
  iconUrl?: string;
  title?: string;
  /** Called when the badge is clicked; the click does not open Calendar's popover. */
  onClick?: (eventView: EventView) => void;
}

export interface BadgeHandle {
  update(changes: Partial<BadgeDescriptor>): void;
  remove(): void;
}

/** One rendered chip of a calendar item. */
export interface EventView {
  readonly destroyed: boolean;
  /** Never changes for the lifetime of a view. */
  getEventRef(): EventRef;
  /** Which chip of a multi-day event this is; recomputed on every call. */
  getSegment(): { index: number; count: number; isPrimary: boolean };
  /** Recomputed on every call (dragging can flip timed/all-day). */
  isAllDay(): boolean;
  /**
   * Show a badge on this chip. Calendar strips foreign nodes on re-render, so the SDK
   * re-inserts it whenever it disappears; it is removed with the view.
   */
  addBadge(descriptor: BadgeDescriptor): BadgeHandle;
  on(event: 'destroy', listener: () => void): this;
}

export interface PopoverButtonDescriptor {
  /** Button label. */
  title: string;
  /** Optional icon shown before the label (`data:`, `chrome-extension://` or https URL). */
  iconUrl?: string;
  /** Called when the button is clicked; the popover stays open. */
  onClick: (popoverView: EventPopoverView) => void;
}

export interface PopoverButtonHandle {
  update(changes: Partial<PopoverButtonDescriptor>): void;
  remove(): void;
}

/** The popover Calendar shows for one event; ends when it closes. */
export interface EventPopoverView {
  readonly destroyed: boolean;
  /** Never changes for the lifetime of a view. */
  getEventRef(): EventRef;
  /** Add a button; the SDK keeps it in place if Calendar re-renders the popover. */
  addButton(descriptor: PopoverButtonDescriptor): PopoverButtonHandle;
  on(event: 'destroy', listener: () => void): this;
}

/**
 * The full-page event editor; lives exactly as long as the EVENT_EDIT route.
 * `saveClicked` means the Save button was clicked, not that the event was
 * saved (Calendar may still ask about guests or the recurring scope).
 */
export interface EventEditorView {
  readonly destroyed: boolean;
  /** The item being edited; null when creating a new event. */
  getEventRef(): EventRef | null;
  isNewEvent(): boolean;
  /** Current text of the title field, or null while it is not on the page. */
  getTitle(): string | null;
  on(event: 'titleChange', listener: (title: string) => void): this;
  on(event: 'saveClicked', listener: () => void): this;
  on(event: 'destroy', listener: () => void): this;
}

export interface Events {
  /**
   * Called for every chip already on the page and every later one; returns an
   * unregister function. Default kinds: `['event']`.
   */
  registerEventViewHandler(
    handler: (eventView: EventView) => void,
    options?: { kinds?: EventKind[] },
  ): () => void;
  /**
   * Called for every event popover open now and every one that opens later.
   * Same `kinds` semantics (default `['event']`).
   */
  registerEventPopoverHandler(
    handler: (popoverView: EventPopoverView) => void,
    options?: { kinds?: EventKind[] },
  ): () => void;
  /** Called for the current editor route and every later one; returns an unregister function. */
  registerEventEditorHandler(
    handler: (editorView: EventEditorView) => void,
  ): () => void;
}

export interface CalendarSDK {
  readonly Events: Events;
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
