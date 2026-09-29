import { RouteType } from '../../constants/router';
import type { EventRef } from '../../driver-interfaces/event-view-driver';

export type GotoTarget =
  | {
      type: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'AGENDA' | 'CUSTOM_DAYS';
      /** `YYYY-MM-DD`; omit for "today". */
      date?: string;
    }
  | { type: 'SEARCH'; query: string }
  /** Opens the full-page editor of this event. */
  | EventRef;

const SEGMENTS: Readonly<Record<string, string>> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  AGENDA: 'agenda',
  CUSTOM_DAYS: 'customday',
};

/** What the page is expected to become; used to know when a navigation has happened. */
export type ExpectedRoute = {
  type: RouteType;
  eventRawId: string | null;
  searchQuery: string | null;
};

function isEventRef(t: GotoTarget): t is EventRef {
  return typeof (t as EventRef).rawId === 'string';
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const bad = () =>
    new Error(`Router.goto: invalid date "${date}" (want YYYY-MM-DD)`);
  if (!m) throw bad();
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    throw bad();
  }
  return [y, mo, d];
}

/**
 * The URL (path + query) for a target, keeping the account (`/u/<n>/`) of the
 * current page. Throws for targets that cannot be navigated to.
 */
export function buildRouteUrl(
  target: GotoTarget,
  currentPathname: string,
): { url: string; expected: ExpectedRoute } {
  const prefix =
    /^\/calendar\/(u\/\d+\/)?/.exec(currentPathname)?.[0] ?? '/calendar/';
  if (!target || typeof target !== 'object') {
    throw new Error('Router.goto: a target is required');
  }
  if (isEventRef(target)) {
    if (target.kind !== 'event') {
      throw new Error(
        `Router.goto: only events open in the editor (got ${String(
          target.kind,
        )})`,
      );
    }
    if (!target.rawId)
      throw new Error('Router.goto: the EventRef has no rawId');
    return {
      url: `${prefix}r/eventedit/${encodeURIComponent(target.rawId)}`,
      expected: {
        type: RouteType.EVENT_EDIT,
        eventRawId: target.rawId,
        searchQuery: null,
      },
    };
  }
  if (target.type === 'SEARCH') {
    if (typeof target.query !== 'string' || !target.query) {
      throw new Error('Router.goto: SEARCH needs a non-empty query');
    }
    return {
      url: `${prefix}r/search?q=${encodeURIComponent(target.query)}`,
      expected: {
        type: RouteType.SEARCH,
        eventRawId: null,
        searchQuery: target.query,
      },
    };
  }
  const segment = SEGMENTS[target.type];
  if (!segment) {
    throw new Error(`Router.goto: cannot navigate to ${String(target.type)}`);
  }
  const date = target.date
    ? '/' + parseDate(target.date).join('/') // Calendar writes them unpadded
    : '';
  return {
    url: `${prefix}r/${segment}${date}`,
    expected: {
      type: RouteType[target.type],
      eventRawId: null,
      searchQuery: null,
    },
  };
}
