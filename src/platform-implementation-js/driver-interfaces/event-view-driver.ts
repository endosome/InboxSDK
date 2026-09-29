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

/** What the public `EventView` needs from a site driver. */
export interface EventViewDriver {
  getEventRef(): EventRef;
  /** Which of the (possibly several) chips of this event this is. Recomputed on every call. */
  getSegment(): EventSegment;
  /** Derived per call: the same event can flip between all-day and timed. */
  isAllDay(): boolean;
  /** Ends when the chip goes away or stops being this event. */
  getStopper(): Stopper;
}
