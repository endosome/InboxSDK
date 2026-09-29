// EXPERIMENTAL — Router.goto in real Chrome over CDP with examples/calendar-goto: view switches with and
// without a date, search, an EventRef opening the editor, and bad targets — all WITHOUT a page reload
// (a marker on `window` survives), with the route handler seeing the new route each time.
// Read-only (opens the editor and leaves with Cancel, nothing saved). Run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-goto',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });

const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const logs = [];
p.on('console', (m) => {
  if (m.text().startsWith('CalendarSDK')) logs.push(m.text());
});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 2000 })
  .catch(() => {});
for (
  let i = 0;
  i < 40 && !(await p.locator('[role=main] [data-eventchip]').count());
  i++
)
  await p.waitForTimeout(250);
await p.waitForTimeout(2500);
await p.evaluate(() => {
  window.__marker = 42;
});

const state = () =>
  p.evaluate(() => ({
    path: location.pathname + location.search,
    viewKey: document.body.dataset.viewkey,
    marker: window.__marker,
    chips: document.querySelectorAll('[role=main] [data-eventchip]').length,
  }));
async function go(target) {
  const n = logs.length;
  await p.evaluate((t) => {
    document.documentElement.dataset.calsdkGoto = JSON.stringify(t);
    document.dispatchEvent(new Event('calsdk-goto'));
  }, target);
  for (
    let i = 0;
    i < 40 && !logs.slice(n).some((l) => /goto (ok|error)/.test(l));
    i++
  )
    await p.waitForTimeout(150);
  await p.waitForTimeout(800);
  return logs.slice(n);
}

let l = await go({ type: 'MONTH', date: '2026-10-15' });
let st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'MONTH' &&
    st.marker === 42,
  'MONTH with a date: resolved, view switched, no reload',
  JSON.stringify({ l, st }),
);
pass(
  l.some((x) => x.startsWith('CalendarSDK route MONTH 2026-10-15')),
  'route handler saw MONTH 2026-10-15',
  JSON.stringify(l),
);
pass(st.chips > 0, 'month grid rendered chips', JSON.stringify(st));

l = await go({ type: 'DAY', date: '2026-09-30' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') && st.viewKey === 'DAY' && st.marker === 42,
  'DAY with a date',
  JSON.stringify({ l, st }),
);

l = await go({ type: 'WEEK' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'WEEK' &&
    st.marker === 42,
  'WEEK without a date ("today")',
  JSON.stringify({ l, st }),
);

l = await go({ type: 'AGENDA', date: '2026-09-30' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'AGENDA' &&
    st.marker === 42,
  'AGENDA (Schedule)',
  JSON.stringify({ l, st }),
);

l = await go({ type: 'CUSTOM_DAYS', date: '2026-09-30' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'CUSTOM_DAYS' &&
    st.marker === 42,
  'CUSTOM_DAYS',
  JSON.stringify({ l, st }),
);

l = await go({ type: 'SEARCH', query: 'CALSDK' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'SEARCH' &&
    st.marker === 42,
  'SEARCH',
  JSON.stringify({ l, st }),
);

// already there: resolves immediately
l = await go({ type: 'SEARCH', query: 'CALSDK' });
pass(
  l.includes('CalendarSDK goto ok'),
  'already on the target: resolves',
  JSON.stringify(l),
);

// an EventRef → editor
await go({ type: 'WEEK', date: '2026-09-30' });
const raw = await p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .getAttribute('data-eventid');
l = await go({ kind: 'event', rawId: raw, eventId: 'x', calendarIdHint: 'x' });
st = await state();
pass(
  l.includes('CalendarSDK goto ok') &&
    st.viewKey === 'EVENTEDIT' &&
    st.path.includes(`/r/eventedit/${raw}`) &&
    st.marker === 42,
  'EventRef opens the editor, no reload',
  JSON.stringify({ l, st }),
);
pass(
  l.some(
    (x) => /^CalendarSDK route EVENT_EDIT - /.test(x) && !x.endsWith(' -'),
  ),
  'route handler saw the editor with its event ref',
  JSON.stringify(l),
);
await p
  .locator('#xCancelBu')
  .click({ timeout: 4000 })
  .catch(() => {});
await p.waitForTimeout(1500);

// bad targets reject with a clear message and do not navigate
const before = await state();
for (const [name, t, msg] of [
  ['bad date', { type: 'DAY', date: '2026-02-30' }, 'invalid date'],
  ['SETTINGS', { type: 'SETTINGS' }, 'cannot navigate'],
  ['task ref', { kind: 'task', rawId: 'x' }, 'only events'],
]) {
  l = await go(t);
  pass(
    l.some((x) => x.startsWith('CalendarSDK goto error') && x.includes(msg)),
    `${name} rejects`,
    JSON.stringify(l),
  );
}
const after = await state();
pass(
  after.path === before.path && after.marker === 42,
  'bad targets do not navigate',
  JSON.stringify({ before, after }),
);

await p.close();
console.log('Extension goto report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
