/** Never contains titles, ids, emails or any other user data. */
export type CompatIssue = {
  severity: 'hard' | 'warning' | 'info';
  /** Stable machine name, e.g. `selector-miss`, `identity-decode-failed`. */
  check: string;
  selectorKey?: string;
  /** Index of the rung that matched (0 = the preferred selector). */
  rungIndex?: number;
  count?: number;
};

export type SelectorStatus =
  /** The preferred (first) candidate matched. */
  | 'ok'
  /** A later candidate matched: the preferred selector no longer does. */
  | 'fallback'
  /** Nothing matched although the element must be there. */
  | 'miss'
  /** Nothing matched and nothing says it should (e.g. an empty week). */
  | 'unverified'
  /** Its part of the page is not showing. */
  | 'inactive';

export type SelectorResult = {
  key: string;
  status: SelectorStatus;
  rungIndex: number | null;
  count: number;
};

export type CompatReport = {
  /** What the page looked like: `<lang>/<ui-kind>/<view key>`. */
  variant: string;
  checkedAt: string;
  issues: CompatIssue[];
  selectors: SelectorResult[];
  /** Structural fingerprints (tag + attribute NAMES only, never text or values) by landmark. */
  structure: Record<string, string>;
};
