import {
  decodeEventId,
  eventRefFromChip,
  eventRefKey,
  extractCalendarIdFromJslog,
} from './identity';

const b64url = (s: string) => Buffer.from(s).toString('base64url');

// Tokens built like the ones observed on live Calendar (docs RE §1.1, §1.6).
const PLAIN = b64url('fx0ba838f1de372227d532f32a owner@m');
const TIMED_INSTANCE = b64url(
  'fx3e8fc6b453a4e8c719971e8a_20260929T110000Z owner@m',
);
const ALLDAY_INSTANCE = b64url('fx2f16666fd05befe129423b75_20260930 owner@m');
const HOLIDAY = b64url(
  '20261101_fx9f9eb6661eca187fee9a8d7c en.polish#holiday@v',
);
const TASK = 'ttb_' + b64url('fx03d922197dfc8d2779c97751 owner@m');
const BIRTHDAY =
  'bday_' + b64url('fx769c05ad2eac639e036140b2_20261002 owner@m');

describe('decodeEventId', () => {
  test('plain event', () => {
    expect(decodeEventId(PLAIN)).toEqual({
      kind: 'event',
      eventId: 'fx0ba838f1de372227d532f32a',
      calendarIdHint: 'owner@m',
      rawId: PLAIN,
    });
  });

  test('timed recurring instance: suffix is the original UTC start', () => {
    expect(decodeEventId(TIMED_INSTANCE)).toMatchObject({
      eventId: 'fx3e8fc6b453a4e8c719971e8a',
      instanceId: '20260929T110000Z',
    });
  });

  test('all-day recurring instance: suffix is the date', () => {
    expect(decodeEventId(ALLDAY_INSTANCE)).toMatchObject({
      eventId: 'fx2f16666fd05befe129423b75',
      instanceId: '20260930',
    });
  });

  test('holiday ids contain a date but no instance suffix', () => {
    expect(decodeEventId(HOLIDAY)).toMatchObject({
      kind: 'event',
      eventId: '20261101_fx9f9eb6661eca187fee9a8d7c',
      calendarIdHint: 'en.polish#holiday@v',
    });
    expect(decodeEventId(HOLIDAY)?.instanceId).toBeUndefined();
  });

  test('task: ttb_ prefix, not garbage from decoding the prefix', () => {
    expect(decodeEventId(TASK)).toMatchObject({
      kind: 'task',
      eventId: 'fx03d922197dfc8d2779c97751',
      calendarIdHint: 'owner@m',
      rawId: TASK,
    });
  });

  test('birthday: bday_ prefix with a date instance', () => {
    expect(decodeEventId(BIRTHDAY)).toMatchObject({
      kind: 'birthday',
      eventId: 'fx769c05ad2eac639e036140b2',
      instanceId: '20261002',
    });
  });

  test('an unknown <letters>_ prefix is kind "unknown" but still decoded', () => {
    const t = 'zzz_' + b64url('abc123 owner@m');
    expect(decodeEventId(t)).toMatchObject({
      kind: 'unknown',
      eventId: 'abc123',
    });
  });

  test('custom-domain style calendar hints are kept verbatim', () => {
    expect(
      decodeEventId(b64url('abc123 alice@example-corp.com')),
    ).toMatchObject({ calendarIdHint: 'alice@example-corp.com' });
  });

  test.each([
    ['null', null],
    ['empty', ''],
    ['not base64url', 'not a token!'],
    ['no calendar part', b64url('fx0ba838f1de372227d532f32a')],
    ['binary garbage', 'AAAAAAAAAAAA'],
    ['prefix with garbage payload', 'ttb_$$$$'],
    ['instance suffix but empty id', b64url('_20260930 owner@m')],
  ])('%s → null (never guess an identity)', (_name, token) => {
    expect(decodeEventId(token as string | null)).toBe(null);
  });
});

test('extractCalendarIdFromJslog reads field 1 of plain events only', () => {
  const plain =
    '35463; 2:["fx0ba838f1de372227d532f32a",null,null,6];1:["owner@gmail.com",1];track:impression,click';
  expect(extractCalendarIdFromJslog(plain)).toBe('owner@gmail.com');
  // birthday: `1:[4]` has no id; task: no field 1
  expect(
    extractCalendarIdFromJslog('35463; 2:["x_20261002",8];1:[4];track:a'),
  ).toBe(null);
  expect(extractCalendarIdFromJslog('185338;2:["y",19];track:impression')).toBe(
    null,
  );
  expect(extractCalendarIdFromJslog(null)).toBe(null);
});

describe('eventRefFromChip', () => {
  const chip = (attrs: Record<string, string>) => {
    const el = document.createElement('div');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  test('builds the public ref', () => {
    const ref = eventRefFromChip(
      chip({
        'data-eventid': TIMED_INSTANCE,
        jslog: '35463; 2:["x",6];1:["owner@gmail.com",1];track:a',
      }),
    );
    expect(ref).toEqual({
      eventId: 'fx3e8fc6b453a4e8c719971e8a',
      instanceId: '20260929T110000Z',
      calendarId: 'owner@gmail.com',
      calendarIdHint: 'owner@m',
      kind: 'event',
      rawId: TIMED_INSTANCE,
      confidence: 'exact',
    });
  });

  test('no instanceId key for non-recurring events', () => {
    const ref = eventRefFromChip(chip({ 'data-eventid': PLAIN }));
    expect(ref && 'instanceId' in ref).toBe(false);
    expect(ref?.calendarId).toBe(null);
  });

  test('null when the attribute is missing or unreadable', () => {
    expect(eventRefFromChip(chip({}))).toBe(null);
    expect(eventRefFromChip(chip({ 'data-eventid': '???' }))).toBe(null);
  });
});

test('eventRefKey distinguishes instances, calendars and kinds', () => {
  const base = eventRefFromChip(
    (() => {
      const el = document.createElement('div');
      el.setAttribute('data-eventid', TIMED_INSTANCE);
      return el;
    })(),
  )!;
  expect(eventRefKey(base)).toBe(eventRefKey({ ...base }));
  expect(eventRefKey(base)).not.toBe(
    eventRefKey({ ...base, instanceId: '20260930T110000Z' }),
  );
  expect(eventRefKey(base)).not.toBe(
    eventRefKey({ ...base, calendarIdHint: 'other@g' }),
  );
  expect(eventRefKey(base)).not.toBe(eventRefKey({ ...base, kind: 'task' }));
});
