import { runCompatChecks, compareStructure, SELECTOR_SPECS } from './checks';
import { CALENDAR_SELECTORS } from '../dom-driver/google-calendar/selectors';
import { structureHash } from './structure';

const id = (raw: string) => btoa(raw).replace(/=+$/, '');

function page(
  html: string,
  viewKey = 'WEEK',
  path = '/calendar/u/0/r/week/2026/9/30',
) {
  document.documentElement.setAttribute('lang', 'en');
  document.body.setAttribute('data-viewkey', viewKey);
  document.body.setAttribute(
    'data-viewfamily',
    viewKey === 'EVENTEDIT' ? 'EVENT_EDIT' : 'EVENT',
  );
  window.history.pushState({}, '', path);
  document.body.innerHTML = html;
}

const grid = (chips = 1) => `
  <header id="gb" role="banner"><div><span><button jsname="KzBUhd"></button></span></div></header>
  <div id="yDmH0d"></div>
  <div role="main"><div data-datekey="1">
    ${Array.from(
      { length: chips },
      (_, i) =>
        `<div data-eventchip jsaction="x" data-eventid="${id(
          `e${i} me@m`,
        )}"></div>`,
    ).join('')}
  </div></div>`;

const report = () => runCompatChecks(document, CALENDAR_SELECTORS);
const status = (r: ReturnType<typeof report>, key: string) =>
  r.selectors.find((s) => s.key === key)!.status;

test('every registry key has a spec', () => {
  expect(Object.keys(SELECTOR_SPECS).sort()).toEqual(
    Object.keys(CALENDAR_SELECTORS).sort(),
  );
});

test('a healthy week grid has no issues; popover/editor keys are inactive', () => {
  page(grid());
  const r = report();
  expect(r.issues).toEqual([]);
  expect(status(r, 'eventChip')).toBe('ok');
  expect(status(r, 'eventPopover')).toBe('inactive');
  expect(status(r, 'editorTitle')).toBe('inactive');
  expect(r.variant).toBe('en/?/WEEK');
});

test('BROKEN-SELECTOR DRILL: replacing a chain is a hard failure', () => {
  page(grid());
  const broken = { ...CALENDAR_SELECTORS, eventChip: ['[data-nope]'] };
  const r = runCompatChecks(document, broken);
  expect(r.issues).toContainEqual(
    expect.objectContaining({
      severity: 'hard',
      check: 'selector-miss',
      selectorKey: 'eventChip',
    }),
  );
});

test('an empty week is not a failure', () => {
  page(grid(0));
  const r = runCompatChecks(document, {
    ...CALENDAR_SELECTORS,
    eventChip: ['[data-nope]'],
  });
  expect(r.issues).toEqual([]);
  expect(status(r, 'eventChip')).toBe('unverified');
});

test('a later rung matching is a warning, with the rung index', () => {
  page(grid());
  const r = runCompatChecks(document, {
    ...CALENDAR_SELECTORS,
    mainRegion: ['[role=nope]', '[role=main]'],
  });
  expect(r.issues).toEqual([
    {
      severity: 'warning',
      check: 'selector-fallback',
      selectorKey: 'mainRegion',
      rungIndex: 1,
    },
  ]);
});

test('an invalid selector is a miss, not an exception', () => {
  page(grid());
  const r = runCompatChecks(document, {
    ...CALENDAR_SELECTORS,
    overlayHost: ['::::'],
  });
  expect(r.issues).toContainEqual(
    expect.objectContaining({ severity: 'hard', selectorKey: 'overlayHost' }),
  );
});

test('popovers are detected by evidence, even when the registry no longer matches them', () => {
  page(
    grid() +
      `<div role=dialog data-chips-dialog data-allow-wheel-scroll=false><div data-eventid="x"></div></div>`,
  );
  expect(status(report(), 'eventPopover')).toBe('ok');
  const r = runCompatChecks(document, {
    ...CALENDAR_SELECTORS,
    eventPopover: ['[data-nope]'],
  });
  expect(r.issues).toContainEqual(
    expect.objectContaining({ severity: 'hard', selectorKey: 'eventPopover' }),
  );
  // optional buttons (read-only events) never fail
  expect(r.issues.some((i) => i.selectorKey === 'popoverEditButton')).toBe(
    false,
  );
});

test('a quick-create dialog does not activate the popover context', () => {
  page(
    grid() +
      `<div role=dialog data-chips-dialog><input><div data-eventid="x"></div></div>`,
  );
  expect(status(report(), 'eventPopover')).toBe('inactive');
});

test('editor route requires title, save and cancel', () => {
  page(
    `<div role=main><input id=xTiIn><button id=xSaveBu></button></div><div id=yDmH0d></div>`,
    'EVENTEDIT',
    '/calendar/u/0/r/eventedit',
  );
  const r = report();
  expect(r.issues).toEqual([
    { severity: 'hard', check: 'selector-miss', selectorKey: 'editorCancel' },
  ]);
});

test('identity: undecodable chips are reported by count; all bad is hard', () => {
  page(grid(2) + '');
  document
    .querySelectorAll('[data-eventchip]')[0]
    .setAttribute('data-eventid', '!!!');
  let r = report();
  expect(r.issues).toContainEqual({
    severity: 'warning',
    check: 'identity-decode-failed',
    count: 1,
  });
  document
    .querySelectorAll('[data-eventchip]')[1]
    .setAttribute('data-eventid', '???');
  r = report();
  expect(r.issues).toContainEqual({
    severity: 'hard',
    check: 'identity-decode-failed',
    count: 2,
  });
});

test('reports contain no page text, ids or emails', () => {
  page(grid());
  document.querySelector('[data-eventchip]')!.textContent =
    'Secret meeting alice@example.com';
  const json = JSON.stringify(report());
  expect(json).not.toMatch(/Secret|alice|example\.com|me@m/);
});

describe('structure fingerprints', () => {
  const el = (html: string) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild!;
  };
  test('ignore text, classes, ids and attribute values; repeated siblings collapse', () => {
    const a = el(
      '<div class=a id=1 role=x><span jsname=1>Hi</span><span jsname=1>Yo</span></div>',
    );
    const b = el(
      '<div class=zzz id=2 role=y><span jsname=9>Other</span></div>',
    );
    expect(structureHash(a, 2)).toBe(structureHash(b, 2));
  });
  test('change with tags, attribute names and nesting', () => {
    const a = el('<div role=x><span jsname=1></span></div>');
    expect(structureHash(a, 2)).not.toBe(
      structureHash(el('<div role=x><b jsname=1></b></div>'), 2),
    );
    expect(structureHash(a, 2)).not.toBe(
      structureHash(el('<div role=x><span></span></div>'), 2),
    );
    expect(structureHash(a, 2)).not.toBe(
      structureHash(el('<div role=x><i><span jsname=1></span></i></div>'), 2),
    );
  });
  test('nodes injected by SDK apps do not change the fingerprint', () => {
    const plain = el('<div><p></p></div>');
    const injected = el(
      '<div><div data-calsdk-owned="x"><button></button></div><p></p></div>',
    );
    expect(structureHash(injected, 3)).toBe(structureHash(plain, 3));
  });
  test('depth limits what counts', () => {
    const a = el('<div><p><i></i></p></div>');
    const b = el('<div><p><b></b></p></div>');
    expect(structureHash(a, 1)).toBe(structureHash(b, 1));
    expect(structureHash(a, 2)).not.toBe(structureHash(b, 2));
  });
  test('compareStructure warns only for changed landmarks present in the baseline', () => {
    expect(
      compareStructure({ a: '1', b: '2', c: '3' }, { a: '1', b: 'x' }),
    ).toEqual([{ severity: 'warning', check: 'structure-drift:b' }]);
  });
});
