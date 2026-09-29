import type {
  CalendarDataProvider,
  CalendarEvent,
  CalendarInfo,
  EventRef,
} from '@calendarsdk/core';

export type GetAccessToken = (opts?: {
  forceRefresh?: boolean;
}) => Promise<string>;

export type GoogleCalendarProviderOptions = {
  /** Returns an OAuth access token. Called again with `forceRefresh` after a 401. */
  getAccessToken: GetAccessToken;
  /**
   * Full calendar id for a ref whose `calendarId` is null. Return null to give
   * up. Without this, such refs resolve to null — the provider never guesses.
   */
  resolveCalendarId?: (ref: EventRef) => string | null | Promise<string | null>;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Per-request timeout in ms (default 10000). */
  timeoutMs?: number;
  /** Retries for 429/5xx/network errors (default 2). */
  retries?: number;
  /** Delay before retry n (default 300 * 2^n ms); injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

/** Never contains the token. */
export class CalendarApiError extends Error {
  readonly status: number;
  readonly reason?: string;
  constructor(status: number, reason?: string) {
    super(`Google Calendar API error ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'CalendarApiError';
    this.status = status;
    this.reason = reason;
  }
}

const DEFAULT_BASE = 'https://www.googleapis.com/calendar/v3';

type ApiTime = { date?: string; dateTime?: string; timeZone?: string };
type ApiEvent = {
  id: string;
  iCalUID?: string;
  status?: CalendarEvent['status'];
  summary?: string;
  description?: string;
  location?: string;
  start?: ApiTime;
  end?: ApiTime;
  recurringEventId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
  attendees?: {
    email?: string;
    displayName?: string;
    responseStatus?: string;
    self?: boolean;
    organizer?: boolean;
    optional?: boolean;
  }[];
};

/** The Calendar API's id for the item a ref points at (instance id for a recurring instance). */
export function apiEventId(
  ref: Pick<EventRef, 'eventId' | 'instanceId'>,
): string {
  return ref.instanceId ? `${ref.eventId}_${ref.instanceId}` : ref.eventId;
}

export function toCalendarEvent(
  e: ApiEvent,
  calendarId: string,
): CalendarEvent {
  const allDay = !!e.start?.date && !e.start?.dateTime;
  const conferenceUrl =
    e.hangoutLink ??
    e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')
      ?.uri;
  return {
    id: e.id,
    calendarId,
    ...(e.iCalUID && { iCalUID: e.iCalUID }),
    ...(e.status && { status: e.status }),
    ...(e.summary !== undefined && { title: e.summary }),
    ...(e.description !== undefined && { description: e.description }),
    ...(e.location !== undefined && { location: e.location }),
    allDay,
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    ...(e.start?.timeZone && { timeZone: e.start.timeZone }),
    ...(e.recurringEventId && { recurringEventId: e.recurringEventId }),
    ...(e.attendees && {
      attendees: e.attendees
        .filter((a) => a.email)
        .map((a) => ({
          email: a.email as string,
          ...(a.displayName && { displayName: a.displayName }),
          ...(a.responseStatus && {
            responseStatus: a.responseStatus as NonNullable<
              CalendarEvent['attendees']
            >[number]['responseStatus'],
          }),
          ...(a.self && { self: true }),
          ...(a.organizer && { organizer: true }),
          ...(a.optional && { optional: true }),
        })),
    }),
    ...(conferenceUrl && { conferenceUrl }),
    ...(e.htmlLink && { htmlLink: e.htmlLink }),
  };
}

export function createGoogleCalendarProvider(
  options: GoogleCalendarProviderOptions,
): CalendarDataProvider {
  if (typeof options?.getAccessToken !== 'function') {
    throw new Error('createGoogleCalendarProvider: getAccessToken is required');
  }
  const base = (options.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 2;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const doFetch = () => options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request(path: string): Promise<Response> {
    let token = await options.getAccessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response | null = null;
      try {
        res = await doFetch()(`${base}${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (attempt >= retries) throw new CalendarApiError(0, 'network error');
        void err;
      } finally {
        clearTimeout(timer);
      }
      if (res) {
        if (res.status === 401 && !refreshed) {
          refreshed = true;
          token = await options.getAccessToken({ forceRefresh: true });
          attempt--; // a refresh is not a retry
          continue;
        }
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= retries) return res;
      }
      await sleep(300 * 2 ** attempt);
    }
  }

  async function failure(res: Response): Promise<CalendarApiError> {
    let reason: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: { errors?: { reason?: string }[]; status?: string };
      };
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status;
    } catch {
      // no JSON body
    }
    return new CalendarApiError(res.status, reason);
  }

  return {
    async getEvent(ref) {
      if (ref.kind !== 'event') return null; // tasks/birthdays are not Calendar API events
      const calendarId =
        ref.calendarId ?? (await options.resolveCalendarId?.(ref)) ?? null;
      if (!calendarId) return null;
      const res = await request(
        `/calendars/${encodeURIComponent(
          calendarId,
        )}/events/${encodeURIComponent(apiEventId(ref))}`,
      );
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw await failure(res);
      return toCalendarEvent((await res.json()) as ApiEvent, calendarId);
    },

    async listCalendars() {
      const out: CalendarInfo[] = [];
      let pageToken: string | undefined;
      do {
        const res = await request(
          `/users/me/calendarList?maxResults=250${
            pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
          }`,
        );
        if (!res.ok) throw await failure(res);
        const body = (await res.json()) as {
          nextPageToken?: string;
          items?: {
            id: string;
            summary?: string;
            summaryOverride?: string;
            primary?: boolean;
            accessRole?: CalendarInfo['accessRole'];
            timeZone?: string;
          }[];
        };
        for (const c of body.items ?? []) {
          out.push({
            id: c.id,
            title: c.summaryOverride ?? c.summary ?? c.id,
            ...(c.primary && { primary: true }),
            ...(c.accessRole && { accessRole: c.accessRole }),
            ...(c.timeZone && { timeZone: c.timeZone }),
          });
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      return out;
    },
  };
}
