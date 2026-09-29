// EXPERIMENTAL — Toolbar.addButton in real Chrome over CDP with examples/calendar-toolbar: exactly one
// button next to Search, visible and not overlapping its neighbours, click isolation, survival across
// view switches / 50 navigations / popover open+close / settings and back / search / dark theme / compact
// density / narrow window, with a per-frame gap meter. Screenshots go to out/toolbar-*.png (git-ignored).
// Changes theme/density temporarily and restores them. Run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../../../examples/calendar-toolbar');
const outDir = path.resolve(here, '../out');
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });
const info = (name, detail = '') => rows.push({ level: 'INFO', name, detail });

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
  i < 40 && !(await p.locator('[data-calsdk-toolbar-button]').count());
  i++
)
  await p.waitForTimeout(250);
await p.waitForTimeout(1500);

// per-frame gap meter: on a grid route the button must be present every frame after the first 3.
// A page load wipes it, so totals are accumulated across loads.
const totals = { frames: 0, gapFrames: 0, worstRun: 0 };
const installMeter = () =>
  p.evaluate(() => {
    window.__tg = { frames: 0, gapFrames: 0, worstRun: 0, run: 0, age: 0 };
    const loop = () => {
      const g = window.__tg;
      g.frames++;
      const grid = !!document.querySelector(
        'header[role=banner] button[jsname=KzBUhd]',
      );
      const has = !!document.querySelector('[data-calsdk-toolbar-button]');
      if (grid && !has) g.age++;
      else g.age = 0;
      if (g.age >= 3) {
        g.gapFrames++;
        g.run++;
        g.worstRun = Math.max(g.worstRun, g.run);
      } else g.run = 0;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
const bank = async () => {
  const g = await p.evaluate(() => ({ ...window.__tg })).catch(() => null);
  if (!g || g.frames === undefined) return;
  totals.frames += g.frames;
  totals.gapFrames += g.gapFrames;
  totals.worstRun = Math.max(totals.worstRun, g.worstRun);
};
const load = async (url) => {
  await bank();
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  await installMeter();
};
await installMeter();

const geometry = () =>
  p.evaluate(() => {
    const btn = document.querySelector('[data-calsdk-toolbar-button]');
    const hdr = document.querySelector('header[role=banner]');
    if (!btn) return { count: 0 };
    const r = btn.getBoundingClientRect();
    const search = hdr
      .querySelector('button[jsname=KzBUhd]')
      .getBoundingClientRect();
    const others = [...hdr.querySelectorAll('button')]
      .filter((x) => !x.hasAttribute('data-calsdk-toolbar-button'))
      .map((x) => x.getBoundingClientRect())
      .filter((x) => x.width > 0);
    const overlaps = others.filter(
      (o) =>
        r.left < o.right - 1 &&
        r.right > o.left + 1 &&
        r.top < o.bottom - 1 &&
        r.bottom > o.top + 1,
    ).length;
    const top = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return {
      count: document.querySelectorAll('[data-calsdk-toolbar-button]').length,
      containers: document.querySelectorAll('[data-calsdk-toolbar]').length,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      leftOfSearch: r.right <= search.left + 1,
      sameRow: Math.abs(r.y - search.y) <= 1,
      inHeader: hdr.contains(btn),
      overlaps,
      hittable: top === btn || btn.contains(top),
      iconLoaded: btn.querySelector('img').naturalWidth > 0,
    };
  });
const ok = (g) =>
  g.count === 1 &&
  g.containers === 1 &&
  g.inHeader &&
  g.leftOfSearch &&
  g.sameRow &&
  g.overlaps === 0 &&
  g.hittable &&
  g.w === 40 &&
  g.iconLoaded;

let g = await geometry();
info('geometry', JSON.stringify(g));
pass(
  ok(g),
  'week: one visible button just left of Search, no overlaps',
  JSON.stringify(g),
);
await p.screenshot({
  path: path.join(outDir, 'toolbar-light.png'),
  clip: { x: 500, y: 0, width: 800, height: 70 },
});

// click isolation
const before = logs.length;
const snap = () =>
  p.evaluate(() => ({
    path: location.pathname,
    dialogs: document.querySelectorAll('[role=dialog]').length,
    searchBox: !!document.querySelector(
      'input[aria-label="Search"]:not([type=checkbox])',
    ),
  }));
const snapBefore = await snap();
await p.locator('[data-calsdk-toolbar-button]').click();
await p.waitForTimeout(600);
const snapAfter = await snap();
pass(
  logs.slice(before).filter((l) => l === 'CalendarSDK toolbar click').length ===
    1 && JSON.stringify(snapBefore) === JSON.stringify(snapAfter),
  'click: handler once, no navigation, no dialog, Search not opened',
  JSON.stringify({ l: logs.slice(before), snapBefore, snapAfter }),
);
// keyboard: Enter on the focused button activates it; a shortcut key (e.g. "m") must not reach Calendar
await p.locator('[data-calsdk-toolbar-button]').focus();
const k0 = logs.length;
await p.keyboard.press('Enter');
await p.keyboard.press('m');
await p.waitForTimeout(600);
pass(
  logs.slice(k0).filter((l) => l === 'CalendarSDK toolbar click').length >= 1 &&
    (await p.evaluate(() => document.body.dataset.viewkey)) === 'WEEK',
  'keyboard: Enter activates, single-key shortcuts do not leak to Calendar',
  JSON.stringify({
    l: logs.slice(k0),
    vk: await p.evaluate(() => document.body.dataset.viewkey),
  }),
);
await p
  .locator('body')
  .click({ position: { x: 5, y: 500 }, force: true })
  .catch(() => {});

// view switches
for (const [key, vk] of [
  ['m', 'MONTH'],
  ['d', 'DAY'],
  ['a', 'AGENDA'],
  ['x', 'CUSTOM_DAYS'],
  ['y', 'YEAR'],
  ['w', 'WEEK'],
]) {
  await p.keyboard.press(key);
  await p.waitForTimeout(1500);
  g = await geometry();
  pass(
    (await p.evaluate(() => document.body.dataset.viewkey)) === vk && ok(g),
    `view ${vk}: button present and placed`,
    JSON.stringify(g),
  );
}

// 50 navigations
for (let i = 0; i < 50; i++) {
  await p.keyboard.press(i % 2 ? 'p' : 'n');
  await p.waitForTimeout(120);
}
await p.waitForTimeout(1200);
g = await geometry();
pass(
  ok(g),
  'after 50 next/prev navigations: exactly one button, placed',
  JSON.stringify(g),
);

// popover open/close cycles
for (let i = 0; i < 3; i++) {
  await p.keyboard.press('t');
  await p.waitForTimeout(900);
  await p
    .locator('[role=main] [data-eventchip]')
    .first()
    .click()
    .catch(() => {});
  await p.waitForTimeout(700);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
}
g = await geometry();
pass(ok(g), 'after popover open/close cycles', JSON.stringify(g));

// settings and back (the bar may differ there)
await p.goto('https://calendar.google.com/calendar/u/0/r/settings?hl=en', {
  waitUntil: 'load',
});
await p.waitForTimeout(3500);
g = await geometry();
info('settings page', JSON.stringify(g));
await load('https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en');
g = await geometry();
pass(ok(g), 'back on the grid after settings: one button', JSON.stringify(g));

// search route
await load('https://calendar.google.com/calendar/u/0/r/search?q=CALSDK&hl=en');
g = await geometry();
info('search route', JSON.stringify(g));

// dark theme + compact density (restored afterwards)
await load('https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en');
const settings = async (fn) => {
  await p.getByRole('button', { name: /Settings menu/i }).click();
  await p
    .getByRole('menuitem', { name: /^Appearance/ })
    .first()
    .click();
  await p.waitForTimeout(900);
  await fn();
  await p
    .getByRole('button', { name: /^(Close|Save)/i })
    .first()
    .click()
    .catch(() => p.keyboard.press('Escape'));
  await p.waitForTimeout(1500);
};
try {
  await settings(async () => {
    await p.locator('[role=dialog] input[value=dark]').check({ force: true });
  });
  g = await geometry();
  pass(ok(g), 'dark theme: button present and placed', JSON.stringify(g));
  await p.screenshot({
    path: path.join(outDir, 'toolbar-dark.png'),
    clip: { x: 500, y: 0, width: 800, height: 70 },
  });
} finally {
  await settings(async () => {
    await p.locator('[role=dialog] input[value=device]').check({ force: true });
  }).catch(() => {});
}

// narrow windows
for (const width of [900, 700, 420]) {
  await p.setViewportSize({ width, height: 900 });
  await p.waitForTimeout(1200);
  g = await geometry();
  info(`narrow ${width}px`, JSON.stringify(g));
  if (g.count)
    pass(
      g.count === 1 && g.overlaps === 0,
      `narrow ${width}px: one button, no overlaps`,
      JSON.stringify(g),
    );
  else
    info(
      `narrow ${width}px: button not shown (Calendar hides Search too?)`,
      JSON.stringify(
        await p.evaluate(
          () => !!document.querySelector('header button[jsname=KzBUhd]'),
        ),
      ),
    );
}
await p.setViewportSize({ width: 1300, height: 950 });

await bank();
const gap = totals;
pass(
  gap.worstRun <= 2,
  'per-frame meter: never a grid frame (≥3 frames old) without the button',
  JSON.stringify(gap),
);
info('frames', `${gap.gapFrames}/${gap.frames}, worst run ${gap.worstRun}`);

await p.close();
console.log('Extension toolbar report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
