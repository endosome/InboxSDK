// EXPERIMENTAL — hover cards (docs/hover-card-plan.md §6.2) in real Chrome over CDP with examples/calendar-hover-card:
// shows after the delay beside the chip inside the viewport, hides on leave / pointer down / wheel / Escape / route
// change / key activation, keyboard focus shows it, an interactive card can be entered and used without opening
// Calendar's popover, stacking (below Calendar's overlay host), overlapping chips, month view, dark theme,
// a 420 px window, Arabic (RTL), and a per-frame meter that no card lingers after the pointer left.
// Changes the theme temporarily and restores it. Read-only otherwise. Run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-hover-card',
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

const decodeId = (t) => {
  const x = t
    .replace(/^(ttb_|bday_)/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return atob(x + '='.repeat((4 - (x.length % 4)) % 4))
    .split(' ')[0]
    .replace(/_\d{8}(T\d{6}Z)?$/, '');
};

let p;
let logs;
async function open(view = 'week/2026/9/30', hl = 'en', width = 1300) {
  if (p) await p.close().catch(() => {});
  p = await ctx.newPage();
  await p.setViewportSize({ width, height: 900 });
  logs = [];
  p.on('console', (m) => {
    if (m.text().startsWith('CalendarSDK hover')) logs.push(m.text());
  });
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${view}?hl=${hl}`, {
    waitUntil: 'load',
  });
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
  // the browser remembers the last pointer position across pages and replays it as a hover: park it
  await p.mouse.move(2, 500);
  await p.waitForTimeout(500);
  // per-frame meter: frames with a card visible while the pointer is outside every chip and card
  await p.evaluate(() => {
    window.__hm = {
      frames: 0,
      lingerFrames: 0,
      worst: 0,
      run: 0,
      pointerOnChipOrCard: false,
    };
    const track = (e) => {
      const t = e.target;
      window.__hm.pointerOnChipOrCard = !!(
        t.closest &&
        (t.closest('[data-eventchip]') || t.closest('[data-calsdk-hover-card]'))
      );
    };
    document.addEventListener('pointermove', track, true);
    const loop = () => {
      const g = window.__hm;
      g.frames++;
      const card = document.querySelector('[data-calsdk-hover-card]');
      if (card && !g.pointerOnChipOrCard) {
        g.run++;
        if (g.run >= 12) g.lingerFrames++; // 12 frames ≈ 200 ms: past the 120 ms grace
        g.worst = Math.max(g.worst, g.run);
      } else g.run = 0;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
const chip = (text, nth = 0) =>
  p.locator('[role=main] [data-eventchip]').filter({ hasText: text }).nth(nth);
const cardState = () =>
  p.evaluate(() => {
    const f = document.querySelector('[data-calsdk-hover-card]');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return {
      count: document.querySelectorAll('[data-calsdk-hover-card]').length,
      text: f.textContent.slice(0, 60),
      rect: {
        l: Math.round(r.left),
        t: Math.round(r.top),
        r: Math.round(r.right),
        b: Math.round(r.bottom),
      },
      role: f.getAttribute('role'),
      interactive: f.hasAttribute('data-calsdk-interactive'),
      theme: f.getAttribute('data-calsdk-theme'),
      visible: getComputedStyle(f).visibility === 'visible',
      vw: innerWidth,
      vh: innerHeight,
    };
  });
const chipRect = async (loc) => {
  const bb = await loc.boundingBox();
  return {
    l: Math.round(bb.x),
    t: Math.round(bb.y),
    r: Math.round(bb.x + bb.width),
    b: Math.round(bb.y + bb.height),
    cx: bb.x + bb.width / 2,
    cy: bb.y + bb.height / 2,
  };
};
const overlaps = (a, c) => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
const inViewport = (s) =>
  s.rect.l >= 0 && s.rect.t >= 0 && s.rect.r <= s.vw && s.rect.b <= s.vh;
const away = () => p.mouse.move(2, 500);

// ---------- week view
await open();
let c = chip('Timed A');
let cr = await chipRect(c);
await c.hover();
await p.waitForTimeout(150);
pass((await cardState()) === null, 'no card before the delay (150 ms)');
await p.waitForTimeout(400);
let s = await cardState();
pass(
  !!s && s.count === 1 && s.visible,
  'card shown after the delay',
  JSON.stringify(s),
);
pass(
  !!s && s.role === 'tooltip' && !s.interactive,
  'plain card: role=tooltip, not interactive',
  JSON.stringify(s),
);
pass(
  !!s && !overlaps(s.rect, cr),
  'card is beside the chip, not over it',
  JSON.stringify({ card: s?.rect, chip: cr }),
);
pass(!!s && inViewport(s), 'card is inside the viewport', JSON.stringify(s));
pass(
  logs.some((l) => l.startsWith('CalendarSDK hover render ')) &&
    !(await p.locator('[role=dialog]').count()),
  'render was called and Calendar shows no popover of its own on hover',
  JSON.stringify(logs),
);
const z = await p.evaluate(() => ({
  layer: getComputedStyle(document.querySelector('[data-calsdk-hover-layer]'))
    .zIndex,
  host: getComputedStyle(document.getElementById('yDmH0d')).zIndex,
  layerPe: getComputedStyle(document.querySelector('[data-calsdk-hover-layer]'))
    .pointerEvents,
  cardPe: getComputedStyle(document.querySelector('[data-calsdk-hover-card]'))
    .pointerEvents,
  parent: document.querySelector('[data-calsdk-hover-layer]').parentElement
    .tagName,
}));
pass(
  +z.layer < +z.host && z.parent === 'BODY',
  "layer is on body, below Calendar's overlay host (popovers cover it)",
  JSON.stringify(z),
);
pass(
  z.layerPe === 'none' && z.cardPe === 'none',
  'a plain card and its layer ignore the pointer',
  JSON.stringify(z),
);
const before = logs.length;
await away();
await p.waitForTimeout(80);
pass((await cardState()) === null, 'card hidden right after the pointer left');
pass(
  logs.slice(before).some((l) => l.startsWith('CalendarSDK hover abort')) &&
    logs.slice(before).some((l) => l.startsWith('CalendarSDK hover cleanup')),
  'signal aborted and cleanup ran on hide',
  JSON.stringify(logs.slice(before)),
);

// hide triggers
for (const [name, act] of [
  ['pointer down', async () => p.mouse.down()],
  ['wheel', async () => p.mouse.wheel(0, 120)],
  ['Escape', async () => p.keyboard.press('Escape')],
  ['route change (n)', async () => p.keyboard.press('n')],
]) {
  await open(); // fresh page: a popover left open by the previous step would (rightly) block the card
  c = chip('Timed A');
  await c.hover();
  await p.waitForTimeout(600);
  const shownFirst = !!(await cardState());
  await act();
  await p.waitForTimeout(150);
  if (name === 'pointer down') await p.mouse.up();
  pass(
    shownFirst && (await cardState()) === null,
    `hides on ${name}`,
    JSON.stringify(await cardState()),
  );
}

// keyboard focus
await open();
c = chip('Timed A');
await c.focus();
await p.waitForTimeout(250);
s = await cardState();
const focusable = await c.evaluate((el) => el.hasAttribute('tabindex'));
if (focusable)
  pass(
    !!s,
    'keyboard focus of a chip shows the card at once (no delay)',
    JSON.stringify(s),
  );
else info('Timed A chip is not focusable here');
await p.keyboard.press('Escape');
await p.waitForTimeout(150);
pass((await cardState()) === null, 'Escape hides a focus-triggered card');
await p.evaluate(() => document.activeElement?.blur());

// popover open => no card
await open();
c = chip('Daily recurring');
await c.click();
await p.waitForTimeout(1200);
await chip('Timed A').hover();
await p.waitForTimeout(700);
pass((await cardState()) === null, 'no card while a Calendar popover is open');

// interactive card
await open();
c = chip('Daily recurring');
await c.hover();
await p.waitForTimeout(500);
s = await cardState();
pass(
  !!s && s.interactive && s.role === 'dialog',
  'interactive card (recurring instance): role=dialog, pointer-enabled',
  JSON.stringify(s),
);
if (s) {
  const btn = p.locator('[data-calsdk-hover-card] button');
  pass((await btn.count()) === 1, 'the app button is in the card');
  // cross from chip to card
  await p.mouse.move((s.rect.l + s.rect.r) / 2, (s.rect.t + s.rect.b) / 2, {
    steps: 8,
  });
  await p.waitForTimeout(400);
  pass(
    !!(await cardState()),
    'the pointer can cross onto the card without it closing',
  );
  const n = logs.length;
  const urlBefore = new URL(p.url()).pathname;
  await btn.click();
  await p.waitForTimeout(500);
  pass(
    logs.slice(n).some((l) => l.startsWith('CalendarSDK hover click')) &&
      !(await p
        .locator('[role=dialog]:not([data-calsdk-hover-card])')
        .count()) &&
      new URL(p.url()).pathname === urlBefore,
    'clicking the button runs the app handler; Calendar opens no popover and does not navigate',
    JSON.stringify({ l: logs.slice(n), url: p.url() }),
  );
  pass(!!(await cardState()), 'using the card does not close it');
  await away();
  await p.waitForTimeout(400);
  pass(
    (await cardState()) === null,
    'leaving the card closes it after the grace',
  );
}

// overlapping chips ([CALSDK] Dup: three identical overlapping events)
await open();
const dup = p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Dup' });
const dupCount = await dup.count();
if (dupCount >= 2) {
  const r = await chipRect(dup.first());
  await p.mouse.move(r.cx, r.cy, { steps: 4 });
  await p.waitForTimeout(700);
  const topId = await p.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-eventchip]');
      return el ? el.getAttribute('data-eventid') : null;
    },
    [r.cx, r.cy],
  );
  const rendered = logs
    .filter((l) => l.startsWith('CalendarSDK hover render '))
    .slice(-3);
  s = await cardState();
  pass(
    !!s &&
      s.count === 1 &&
      !!topId &&
      rendered.length > 0 &&
      rendered[rendered.length - 1].endsWith(decodeId(topId)),
    'overlapping chips: exactly one card, for the chip under the pointer',
    JSON.stringify({ s, topId: topId && decodeId(topId), rendered }),
  );
} else info('overlapping chips: fewer than 2 "Dup" chips on this week');
await away();
await p.waitForTimeout(300);

// meter
let meter = await p.evaluate(() => ({ ...window.__hm }));
pass(
  meter.lingerFrames === 0,
  'per-frame meter (week): no card lingers after the pointer left',
  JSON.stringify(meter),
);
info('meter (week)', `${meter.frames} frames`);

// ---------- month view
await open('month/2026/9/30');
c = chip('Daily recurring');
await c.hover();
await p.waitForTimeout(600);
s = await cardState();
pass(
  !!s && inViewport(s) && !overlaps(s.rect, await chipRect(c)),
  'month view: card beside the chip, inside the viewport',
  JSON.stringify(s),
);
await away();

// ---------- dark theme
await open();
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
  await chip('Timed A').hover();
  await p.waitForTimeout(600);
  s = await cardState();
  pass(
    !!s && s.theme === 'dark',
    'dark theme: the card is dark (from the grid background)',
    JSON.stringify(s),
  );
  await p.screenshot({
    path: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../out/hover-card-dark.png',
    ),
  });
} finally {
  await away();
  await settings(async () => {
    await p.locator('[role=dialog] input[value=device]').check({ force: true });
  }).catch(() => {});
}
await away();
await chip('Timed A').hover();
await p.waitForTimeout(600);
s = await cardState();
pass(
  !!s && s.theme === 'light',
  'light theme restored: the card is light',
  JSON.stringify(s),
);
await p.screenshot({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../out/hover-card-light.png',
  ),
});

// ---------- narrow window
await open('week/2026/9/30', 'en', 420);
c = chip('Timed A');
await c.scrollIntoViewIfNeeded();
await c.hover();
await p.waitForTimeout(600);
s = await cardState();
pass(
  !!s && inViewport(s) && s.rect.r - s.rect.l <= 404,
  '420 px window: card inside the viewport and at most 404 px wide',
  JSON.stringify(s),
);
pass(
  !!s && !overlaps(s.rect, await chipRect(c)),
  '420 px window: card does not cover the chip',
  JSON.stringify(s),
);

// ---------- Arabic (RTL)
await open('week/2026/9/30', 'ar');
c = chip('Timed A');
cr = await chipRect(c);
await c.hover();
await p.waitForTimeout(600);
s = await cardState();
pass(
  !!s && s.rect.r <= cr.l + 1 && inViewport(s),
  'RTL (ar): the card prefers the left of the chip',
  JSON.stringify({ card: s?.rect, chip: cr }),
);
await away();
await p.waitForTimeout(300);
meter = await p.evaluate(() => ({ ...window.__hm }));
pass(
  meter.lingerFrames === 0,
  'per-frame meter (ar): no card lingers',
  JSON.stringify(meter),
);

await p.close();
console.log('Extension hover card report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
