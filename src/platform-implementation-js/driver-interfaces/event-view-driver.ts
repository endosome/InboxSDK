import type { Stopper } from 'kefir-stopper';

export type EventKind = 'event' | 'task' | 'birthday' | 'unknown';

/** Identifies one calendar item (or one instance of a recurring one). */
export type EventRef = {
  /** Base id; for a recurring event this is the series id (no instance suffix). */
  eventId: string;
  /** Recurring instances only: original start (`20260929T110000Z`, UTC) or all-day date (`20260930`). */
  instanceId?: string;
  /** Full id of the calendar this copy lives on, or null when only the hint is known. */
  calendarId: string | null;
  /** Calendar id as Calendar abbreviates it in `data-eventid` (e.g. `owner@m`). */
  calendarIdHint: string;
  kind: EventKind;
  /** The `data-eventid` token; `/r/eventedit/<rawId>` opens the editor. */
  rawId: string;
  /** `exact`: decoded from the DOM. */
  confidence: 'exact' | 'derived';
};

export type EventSegment = { index: number; count: number; isPrimary: boolean };

export type BadgeDescriptor = {
  /** Short text shown in the badge. At least one of `text` and `iconUrl` is required. */
  text?: string;
  /** Icon URL: a `data:` URL, a `chrome-extension://` web-accessible resource or any https image. */
  iconUrl?: string;
  /** Tooltip. */
  title?: string;
  /** Called when the badge is clicked (the click does not open Calendar's popover). */
  onClick?: () => void;
};

/** Returned by `addBadge`. */
export type BadgeHandle = {
  update(changes: Partial<BadgeDescriptor>): void;
  remove(): void;
};

export type HoverCardContext = { signal: AbortSignal };

export type HoverCardDescriptor = {
  /**
   * Fill `container` (fresh for every showing). May be async and may return a cleanup
   * function; `signal` aborts when the card hides or the pointer moves to another chip.
   */
  render(
    container: HTMLElement,
    context: HoverCardContext,
  ): void | (() => void) | Promise<void | (() => void)>;
  /** Hover time before showing, ms (default 350, clamped to 0–2000). */
  delayMs?: number;
  /** Let the pointer move from the chip onto the card. Default false. */
  interactive?: boolean;
  /** Accessible name of the card. */
  label?: string;
};

/** Returned by `addHoverCard`. */
export type HoverCardHandle = {
  update(changes: Partial<HoverCardDescriptor>): void;
  remove(): void;
};

/** What the public `EventView` needs from a site driver. */
export interface EventViewDriver {
  getEventRef(): EventRef;
  /** Which of the (possibly several) chips of this event this is. Recomputed on every call. */
  getSegment(): EventSegment;
  /** Derived per call: the same event can flip between all-day and timed. */
  isAllDay(): boolean;
  addBadge(descriptor: BadgeDescriptor): BadgeHandle;
  addHoverCard(descriptor: HoverCardDescriptor): HoverCardHandle;
  /** Ends when the chip goes away or stops being this event. */
  getStopper(): Stopper;
}
