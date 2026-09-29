// EXPERIMENTAL — delete and undo, the open item of plan §15: what the SDK's EventViews do when a RECURRING
// instance is deleted ("This event"), when the delete is undone, and when the whole series is deleted.
// Uses examples/calendar-events (publishes the live views in <html data-calsdk-events>) in real Chrome over CDP.
// It CREATES a throw-away 3-instance series "[CALSDK-TMP] Del" on the test account (owner account 0) and
// deletes it again at the end (also on failure); nothing else is touched. Run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-events',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });
const info = (name, detail = '') => rows.push({ level: 'INFO', name, detail });

const TMP = '[CALSDK-TMP] Del';
const WEEK = 'https://calendar.google.com/calendar/u/0/r/week/2026/10/20?hl=en';
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });

const dismiss = () =>
  p
    .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
    .first()
    .click({ timeout: 1500 })
    .catch(() => {});
async function openWeek() {
  await p.goto(WEEK, { waitUntil: 'load' });
  await dismiss();
  await p.waitForTimeout(3500);
}
const chips = () =>
  p.locator('[role=main] [data-eventchip]').filter({ hasText: 'CALSDK-TMP' });
const published = () =>
  p.evaluate(() =>
    JSON.parse(
      document.documentElement.getAttribute('data-calsdk-events') ?? 'null',
    ),
  );
const dom = () =>
  p.evaluate(() => {
    const dec = (t) => {
      const x = t.replace(/-/g, '+').replace(/_/g, '/');
      return atob(x + '='.repeat((4 - (x.length % 4)) % 4));
    };
    return [...document.querySelectorAll('[role=main] [data-eventchip]')]
      .filter((c) => /CALSDK-TMP/.test(c.innerText))
      .map((c) => dec(c.getAttribute('data-eventid')).split(' ')[0]);
  });
/** Views of the temp series (by decoded id incl. instance) versus its chips in the DOM. */
async function compare(label, expectCount) {
  await p.waitForTimeout(1200);
  const ids = (await dom()).sort();
  const pub = await published();
  const domTmp = new Set(ids);
  const views = (pub?.live ?? [])
    .map((v) => (v.instanceId ? `${v.eventId}_${v.instanceId}` : v.eventId))
    .filter(
      (id) => domTmp.has(id) || ids.some((x) => x.startsWith(id.split('_')[0])),
    )
    .sort();
  pass(
    ids.length === expectCount,
    `${label}: ${expectCount} chip(s) of the series in the DOM`,
    JSON.stringify(ids),
  );
  pass(
    JSON.stringify(views) === JSON.stringify(ids),
    `${label}: EventViews == chips (no stale, none missing)`,
    JSON.stringify({ views, ids }),
  );
  pass(
    pub && pub.created - pub.destroyed === pub.live.length,
    `${label}: created − destroyed == live views`,
    JSON.stringify({
      c: pub?.created,
      d: pub?.destroyed,
      live: pub?.live.length,
    }),
  );
  return { ids, pub };
}
async function popoverOf(nth) {
  await chips().nth(nth).click();
  await p.waitForTimeout(1200);
}
async function deleteDialog(choice) {
  await p.getByRole('button', { name: 'Delete event' }).first().click();
  await p.waitForTimeout(900);
  const radio = p.getByRole('radio', { name: choice });
  if (await radio.count()) await radio.first().check({ force: true });
  await p
    .getByRole('button', { name: /^OK$/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => {});
  await p.waitForTimeout(1800);
}

async function cleanup() {
  await openWeek();
  for (let i = 0; i < 4 && (await chips().count()); i++) {
    await popoverOf(0);
    await deleteDialog('All events');
    await p.waitForTimeout(800);
  }
}

let created = false;
try {
  await cleanup(); // leftovers of a failed earlier run
  // 1. create the series (3 daily instances) via the URL template, no guests => no confirmation dialog
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/eventedit?text=' +
      encodeURIComponent(TMP) +
      '&dates=20261020T100000/20261020T110000&recur=' +
      encodeURIComponent('RRULE:FREQ=DAILY;COUNT=3') +
      '&hl=en',
    { waitUntil: 'load' },
  );
  await dismiss();
  await p.locator('#xSaveBu').click();
  await p.waitForTimeout(3000);
  created = true;
  await openWeek();
  const base = await compare('created', 3);
  const baseIds = base.ids;

  // 2. delete ONE instance ("This event")
  await popoverOf(1);
  await deleteDialog('This event');
  const afterOne = await compare('after deleting one instance', 2);
  const gone = baseIds.filter((x) => !afterOne.ids.includes(x));
  pass(
    gone.length === 1,
    'exactly one instance disappeared',
    JSON.stringify({ baseIds, ids: afterOne.ids }),
  );
  pass(
    afterOne.ids.every((x) => baseIds.includes(x)),
    'the other instances kept their ids (instance suffix = original start)',
    JSON.stringify({ baseIds, ids: afterOne.ids }),
  );

  // 3. undo
  const undo = p.getByRole('button', { name: /^Undo$/ }).first();
  if (await undo.count()) {
    await undo.click();
    await p.waitForTimeout(2500);
    const afterUndo = await compare('after undo', 3);
    pass(
      JSON.stringify(afterUndo.ids) === JSON.stringify(baseIds),
      'undo restored the same instance ids',
      JSON.stringify({ baseIds, ids: afterUndo.ids }),
    );
  } else {
    info('undo: no "Undo" button was shown after the delete');
  }

  // 4. delete the whole series
  await popoverOf(0);
  await deleteDialog('All events');
  await compare('after deleting the series', 0);
} catch (e) {
  pass(false, 'scenario', String(e.message).split('\n')[0]);
} finally {
  if (created) await cleanup().catch(() => {});
  const left = await chips()
    .count()
    .catch(() => -1);
  pass(
    left === 0,
    'cleanup: no [CALSDK-TMP] chip left on the calendar',
    String(left),
  );
}
await p.close();

console.log('Extension delete/undo report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
