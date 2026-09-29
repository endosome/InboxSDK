import { RouteType } from '../../constants/router';

/**
 * Raw, DOM-derived inputs for route classification. `viewKey`/`viewFamily` come
 * from `<body data-viewkey>` / `<body data-viewfamily>`, which — unlike
 * `<html data-prefetch-view-key>` — are updated by in-app navigation
 * (docs/calendar-reverse-engineering.md §1.18).
 */
export type RouteInput = {
  viewKey: string | null;
  viewFamily: string | null;
  pathname: string;
  search: string;
};

export type RouteDescriptor = {
  type: RouteType;
  /** `YYYY-MM-DD` from the URL, or null for dateless URLs (e.g. after "Today"). */
  anchorDate: string | null;
  /** `q` of a search route. */
  searchQuery: string | null;
};

export type Classification = {
  descriptor: RouteDescriptor;
  /** False while the URL and the body attributes describe different routes. */
  agrees: boolean;
  /** True when the body attributes were missing and the type came from the URL. */
  usedPathFallback: boolean;
};

const VIEW_KEY_TO_TYPE: Readonly<Record<string, RouteType>> = {
  DAY: RouteType.DAY,
  WEEK: RouteType.WEEK,
  MONTH: RouteType.MONTH,
  YEAR: RouteType.YEAR,
  AGENDA: RouteType.AGENDA,
  CUSTOM_DAYS: RouteType.CUSTOM_DAYS,
  SEARCH: RouteType.SEARCH,
  EVENTEDIT: RouteType.EVENT_EDIT,
};

const PATH_SEGMENT_TO_TYPE: Readonly<Record<string, RouteType>> = {
  day: RouteType.DAY,
  week: RouteType.WEEK,
  month: RouteType.MONTH,
  year: RouteType.YEAR,
  agenda: RouteType.AGENDA,
  // `/r/customweek` is rewritten by Calendar to `/r/customday`
  customday: RouteType.CUSTOM_DAYS,
  customweek: RouteType.CUSTOM_DAYS,
  search: RouteType.SEARCH,
  eventedit: RouteType.EVENT_EDIT,
  settings: RouteType.SETTINGS,
};

// /calendar/u/0/r/week/2026/9/30  (the `u/<n>/` part is optional)
const PATH_RE = /^\/calendar\/(?:u\/\d+\/)?r(?:\/([^/]+))?(?:\/(.*))?$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseAnchorDate(rest: string | undefined): string | null {
  const m = rest?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
  if (!m) return null;
  const [year, month, day] = [+m[1], +m[2], +m[3]];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** What the URL alone says about the route (null segment = unknown/root path). */
export function classifyPath(pathname: string): {
  type: RouteType | null;
  anchorDate: string | null;
} {
  const m = pathname.match(PATH_RE);
  if (!m) return { type: null, anchorDate: null };
  const type = m[1] ? PATH_SEGMENT_TO_TYPE[m[1]] ?? null : null;
  const dated =
    type === RouteType.DAY ||
    type === RouteType.WEEK ||
    type === RouteType.MONTH ||
    type === RouteType.YEAR ||
    type === RouteType.AGENDA ||
    type === RouteType.CUSTOM_DAYS;
  return { type, anchorDate: dated ? parseAnchorDate(m[2]) : null };
}

function typeFromBody(input: RouteInput): RouteType | null {
  if (input.viewFamily === 'SETTINGS') return RouteType.SETTINGS;
  if (input.viewKey == null) return null;
  return VIEW_KEY_TO_TYPE[input.viewKey] ?? RouteType.UNKNOWN;
}

/**
 * Classify the current page. The body attributes are authoritative; the URL
 * supplies the date/query and is used to detect the (brief) window in which
 * Calendar has updated the URL but not yet the DOM.
 */
export function classifyRoute(input: RouteInput): Classification {
  const fromBody = typeFromBody(input);
  const fromPath = classifyPath(input.pathname);
  const type = fromBody ?? fromPath.type ?? RouteType.UNKNOWN;
  const searchQuery =
    type === RouteType.SEARCH
      ? new URLSearchParams(input.search).get('q')
      : null;
  return {
    descriptor: { type, anchorDate: fromPath.anchorDate, searchQuery },
    // no path opinion (root/unknown path) or no body opinion => nothing to disagree about
    agrees:
      fromBody == null ||
      fromPath.type == null ||
      fromBody === RouteType.UNKNOWN ||
      fromBody === fromPath.type,
    usedPathFallback: fromBody == null && fromPath.type != null,
  };
}

export function routeKey(d: RouteDescriptor): string {
  return `${d.type}|${d.anchorDate ?? ''}|${d.searchQuery ?? ''}`;
}
