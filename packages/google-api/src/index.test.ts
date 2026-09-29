import {
  apiEventId,
  CalendarApiError,
  createGoogleCalendarProvider,
  toCalendarEvent,
} from './index';
import type { EventRef } from '@calendarsdk/core';

const ref = (over: Partial<EventRef> = {}): EventRef => ({
  eventId: 'abc123',
  calendarId: 'me@example.com',
  calendarIdHint: 'me@m',
  kind: 'event',
  rawId: 'raw',
  confidence: 'exact',
  ...over,
});

/** jsdom has no Response; the provider only uses status, ok and json(). */
const json = (status: number, body: unknown = {}) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as Response;

function setup(responses: (Response | Error)[], extra = {}) {
  const calls: { url: string; auth: string | null }[] = [];
  const queue = [...responses];
  const fetchFn = jest.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        auth: (init?.headers as Record<string, string>).Authorization ?? null,
      });
      const next = queue.shift();
      if (!next) throw new Error('unexpected request');
      if (next instanceof Error) throw next;
      return next;
    },
  );
  const getAccessToken = jest.fn(async (o?: { forceRefresh?: boolean }) =>
    o?.forceRefresh ? 'fresh-token' : 'token-1',
  );
  const provider = createGoogleCalendarProvider({
    getAccessToken,
    fetch: fetchFn as unknown as typeof fetch,
    sleep: async () => undefined,
    ...extra,
  });
  return { provider, calls, getAccessToken, fetchFn };
}

test('apiEventId: base id, or <id>_<instance> for recurring instances', () => {
  expect(apiEventId({ eventId: 'a' })).toBe('a');
  expect(apiEventId({ eventId: 'a', instanceId: '20260929T110000Z' })).toBe(
    'a_20260929T110000Z',
  );
  expect(apiEventId({ eventId: 'a', instanceId: '20260930' })).toBe(
    'a_20260930',
  );
});

test('getEvent: URL, bearer token, mapping', async () => {
  const { provider, calls } = setup([
    json(200, {
      id: 'abc123',
      iCalUID: 'abc123@google.com',
      summary: 'Sync',
      start: {
        dateTime: '2026-09-30T10:00:00+02:00',
        timeZone: 'Europe/Warsaw',
      },
      end: { dateTime: '2026-09-30T11:00:00+02:00' },
      hangoutLink: 'https://meet.google.com/x',
      attendees: [
        { email: 'a@example.com', responseStatus: 'accepted', self: true },
        { displayName: 'no email' },
      ],
    }),
  ]);
  const e = await provider.getEvent(ref());
  expect(calls[0].url).toBe(
    'https://www.googleapis.com/calendar/v3/calendars/me%40example.com/events/abc123',
  );
  expect(calls[0].auth).toBe('Bearer token-1');
  expect(e).toEqual({
    id: 'abc123',
    calendarId: 'me@example.com',
    iCalUID: 'abc123@google.com',
    title: 'Sync',
    allDay: false,
    start: '2026-09-30T10:00:00+02:00',
    end: '2026-09-30T11:00:00+02:00',
    timeZone: 'Europe/Warsaw',
    attendees: [
      { email: 'a@example.com', responseStatus: 'accepted', self: true },
    ],
    conferenceUrl: 'https://meet.google.com/x',
  });
});

test('all-day events use dates', () => {
  const e = toCalendarEvent(
    { id: 'x', start: { date: '2026-09-30' }, end: { date: '2026-10-01' } },
    'c',
  );
  expect(e).toMatchObject({
    allDay: true,
    start: '2026-09-30',
    end: '2026-10-01',
  });
});

test('a recurring instance is fetched by its instance id, and a 404 is null (never the series)', async () => {
  const { provider, calls } = setup([json(404)]);
  const e = await provider.getEvent(ref({ instanceId: '20260929T110000Z' }));
  expect(e).toBeNull();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toMatch(/\/events\/abc123_20260929T110000Z$/);
});

test('never guesses the calendar; resolveCalendarId can supply it', async () => {
  const none = setup([]);
  expect(await none.provider.getEvent(ref({ calendarId: null }))).toBeNull();
  expect(none.fetchFn).not.toHaveBeenCalled();
  const resolved = setup(
    [
      json(200, {
        id: 'abc123',
        start: { date: '2026-09-30' },
        end: { date: '2026-10-01' },
      }),
    ],
    {
      resolveCalendarId: () => 'resolved@example.com',
    },
  );
  const e = await resolved.provider.getEvent(ref({ calendarId: null }));
  expect(e?.calendarId).toBe('resolved@example.com');
  expect(resolved.calls[0].url).toContain('/calendars/resolved%40example.com/');
});

test('tasks and birthdays are not looked up', async () => {
  const { provider, fetchFn } = setup([]);
  expect(await provider.getEvent(ref({ kind: 'task' }))).toBeNull();
  expect(await provider.getEvent(ref({ kind: 'birthday' }))).toBeNull();
  expect(fetchFn).not.toHaveBeenCalled();
});

test('401 refreshes the token once and retries; a second 401 throws', async () => {
  const ok = setup([
    json(401),
    json(200, {
      id: 'abc123',
      start: { date: '2026-09-30' },
      end: { date: '2026-09-30' },
    }),
  ]);
  await ok.provider.getEvent(ref());
  expect(ok.calls.map((c) => c.auth)).toEqual([
    'Bearer token-1',
    'Bearer fresh-token',
  ]);
  expect(ok.getAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
  const bad = setup([
    json(401),
    json(401, { error: { errors: [{ reason: 'authError' }] } }),
  ]);
  await expect(bad.provider.getEvent(ref())).rejects.toMatchObject({
    status: 401,
    reason: 'authError',
  });
});

test('403 throws CalendarApiError with the reason and never the token', async () => {
  const { provider } = setup([
    json(403, { error: { errors: [{ reason: 'forbidden' }] } }),
  ]);
  const err = (await provider
    .getEvent(ref())
    .catch((e: unknown) => e)) as CalendarApiError;
  expect(err).toBeInstanceOf(CalendarApiError);
  expect(err.status).toBe(403);
  expect(JSON.stringify(err) + err.message + err.stack).not.toContain(
    'token-1',
  );
});

test('429/5xx/network errors are retried, then given up on', async () => {
  const ok = setup([
    json(503),
    new Error('offline'),
    json(200, {
      id: 'abc123',
      start: { date: '2026-09-30' },
      end: { date: '2026-09-30' },
    }),
  ]);
  expect((await ok.provider.getEvent(ref()))?.id).toBe('abc123');
  expect(ok.fetchFn).toHaveBeenCalledTimes(3);
  const down = setup([json(500), json(500), json(500)]);
  await expect(down.provider.getEvent(ref())).rejects.toMatchObject({
    status: 500,
  });
  expect(down.fetchFn).toHaveBeenCalledTimes(3);
  const net = setup([new Error('x'), new Error('x'), new Error('x')]);
  await expect(net.provider.getEvent(ref())).rejects.toMatchObject({
    status: 0,
  });
});

test('listCalendars pages through and maps', async () => {
  const { provider, calls } = setup([
    json(200, {
      nextPageToken: 'p2',
      items: [
        {
          id: 'a',
          summary: 'A',
          primary: true,
          accessRole: 'owner',
          timeZone: 'UTC',
        },
      ],
    }),
    json(200, { items: [{ id: 'b', summary: 'B', summaryOverride: 'Mine' }] }),
  ]);
  expect(await provider.listCalendars!()).toEqual([
    {
      id: 'a',
      title: 'A',
      primary: true,
      accessRole: 'owner',
      timeZone: 'UTC',
    },
    { id: 'b', title: 'Mine' },
  ]);
  expect(calls[1].url).toContain('pageToken=p2');
});

test('getAccessToken is required', () => {
  expect(() => createGoogleCalendarProvider({} as any)).toThrow(
    'getAccessToken',
  );
});
