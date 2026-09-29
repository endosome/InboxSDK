/**
 * Bundled Google Calendar selector registry (declarative data).
 *
 * Each key maps to an ORDERED list of candidates, tried one at a time until one
 * matches; extensions may PREPEND candidates through `selectorOverrides`. Order
 * candidates by preference (most semantic first), never chronologically, and
 * never join a chain into one comma-separated selector (`querySelector('a, b')`
 * ignores the ranking). Locale-dependent (aria-label) rungs go last.
 *
 * Every entry below was verified against live Calendar (see
 * docs/calendar-reverse-engineering.md §8). Add keys as views are implemented.
 */
export const CALENDAR_SELECTORS = {
  /** Grid content root; chips and dates live below it. */
  mainRegion: ['[role=main]'],
  /** An event chip (also tasks and birthdays; they differ by id prefix). */
  eventChip: ['[data-eventchip]'],
  /** Any element carrying the locale-independent day key (carrier varies by view). */
  dateCell: ['[data-datekey]'],
  /** Empty host that receives popovers and dialogs while they are open. */
  overlayHost: ['#yDmH0d'],
  /** Existing-event popover; `data-eventid` alone does not discriminate (RE §1.7). */
  eventPopover: [
    '[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]',
  ],
  /** Any dialog of Calendar's "chips" family; the popover test above narrows it. */
  chipsDialog: ['[role=dialog][data-chips-dialog]'],
  /**
   * The popover's outermost element carrying `data-eventid`: it holds the
   * event's id and is the content root (header, body, footer) we inject into.
   * Root: an event popover.
   */
  popoverEventIdNode: ['[data-eventid]'],
  /** Popover action buttons (absent on read-only shared events, RE §1.5). */
  popoverEditButton: [
    '[role=dialog] button[jsname=DyVDA]',
    '[role=dialog] button[aria-label="Edit event"]',
  ],
  popoverDeleteButton: [
    '[role=dialog] button[jsname=VkLyEc]',
    '[role=dialog] button[aria-label="Delete event"]',
  ],
  /** Editor route controls. */
  editorSave: ['[jsname=x8hlje]'],
  editorCancel: ['[jsname=gQ2Xie]'],
  /** Top header bar. */
  appHeader: ['header#gb[role=banner]', 'header[role=banner]'],
} as const satisfies Record<string, readonly string[]>;

export type CalendarSelectorKey = keyof typeof CALENDAR_SELECTORS;

/** Shape of `selectorOverrides` accepted by `load()`. */
export type SelectorOverrides = Partial<
  Record<CalendarSelectorKey, readonly string[]>
>;
