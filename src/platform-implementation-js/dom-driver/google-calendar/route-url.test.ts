import { buildRouteUrl } from './route-url';
import { RouteType } from '../../constants/router';
import type { EventRef } from '../../driver-interfaces/event-view-driver';

const here = '/calendar/u/1/r/week/2026/9/30';
const ref = (over: Partial<EventRef> = {}): EventRef => ({
  eventId: 'abc',
  calendarId: null,
  calendarIdHint: 'me@m',
  kind: 'event',
  rawId: 'YWJjIG1lQG0',
  confidence: 'exact',
  ...over,
});

test.each([
  ['DAY', 'day'],
  ['WEEK', 'week'],
  ['MONTH', 'month'],
  ['YEAR', 'year'],
  ['AGENDA', 'agenda'],
  ['CUSTOM_DAYS', 'customday'],
] as const)(
  '%s with a date keeps the account and drops zero padding',
  (type, seg) => {
    const { url, expected } = buildRouteUrl({ type, date: '2026-09-05' }, here);
    expect(url).toBe(`/calendar/u/1/r/${seg}/2026/9/5`);
    expect(expected).toEqual({
      type: RouteType[type],
      eventRawId: null,
      searchQuery: null,
    });
  },
);

test('no date means "today" (dateless path); the account prefix is optional', () => {
  expect(buildRouteUrl({ type: 'MONTH' }, here).url).toBe(
    '/calendar/u/1/r/month',
  );
  expect(buildRouteUrl({ type: 'MONTH' }, '/calendar/r/week').url).toBe(
    '/calendar/r/month',
  );
});

test('rejects malformed and impossible dates', () => {
  for (const date of [
    '2026-9-5',
    '2026-02-30',
    '2026-13-01',
    'today',
    '20260905',
  ])
    expect(() => buildRouteUrl({ type: 'DAY', date }, here)).toThrow(
      'invalid date',
    );
});

test('search needs a query and encodes it', () => {
  const { url, expected } = buildRouteUrl(
    { type: 'SEARCH', query: 'a b&c' },
    here,
  );
  expect(url).toBe('/calendar/u/1/r/search?q=a%20b%26c');
  expect(expected.searchQuery).toBe('a b&c');
  expect(() => buildRouteUrl({ type: 'SEARCH', query: '' }, here)).toThrow(
    'non-empty',
  );
});

test('an EventRef opens the editor by its raw id; tasks/birthdays are refused', () => {
  const { url, expected } = buildRouteUrl(ref(), here);
  expect(url).toBe('/calendar/u/1/r/eventedit/YWJjIG1lQG0');
  expect(expected).toEqual({
    type: RouteType.EVENT_EDIT,
    eventRawId: 'YWJjIG1lQG0',
    searchQuery: null,
  });
  expect(() => buildRouteUrl(ref({ kind: 'task' }), here)).toThrow(
    'only events',
  );
  expect(() => buildRouteUrl(ref({ kind: 'birthday' }), here)).toThrow(
    'only events',
  );
});

test('unsupported targets throw', () => {
  expect(() => buildRouteUrl({ type: 'SETTINGS' } as any, here)).toThrow(
    'cannot navigate',
  );
  expect(() => buildRouteUrl(null as any, here)).toThrow('target is required');
});
