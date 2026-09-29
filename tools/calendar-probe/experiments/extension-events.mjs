// EXPERIMENTAL — loads examples/calendar-events (the built SDK) in real Chrome over CDP and compares the
// live EventViews it publishes (<html data-calsdk-events>) with the chips actually in the DOM.
// Start Chrome with --enable-unsafe-extension-debugging (see extension-smoke.mjs); run `yarn gulp` first.
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
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const rows = [];
const check = (level, name, detail = '') => rows.push({ level, name, detail });

await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
const published = () =>
  p.evaluate(() =>
    JSON.parse(
      document.documentElement.getAttribute('data-calsdk-events') ?? 'null',
    ),
  );
// What SHOULD be a view: chips inside [role=main] with jsaction + data-keyboardactiontype and a decodable id.
const domChips = () =>
  p.evaluate(() => {
    const dec = (t) => {
      try {
        const x = t
          .replace(/^(ttb_|bday_)/, '')
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        return atob(x + '='.repeat((4 - (x.length % 4)) % 4));
      } catch {
        return null;
      }
    };
    return [...document.querySelectorAll('[role=main] [data-eventchip]')]
      .filter(
        (c) =>
          c.hasAttribute('jsaction') &&
          c.hasAttribute('data-keyboardactiontype') &&
          c.getAttribute('data-eventid'),
      )
      .map((c) => c.getAttribute('data-eventid'));
  });
const settle = async (ms = 1500) => {
  await p.waitForTimeout(ms);
};
const compare = async (label) => {
  await settle();
  const pub = await published();
  const dom = (await domChips()).sort();
  const views = (pub?.live ?? []).map((v) => v.rawId).sort();
  const same =
    dom.length === views.length && dom.every((x, i) => x === views[i]);
  check(
    same ? 'PASS' : 'FAIL',
    `${label}: views == eligible DOM chips`,
    `views=${views.length} dom=${dom.length} created=${
      pub?.created
    } destroyed=${pub?.destroyed} live=${pub?.created - pub?.destroyed}`,
  );
  return pub;
};
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 1500 })
  .catch(() => {});
for (let i = 0; i < 40 && !(await published())?.live?.length; i++)
  await p.waitForTimeout(250);

let pub = await compare('initial week');
const kinds = Object.fromEntries(
  Object.entries(
    pub.live.reduce((a, v) => ((a[v.kind] = (a[v.kind] ?? 0) + 1), a), {}),
  ),
);
check('INFO', 'kinds present', JSON.stringify(kinds));
const multi = pub.live.filter((v) => v.eventId && v.segment.count > 1);
check(
  multi.length ? 'PASS' : 'WARN',
  'multi-day event exposes several segments',
  multi.map((v) => `${v.segment.index + 1}/${v.segment.count}`).join(' '),
);
check(
  pub.live.some((v) => v.allDay) && pub.live.some((v) => !v.allDay)
    ? 'PASS'
    : 'FAIL',
  'isAllDay: both all-day and timed views present',
  `allDay=${pub.live.filter((v) => v.allDay).length}`,
);
const rec = pub.live.filter((v) => v.instanceId);
check(
  rec.length ? 'PASS' : 'WARN',
  'recurring instances carry instanceId',
  rec
    .slice(0, 2)
    .map((v) => v.instanceId)
    .join(', '),
);

await p.getByRole('button', { name: /^Next week/ }).click();
await compare('next week');
await p.getByRole('button', { name: /^Previous week/ }).click();
await compare('previous week');
for (const k of ['m', 'd', 'y', 'a', 'x', 'w']) {
  await p.keyboard.press(k);
  await compare(`view key ${k}`);
}

// popover open/close must not change the views
const before = (await published()).created;
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await settle(1000);
const during = await published();
await p.keyboard.press('Escape');
await settle(800);
check(
  during.created === before ? 'PASS' : 'FAIL',
  'popover open creates no views',
  `created ${before} → ${during.created}`,
);
await compare('after popover close');

// quick-create draft chip must not become a view
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p
  .getByRole('menuitem', { name: /^Event/ })
  .first()
  .click();
await settle(1500);
const draftDom = await p.evaluate(
  () =>
    [...document.querySelectorAll('[data-eventchip]')].filter(
      (c) => !c.hasAttribute('jsaction'),
    ).length,
);
await compare(`quick-create open (draft chips in DOM: ${draftDom})`);
await p.keyboard.press('Escape');
await settle(1000);
await compare('quick-create cancelled');

// drag ghost: press on a chip, move it while sampling the DOM and the views, then move it BACK to where it
// started before releasing so the fixture is not changed.
await p
  .getByRole('button', { name: /^Previous week/ })
  .click()
  .catch(() => {});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
for (let i = 0; i < 40 && !(await published())?.live?.length; i++)
  await p.waitForTimeout(250);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 1500 })
  .catch(() => {});
await settle(1000);
const bb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .boundingBox();
if (bb) {
  const cx = bb.x + bb.width / 2,
    cy = bb.y + bb.height / 2;
  let maxChips = 0,
    maxInMain = 0,
    maxViews = 0;
  const sample = async () => {
    const mid = await p.evaluate(() => ({
      all: [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
        /Timed A/.test(c.innerText),
      ).length,
      main: [
        ...document.querySelectorAll('[role=main] [data-eventchip]'),
      ].filter((c) => /Timed A/.test(c.innerText)).length,
    }));
    maxChips = Math.max(maxChips, mid.all);
    maxInMain = Math.max(maxInMain, mid.main);
    const pm = await published();
    maxViews = Math.max(
      maxViews,
      pm.live.filter((v) => v.eventId.startsWith('40gfl3ep')).length,
    );
  };
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(cx, cy + i * 8, { steps: 2 });
    await p.waitForTimeout(70);
    await sample();
  }
  await p.mouse.move(cx, cy, { steps: 6 }); // back to the start
  await p.waitForTimeout(200);
  await sample();
  await p.mouse.up();
  await settle(2500);
  check(
    maxChips >= 2 ? 'PASS' : 'WARN',
    'mid-drag: a ghost chip with the same id exists in the DOM',
    `max ${maxChips} chips titled Timed A, ${maxInMain} inside [role=main]`,
  );
  check(
    maxViews === 1 ? 'PASS' : 'FAIL',
    'mid-drag: exactly one EventView for the dragged event at every sample',
    `max views=${maxViews}`,
  );
  const label = await p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => /Timed A/.test(c.innerText))
      .map((c) => c.innerText.split('\n')[0].slice(0, 16)),
  );
  check('INFO', 'chip after returning the drag to its start', label[0]);
  await compare('after drag');
}

// rapid navigation: many quick Next/Previous clicks, then verify no leaked or missing views
for (let i = 0; i < 12; i++)
  await p.getByRole('button', { name: /^Next week/ }).click({ delay: 0 });
for (let i = 0; i < 12; i++)
  await p.getByRole('button', { name: /^Previous week/ }).click({ delay: 0 });
pub = await compare('after 24 rapid navigations');
check(
  pub.created - pub.destroyed === pub.live.length ? 'PASS' : 'FAIL',
  'created - destroyed == live (no leaked views)',
  `${pub.created} - ${pub.destroyed} = ${pub.created - pub.destroyed}, live ${
    pub.live.length
  }`,
);

// month view has chips with different structure (no [data-datekey] ancestors)
await p.keyboard.press('m');
await compare('month view');
await p.keyboard.press('a');
await compare('schedule view');
console.log('Extension events report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await p.close();
await b.close();
process.exit(fails ? 1 : 0);
