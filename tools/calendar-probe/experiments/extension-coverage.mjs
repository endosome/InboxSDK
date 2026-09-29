// EXPERIMENTAL — coverage gaps of the plan's risk table, in real Chrome over CDP with the built SDK
// (examples calendar-badges, calendar-popover-button, calendar-compat loaded together, which also
// exercises several SDK instances side by side):
//   1. SCALE: >= 300 chips in the live month view (synthetic clones of real chips; no events are
//      created) — every chip gets exactly one badge, how long that takes, churn (remove/re-add), that
//      removing the clones removes their badges and leaves the real chips untouched.
//   2. NARROW window (mobile-style layout, < 768 px): chips, badges, popover button, compat report.
//   3. Task and birthday chips carry badges (calendar-badges registers all three kinds).
// Read-only against Calendar (clones live only in this tab's DOM). Run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = (n) => path.resolve(here, '../../../examples', n);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const bs = await b.newBrowserCDPSession();
for (const n of [
  'calendar-badges',
  'calendar-popover-button',
  'calendar-compat',
])
  await bs.send('Extensions.loadUnpacked', { path: ext(n) });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });
const info = (name, detail = '') => rows.push({ level: 'INFO', name, detail });

async function open(view, width = 1300) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height: 950 });
  p.logs = [];
  p.on('console', (m) => {
    if (m.text().startsWith('CalendarSDK')) p.logs.push(m.text());
  });
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${view}?hl=en`, {
    waitUntil: 'load',
  });
  await p
    .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
    .first()
    .click({ timeout: 2000 })
    .catch(() => {});
  for (
    let i = 0;
    i < 40 && !(await p.locator('[data-eventchip][data-eventid]').count());
    i++
  )
    await p.waitForTimeout(250);
  await p.waitForTimeout(3000);
  return p;
}

/** Chips the SDK treats as events/tasks/birthdays and how many badges each has. */
const badgeState = (p) =>
  p.evaluate(() => {
    const chips = [
      ...document.querySelectorAll('[role=main] [data-eventchip]'),
    ].filter(
      (c) =>
        c.hasAttribute('jsaction') &&
        c.hasAttribute('data-keyboardactiontype') &&
        c.getAttribute('data-eventid'),
    );
    const per = chips.map(
      (c) => c.querySelectorAll('[data-calsdk-badge]').length,
    );
    const kinds = { event: 0, task: 0, birthday: 0 };
    const badgedKinds = { event: 0, task: 0, birthday: 0 };
    chips.forEach((c, i) => {
      const id = c.getAttribute('data-eventid');
      const k = id.startsWith('ttb_')
        ? 'task'
        : id.startsWith('bday_')
        ? 'birthday'
        : 'event';
      kinds[k]++;
      if (per[i] === 1) badgedKinds[k]++;
    });
    return {
      chips: chips.length,
      exactlyOne: per.filter((n) => n === 1).length,
      none: per.filter((n) => n === 0).length,
      many: per.filter((n) => n > 1).length,
      totalBadges: document.querySelectorAll('[data-calsdk-badge]').length,
      kinds,
      badgedKinds,
    };
  });

// ---- 3 + baseline: week view, all kinds
let p = await open('week/2026/9/30');
let s = await badgeState(p);
pass(
  s.chips > 0 && s.exactlyOne === s.chips && s.totalBadges === s.chips,
  'week: one badge per chip',
  JSON.stringify(s),
);
pass(
  s.kinds.task > 0 && s.badgedKinds.task === s.kinds.task,
  'week: task chips are badged',
  JSON.stringify(s),
);
await p.close();
p = await open('month/2026/9/30');
s = await badgeState(p);
pass(
  s.badgedKinds.birthday === s.kinds.birthday,
  'month: birthday chips are badged (if any)',
  JSON.stringify(s),
);
info('month: kinds on the page', JSON.stringify(s.kinds));

// ---- 1. scale
const realBefore = await badgeState(p);
const N = 320;
const t = await p.evaluate(async (N) => {
  const tpl = [
    ...document.querySelectorAll(
      '[role=main] [data-eventchip][jsaction][data-keyboardactiontype][data-eventid]',
    ),
  ].find((c) => !/^(ttb_|bday_)/.test(c.getAttribute('data-eventid')));
  const parent = tpl.parentElement;
  const start = performance.now();
  const longTasks = [];
  const po = new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))),
  );
  try {
    po.observe({ entryTypes: ['longtask'] });
  } catch {
    // long task timing unavailable
  }
  for (let i = 0; i < N; i++) {
    const c = tpl.cloneNode(true);
    c.querySelectorAll('[data-calsdk-badge]').forEach((x) => x.remove());
    c.setAttribute(
      'data-eventid',
      btoa(`scaleclone${i} owner@m`).replace(/=+$/, ''),
    );
    c.setAttribute('data-scale-clone', '1');
    parent.appendChild(c);
  }
  const done = () =>
    [...document.querySelectorAll('[data-scale-clone]')].every(
      (c) => c.querySelectorAll('[data-calsdk-badge]').length === 1,
    );
  let frames = 0;
  while (!done() && frames < 600) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
  }
  const ms = Math.round(performance.now() - start);
  po.disconnect();
  return { ms, frames, ok: done(), longTasks };
}, N);
pass(t.ok, `scale: ${N} inserted chips all badged`, JSON.stringify(t));
info(
  'scale: time until all badged',
  `${t.ms} ms, ${t.frames} frames, long tasks ${JSON.stringify(t.longTasks)}`,
);
pass(t.ms < 2000, 'scale: badged within 2 s', `${t.ms} ms`);
s = await badgeState(p);
pass(
  s.many === 0 && s.none === 0,
  'scale: no chip with 0 or >1 badges',
  JSON.stringify(s),
);
const churn = await p.evaluate(async () => {
  const clones = [...document.querySelectorAll('[data-scale-clone]')];
  const parent = clones[0].parentElement;
  const half = clones.slice(0, clones.length / 2);
  half.forEach((c) => c.remove());
  await new Promise((r) => setTimeout(r, 300));
  const leaked = half.filter((c) => c.isConnected).length;
  half.forEach((c) => parent.appendChild(c));
  await new Promise((r) => setTimeout(r, 800));
  const per = [...document.querySelectorAll('[data-scale-clone]')].map(
    (c) => c.querySelectorAll('[data-calsdk-badge]').length,
  );
  return { leaked, chips: per.length, allOne: per.every((n) => n === 1) };
});
pass(
  churn.allOne,
  'scale: remove half + re-add: exactly one badge per chip again',
  JSON.stringify(churn),
);
await p.evaluate(() =>
  document.querySelectorAll('[data-scale-clone]').forEach((c) => c.remove()),
);
await p.waitForTimeout(800);
const realAfter = await badgeState(p);
pass(
  JSON.stringify(realAfter) === JSON.stringify(realBefore),
  'scale: after removing the clones the real chips are exactly as before',
  `${JSON.stringify(realBefore)} vs ${JSON.stringify(realAfter)}`,
);
await p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Daily recurring' })
  .first()
  .click();
await p.waitForTimeout(1500);
const btns = await p
  .locator('[role=dialog][data-chips-dialog] [data-calsdk-popover-button]')
  .count();
pass(btns === 1, 'scale: popover button still works afterwards', `${btns}`);
await p.keyboard.press('Escape');
await p.close();

// ---- 2. narrow window
for (const width of [700, 420]) {
  p = await open('week/2026/9/30', width);
  const layout = await p.evaluate(() => ({
    w: innerWidth,
    chips: document.querySelectorAll('[role=main] [data-eventchip]').length,
    main: !!document.querySelector('[role=main]'),
    header: !!document.querySelector('header[role=banner]'),
  }));
  info(`narrow ${width}px: layout`, JSON.stringify(layout));
  s = await badgeState(p);
  pass(
    s.chips === 0 || (s.exactlyOne === s.chips && s.totalBadges === s.chips),
    `narrow ${width}px: one badge per chip`,
    JSON.stringify(s),
  );
  await p.evaluate(() =>
    document.dispatchEvent(new Event('calsdk-compat-report')),
  );
  await p.waitForTimeout(500);
  const line = p.logs.find((l) => l.startsWith('CalendarSDK compat report'));
  if (line) {
    const r = JSON.parse(line.slice('CalendarSDK compat report '.length));
    const hard = r.issues.filter((i) => i.severity === 'hard');
    pass(
      hard.length === 0,
      `narrow ${width}px: compat report has no hard issues`,
      JSON.stringify(r.issues),
    );
    info(`narrow ${width}px: compat issues`, JSON.stringify(r.issues));
  } else
    pass(
      false,
      `narrow ${width}px: compat report`,
      JSON.stringify(p.logs.slice(-3)),
    );
  const chip = p
    .locator('[role=main] [data-eventchip]')
    .filter({ hasText: 'Timed A' })
    .first();
  if (await chip.count()) {
    await chip.click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const n = await p
      .locator('[role=dialog][data-chips-dialog] [data-calsdk-popover-button]')
      .count();
    info(`narrow ${width}px: popover buttons after clicking a chip`, `${n}`);
    pass(
      n <= 1,
      `narrow ${width}px: never more than one popover button`,
      `${n}`,
    );
    await p.keyboard.press('Escape');
  } else info(`narrow ${width}px: no "Timed A" chip visible`);
  await p.close();
}

console.log('Extension coverage report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
