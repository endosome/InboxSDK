import { classifyPath, classifyRoute, routeKey } from './route-classifier';
import { RouteType } from '../../constants/router';

const input = (
  pathname: string,
  viewKey: string | null,
  viewFamily: string | null,
  search = '',
) => ({ pathname, viewKey, viewFamily, search });

describe('classifyRoute: verified body keys (docs RE §1.18)', () => {
  test.each([
    ['/calendar/u/0/r/day/2026/9/30', 'DAY', 'EVENT', RouteType.DAY],
    ['/calendar/u/0/r/week/2026/9/30', 'WEEK', 'EVENT', RouteType.WEEK],
    ['/calendar/u/0/r/month/2026/9/30', 'MONTH', 'EVENT', RouteType.MONTH],
    ['/calendar/u/0/r/year/2026/9/30', 'YEAR', 'EVENT', RouteType.YEAR],
    ['/calendar/u/0/r/agenda/2026/9/30', 'AGENDA', 'EVENT', RouteType.AGENDA],
    [
      '/calendar/u/0/r/customday/2026/9/30',
      'CUSTOM_DAYS',
      'EVENT',
      RouteType.CUSTOM_DAYS,
    ],
    ['/calendar/u/0/r/search', 'SEARCH', 'SEARCH', RouteType.SEARCH],
    [
      '/calendar/u/0/r/eventedit/abc',
      'EVENTEDIT',
      'EVENT_EDIT',
      RouteType.EVENT_EDIT,
    ],
    [
      '/calendar/u/0/r/settings',
      'GENERALSETTINGS',
      'SETTINGS',
      RouteType.SETTINGS,
    ],
    [
      '/calendar/u/0/r/settings/createcalendar',
      'CREATECALENDAR',
      'SETTINGS',
      RouteType.SETTINGS,
    ],
    [
      '/calendar/u/0/r/settings/calendar/abc',
      'CALENDARSETTINGS',
      'SETTINGS',
      RouteType.SETTINGS,
    ],
  ])('%s (%s/%s) → %s', (path, key, family, type) => {
    const c = classifyRoute(input(path, key, family));
    expect(c.descriptor.type).toBe(type);
    expect(c.agrees).toBe(true);
    expect(c.usedPathFallback).toBe(false);
  });

  test('an unknown body key is UNKNOWN, not a guess', () => {
    const c = classifyRoute(
      input('/calendar/u/0/r/week/2026/9/30', 'SOMETHING_NEW', 'EVENT'),
    );
    expect(c.descriptor.type).toBe(RouteType.UNKNOWN);
    // an unknown key has no opinion to contradict the URL
    expect(c.agrees).toBe(true);
  });
});

describe('dates and queries come from the URL', () => {
  test('anchor date is zero-padded ISO', () => {
    expect(
      classifyRoute(input('/calendar/u/0/r/week/2026/9/3', 'WEEK', 'EVENT'))
        .descriptor.anchorDate,
    ).toBe('2026-09-03');
  });

  test('dateless URL (after "Today") has no anchor date', () => {
    expect(
      classifyRoute(input('/calendar/u/0/r/week', 'WEEK', 'EVENT')).descriptor
        .anchorDate,
    ).toBe(null);
  });

  test('impossible dates are rejected', () => {
    expect(classifyPath('/calendar/u/0/r/day/2026/13/40').anchorDate).toBe(
      null,
    );
  });

  test('the u/<n> part is optional', () => {
    expect(classifyPath('/calendar/r/month/2026/1/2')).toEqual({
      type: RouteType.MONTH,
      anchorDate: '2026-01-02',
      eventRawId: null,
    });
  });

  test('search query only on SEARCH routes', () => {
    expect(
      classifyRoute(
        input('/calendar/u/0/r/search', 'SEARCH', 'SEARCH', '?q=hi'),
      ).descriptor.searchQuery,
    ).toBe('hi');
    expect(
      classifyRoute(
        input('/calendar/u/0/r/week/2026/9/30', 'WEEK', 'EVENT', '?q=hi'),
      ).descriptor.searchQuery,
    ).toBe(null);
  });

  test('editor and settings never have an anchor date', () => {
    expect(classifyPath('/calendar/u/0/r/eventedit/2026/9/30').anchorDate).toBe(
      null,
    );
  });
});

describe('URL leads the DOM during transitions', () => {
  test('URL says MONTH, body still says WEEK → disagree, body wins', () => {
    const c = classifyRoute(
      input('/calendar/u/0/r/month/2026/9/30', 'WEEK', 'EVENT'),
    );
    expect(c.agrees).toBe(false);
    expect(c.descriptor.type).toBe(RouteType.WEEK);
  });

  test('missing body attributes fall back to the URL and say so', () => {
    const c = classifyRoute(input('/calendar/u/0/r/day/2026/9/30', null, null));
    expect(c.descriptor.type).toBe(RouteType.DAY);
    expect(c.usedPathFallback).toBe(true);
    expect(c.agrees).toBe(true);
  });

  test('root path with a body key is fine', () => {
    const c = classifyRoute(input('/calendar/u/0/r', 'WEEK', 'EVENT'));
    expect(c.descriptor.type).toBe(RouteType.WEEK);
    expect(c.agrees).toBe(true);
  });

  test('customweek in the URL means CUSTOM_DAYS', () => {
    expect(classifyPath('/calendar/u/0/r/customweek/2026/9/30').type).toBe(
      RouteType.CUSTOM_DAYS,
    );
  });
});

test('routeKey differs when type, date or query differ', () => {
  const a = {
    type: RouteType.WEEK,
    anchorDate: '2026-09-30',
    searchQuery: null,
    eventRawId: null,
  };
  expect(routeKey(a)).toBe(routeKey({ ...a }));
  expect(routeKey(a)).not.toBe(routeKey({ ...a, anchorDate: '2026-10-07' }));
  expect(routeKey(a)).not.toBe(routeKey({ ...a, type: RouteType.MONTH }));
  expect(routeKey(a)).not.toBe(routeKey({ ...a, searchQuery: 'x' }));
  expect(routeKey(a)).not.toBe(routeKey({ ...a, eventRawId: 'abc' }));
});

describe('editor route identity', () => {
  const editor = (path: string, key: string | null = 'EVENTEDIT') =>
    classifyRoute(input(path, key, key ? 'EVENT_EDIT' : null)).descriptor;

  test('takes the token from /r/eventedit/<token>', () => {
    expect(editor('/calendar/u/0/r/eventedit/abc_DEF-1').eventRawId).toBe(
      'abc_DEF-1',
    );
    expect(editor('/calendar/r/eventedit/tok/').eventRawId).toBe('tok');
  });

  test('a new-event editor (/r/eventedit?text=…) has no token', () => {
    const d = classifyRoute({
      pathname: '/calendar/u/0/r/eventedit',
      search: '?text=x',
      viewKey: 'EVENTEDIT',
      viewFamily: 'EVENT_EDIT',
    }).descriptor;
    expect(d.type).toBe(RouteType.EVENT_EDIT);
    expect(d.eventRawId).toBeNull();
  });

  test('other routes never carry a token', () => {
    expect(
      classifyRoute(input('/calendar/u/0/r/week/2026/9/30', 'WEEK', 'EVENT'))
        .descriptor.eventRawId,
    ).toBeNull();
  });

  test('no token while the URL still shows the previous page', () => {
    // body already says EVENTEDIT, URL not yet updated
    expect(
      classifyRoute(
        input('/calendar/u/0/r/week/2026/9/30', 'EVENTEDIT', 'EVENT_EDIT'),
      ).descriptor.eventRawId,
    ).toBeNull();
  });
});
