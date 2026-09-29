/** Kinds of pages the SDK distinguishes. Values are part of the public API. */
export const RouteType = Object.freeze({
  DAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
  YEAR: 'YEAR',
  /** Calendar calls this "Schedule". */
  AGENDA: 'AGENDA',
  /** The "N days" / custom-days view. */
  CUSTOM_DAYS: 'CUSTOM_DAYS',
  SEARCH: 'SEARCH',
  /** The full-page event editor (`/r/eventedit/…`). */
  EVENT_EDIT: 'EVENT_EDIT',
  /** Any settings page. */
  SETTINGS: 'SETTINGS',
  UNKNOWN: 'UNKNOWN',
});
export type RouteType = (typeof RouteType)[keyof typeof RouteType];
