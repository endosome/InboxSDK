import CalendarIdMap from './calendar-id-map';
import { setReporter } from '../../../lib/reporter';
import { withResolvedCalendarId } from '../identity';
import type { EventRef } from '../../../driver-interfaces/event-view-driver';

afterEach(() => setReporter(null));

const ref = (over: Partial<EventRef> = {}): EventRef => ({
  eventId: 'e1',
  calendarId: null,
  calendarIdHint: 'owner@m',
  kind: 'event',
  rawId: 'raw',
  confidence: 'exact',
  ...over,
});

test('learns a pair and resolves it; unknown hints resolve to null', () => {
  const map = new CalendarIdMap();
  expect(map.resolve('owner@m')).toBeNull();
  map.learn('owner@m', 'owner@example.com');
  expect(map.resolve('owner@m')).toBe('owner@example.com');
  expect(map.resolve('other@m')).toBeNull();
});

test('a hint seen with two different full ids becomes ambiguous for good, and is reported without ids', () => {
  const events: unknown[] = [];
  setReporter({ error: () => undefined, event: (n, d) => events.push([n, d]) });
  const map = new CalendarIdMap();
  map.learn('x@g', 'a@group.calendar.google.com');
  map.learn('x@g', 'a@group.calendar.google.com'); // same again: fine
  expect(map.resolve('x@g')).toBe('a@group.calendar.google.com');
  map.learn('x@g', 'b@group.calendar.google.com');
  expect(map.resolve('x@g')).toBeNull();
  map.learn('x@g', 'a@group.calendar.google.com'); // no recovery
  expect(map.resolve('x@g')).toBeNull();
  expect(events).toEqual([['calendar-id-conflict', undefined]]);
});

test('ignores empty input', () => {
  const map = new CalendarIdMap();
  map.learn('', 'a');
  map.learn('a', '');
  expect(map.resolve('')).toBeNull();
  expect(map.resolve('a')).toBeNull();
});

describe('withResolvedCalendarId', () => {
  const resolve = (h: string) => (h === 'owner@m' ? 'owner@example.com' : null);
  test('fills a null calendar id of a plain event, marked derived', () => {
    expect(withResolvedCalendarId(ref(), resolve)).toEqual(
      ref({ calendarId: 'owner@example.com', confidence: 'derived' }),
    );
  });
  test('never overrides a known id, and never touches tasks/birthdays/unknown hints', () => {
    const known = ref({ calendarId: 'read@dom.com' });
    expect(withResolvedCalendarId(known, resolve)).toBe(known);
    for (const kind of ['task', 'birthday', 'unknown'] as const) {
      const r = ref({ kind });
      expect(withResolvedCalendarId(r, resolve)).toBe(r);
    }
    const unknownHint = ref({ calendarIdHint: 'zzz@m' });
    expect(withResolvedCalendarId(unknownHint, resolve)).toBe(unknownHint);
    expect(withResolvedCalendarId(ref(), undefined).calendarId).toBeNull();
  });
});
