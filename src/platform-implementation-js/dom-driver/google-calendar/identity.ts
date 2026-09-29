import type {
  EventKind,
  EventRef,
} from '../../driver-interfaces/event-view-driver';

/**
 * `data-eventid` = `[ttb_|bday_]` + base64url(`<id>[_<instance>] <calendarAbbrev>`)
 * (docs/calendar-reverse-engineering.md §1.1, §1.6). Pure functions, no DOM.
 */

const KIND_PREFIXES: ReadonlyArray<[string, EventKind]> = [
  ['ttb_', 'task'],
  ['bday_', 'birthday'],
];

// <id> has no spaces; the calendar hint may contain @ # . etc.
const DECODED_SHAPE = /^(\S+) (\S+)$/;
const INSTANCE_TIMED = /_(\d{8}T\d{6}Z)$/;
const INSTANCE_ALLDAY = /_(\d{8})$/;

function decodeBase64Url(token: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    // must be printable ASCII to be one of our tokens
    return /^[\x20-\x7e]+$/.test(bin) ? bin : null;
  } catch {
    return null;
  }
}

export type DecodedEventId = {
  kind: EventKind;
  eventId: string;
  instanceId?: string;
  calendarIdHint: string;
  rawId: string;
};

function parseDecoded(
  decoded: string,
): Pick<DecodedEventId, 'eventId' | 'instanceId' | 'calendarIdHint'> | null {
  const m = decoded.match(DECODED_SHAPE);
  if (!m) return null;
  const [, idPart, calendarIdHint] = m;
  const inst = idPart.match(INSTANCE_TIMED) ?? idPart.match(INSTANCE_ALLDAY);
  if (inst) {
    const eventId = idPart.slice(0, idPart.length - inst[0].length);
    if (!eventId) return null;
    return { eventId, instanceId: inst[1], calendarIdHint };
  }
  return { eventId: idPart, calendarIdHint };
}

/**
 * Decode a `data-eventid` token. Returns null when it is not a token we
 * understand — callers must then NOT guess an identity (plan §5 failure policy).
 * An unknown `<letters>_` prefix yields `kind: 'unknown'`.
 */
export function decodeEventId(
  rawId: string | null | undefined,
): DecodedEventId | null {
  if (!rawId) return null;

  // 1) the whole token (plain events). Tried first because a base64url token
  //    can legitimately contain `_` at any position.
  const whole = decodeBase64Url(rawId);
  const wholeParsed = whole && parseDecoded(whole);
  if (wholeParsed) return { kind: 'event', rawId, ...wholeParsed };

  // 2) a kind prefix followed by the base64url payload
  const prefixed = rawId.match(/^([a-z]+_)(.+)$/);
  if (!prefixed) return null;
  const decoded = decodeBase64Url(prefixed[2]);
  const parsed = decoded && parseDecoded(decoded);
  if (!parsed) return null;
  const known = KIND_PREFIXES.find(([p]) => p === prefixed[1]);
  return { kind: known ? known[1] : 'unknown', rawId, ...parsed };
}

/**
 * Full calendar id from a chip's `jslog` (`…;1:["<calendar id>",n];…`). Present
 * for plain events only; tasks and birthdays carry no id there (RE §1.6).
 */
export function extractCalendarIdFromJslog(
  jslog: string | null | undefined,
): string | null {
  const m = jslog?.match(/;\s*1:\["([^"]+)"/);
  return m ? m[1] : null;
}

/** Build the public ref from a chip element, or null if it has no readable identity. */
export function eventRefFromChip(chip: Element): EventRef | null {
  const decoded = decodeEventId(chip.getAttribute('data-eventid'));
  if (!decoded) return null;
  return {
    eventId: decoded.eventId,
    ...(decoded.instanceId !== undefined && { instanceId: decoded.instanceId }),
    calendarId: extractCalendarIdFromJslog(chip.getAttribute('jslog')),
    calendarIdHint: decoded.calendarIdHint,
    kind: decoded.kind,
    rawId: decoded.rawId,
    confidence: 'exact',
  };
}

/**
 * Ref for a token that did not come from a chip (the editor route). The full
 * calendar id is unknown there, so `calendarId` is null.
 */
export function eventRefFromRawId(
  rawId: string | null | undefined,
): EventRef | null {
  const decoded = decodeEventId(rawId);
  if (!decoded) return null;
  return {
    eventId: decoded.eventId,
    ...(decoded.instanceId !== undefined && { instanceId: decoded.instanceId }),
    calendarId: null,
    calendarIdHint: decoded.calendarIdHint,
    kind: decoded.kind,
    rawId: decoded.rawId,
    confidence: 'exact',
  };
}

/**
 * Fill in `calendarId` of a plain event from what the page has taught us about
 * its calendar abbreviation. The result is `derived` (not read from this
 * element). Tasks and birthdays are left alone: their abbreviation names the
 * account, but which "calendar" they live on is not the same thing.
 */
export function withResolvedCalendarId(
  ref: EventRef,
  resolve: ((calendarIdHint: string) => string | null) | undefined,
): EventRef {
  if (ref.calendarId !== null || ref.kind !== 'event' || !resolve) return ref;
  const calendarId = resolve(ref.calendarIdHint);
  return calendarId ? { ...ref, calendarId, confidence: 'derived' } : ref;
}

/** Stable key for "the same calendar item": series/event id + instance + calendar. */
export function eventRefKey(ref: EventRef): string {
  return `${ref.kind}|${ref.eventId}|${ref.instanceId ?? ''}|${
    ref.calendarIdHint
  }`;
}
