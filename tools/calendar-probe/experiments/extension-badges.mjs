// EXPERIMENTAL — loads examples/calendar-badges (built SDK) in real Chrome over CDP and verifies that
// every eligible chip carries exactly one badge in many states, measuring per-frame gaps.
// Start Chrome with --enable-unsafe-extension-debugging (see extension-smoke.mjs); run `yarn gulp` first.
// Changes theme/density temporarily and restores them (Device default / Comfortable).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-badges',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const logs = [];
p.on('console', (m) => {
  if (m.text().startsWith('CalendarSDK')) logs.push(m.text());
});
const rows = [];
const check = (level, name, detail = '') => rows.push({ level, name, detail });
const settle = (ms = 1500) => p.waitForTimeout(ms);

await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 1500 })
  .catch(() => {});

// per-frame gap meter: a chip that has existed for >= 3 frames but has no badge is a visible gap
await p.evaluate(() => {
  window.__gap = { frames: 0, gapFrames: 0, worstRun: 0, run: 0 };
  const eligible = () =>
    [...document.querySelectorAll('[role=main] [data-eventchip]')].filter(
      (c) =>
        c.hasAttribute('jsaction') &&
        c.hasAttribute('data-keyboardactiontype') &&
        c.getAttribute('data-eventid') &&
        !/^(ttb_|bday_)/.test(c.getAttribute('data-eventid')),
    );
  const loop = () => {
    const g = window.__gap;
    g.frames++;
    let gap = false;
    for (const c of eligible()) {
      c.__age = (c.__age ?? 0) + 1;
      if (c.__age >= 3 && !c.querySelector('[data-calsdk-badge]')) gap = true;
    }
    if (gap) {
      g.gapFrames++;
      g.run++;
      g.worstRun = Math.max(g.worstRun, g.run);
    } else g.run = 0;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const gap = () => p.evaluate(() => ({ ...window.__gap }));
const state = () =>
  p.evaluate(() => {
    const chips = [
      ...document.querySelectorAll('[role=main] [data-eventchip]'),
    ].filter(
      (c) =>
        c.hasAttribute('jsaction') &&
        c.hasAttribute('data-keyboardactiontype') &&
        c.getAttribute('data-eventid') &&
        !/^(ttb_|bday_)/.test(c.getAttribute('data-eventid')),
    );
    const perChip = chips.map(
      (c) => c.querySelectorAll('[data-calsdk-badge]').length,
    );
    return {
      chips: chips.length,
      missing: perChip.filter((n) => n === 0).length,
      duplicated: perChip.filter((n) => n > 1).length,
      allBadgesInDoc: document.querySelectorAll('[data-calsdk-badge]').length,
      texts: [
        ...new Set(
          [...document.querySelectorAll('[data-calsdk-badge]')].map(
            (n) => n.textContent,
          ),
        ),
      ],
      stray: [...document.querySelectorAll('[data-calsdk-badge]')].filter(
        (n) => !n.closest('[data-eventchip]'),
      ).length,
    };
  });
const verify = async (label) => {
  await settle(1200);
  const s = await state();
  const ok =
    s.chips > 0 || label.includes('empty')
      ? s.missing === 0 &&
        s.duplicated === 0 &&
        s.allBadgesInDoc === s.chips &&
        s.stray === 0
      : true;
  check(
    ok ? 'PASS' : 'FAIL',
    `${label}: one badge per chip`,
    `chips=${s.chips} badges=${s.allBadgesInDoc} missing=${
      s.missing
    } duplicated=${s.duplicated} stray=${s.stray} texts=${JSON.stringify(
      s.texts,
    )}`,
  );
};
for (let i = 0; i < 40 && (await state()).chips === 0; i++)
  await p.waitForTimeout(250);
await verify('initial week');
await p.screenshot({ path: '/tmp/calsdk-badges-week.png' });

// popover open/close x5: the popover strips the injected children
for (let i = 0; i < 5; i++) {
  await p
    .locator('[data-eventchip]')
    .filter({ hasText: 'Timed A' })
    .first()
    .click();
  await p.waitForTimeout(700);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
}
await verify('after 5 popover open/close cycles');

// clicking a badge: our handler runs, Calendar's popover does not open
const target = await p.evaluate(() => {
  const dec = (t) => {
    const x = t.replace(/-/g, '+').replace(/_/g, '/');
    return atob(x + '='.repeat((4 - (x.length % 4)) % 4))
      .split(' ')[0]
      .replace(/_.*/, '');
  };
  for (const chip of document.querySelectorAll(
    '[role=main] [data-eventchip]',
  )) {
    const id = chip.getAttribute('data-eventid');
    if (/^(ttb_|bday_)/.test(id ?? '')) continue;
    const badge = chip.querySelector('[data-calsdk-badge]');
    if (!badge) continue;
    const r = badge.getBoundingClientRect();
    const x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    if (
      document.elementFromPoint(x, y) === badge ||
      badge.contains(document.elementFromPoint(x, y))
    )
      return { x, y, eventId: dec(id) };
  }
  return null;
});
const before = logs.length;
if (target) {
  await p.mouse.click(target.x, target.y);
  await p.waitForTimeout(800);
}
const popover = await p.locator('[role=dialog][data-chips-dialog]').count();
check(
  target &&
    logs.length === before + 1 &&
    logs[logs.length - 1].endsWith(target.eventId)
    ? 'PASS'
    : 'FAIL',
  'badge click runs the app handler with the right event',
  `${logs[logs.length - 1] ?? 'no log'} (expected ${target?.eventId})`,
);
check(
  popover === 0 ? 'PASS' : 'FAIL',
  'badge click does not open Calendar’s popover',
  `popovers=${popover}`,
);

// views
for (const k of ['m', 'd', 'a', 'x', 'w']) {
  await p.keyboard.press(k);
  await verify(`view key ${k}`);
}

// 50 navigations
for (let i = 0; i < 25; i++) {
  await p.getByRole('button', { name: /^Next week/ }).click();
  await p.waitForTimeout(150);
  await p.getByRole('button', { name: /^Previous week/ }).click();
  await p.waitForTimeout(150);
}
await verify('after 50 navigations');
const g1 = await gap();
check(
  g1.worstRun <= 2 ? 'PASS' : 'WARN',
  'frame gaps so far (chip ≥3 frames old without a badge)',
  `${g1.gapFrames}/${g1.frames} frames, worst run ${g1.worstRun}`,
);

// drag and return
const bb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .boundingBox();
if (bb) {
  const cx = bb.x + bb.width / 2,
    cy = bb.y + bb.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await p.mouse.move(cx, cy + i * 8, { steps: 2 });
    await p.waitForTimeout(70);
  }
  const midState = await state();
  check(
    midState.duplicated === 0 && midState.stray === 0 ? 'PASS' : 'FAIL',
    'mid-drag: no duplicate or stray badges',
    JSON.stringify(midState),
  );
  await p.mouse.move(cx, cy, { steps: 6 });
  await p.mouse.up();
  await verify('after drag returned to start');
}

// theme + density
const appearance = async (fn) => {
  await p.getByRole('button', { name: /Settings menu/i }).click();
  await p.getByRole('menuitem', { name: /^Appearance/i }).click();
  await p.waitForTimeout(900);
  await fn();
  await p.getByRole('button', { name: 'Done' }).click({ force: true });
  await p.waitForTimeout(1500);
};
const setDensity = async (v) => {
  await p
    .locator(
      '[role=dialog] [role=combobox], [role=dialog] [aria-haspopup=listbox]',
    )
    .last()
    .click({ force: true });
  await p.waitForTimeout(400);
  await p.locator(`li[role=option][data-value=${v}]`).click({ force: true });
  await p.waitForTimeout(400);
};
try {
  await appearance(async () => {
    await p.locator('[role=dialog] input[value=dark]').check({ force: true });
  });
  await verify('dark theme');
  await p.screenshot({ path: '/tmp/calsdk-badges-dark.png' });
  await appearance(async () => {
    await p.locator('[role=dialog] input[value=light]').check({ force: true });
    await setDensity('compact');
  });
  await verify('light + compact density');
  await p.screenshot({ path: '/tmp/calsdk-badges-compact.png' });
} finally {
  await appearance(async () => {
    await setDensity('comfortable');
    await p.locator('[role=dialog] input[value=device]').check({ force: true });
  }).catch(() => {});
}
await verify('theme/density restored');

// month + schedule layout screenshots
await p.keyboard.press('m');
await verify('month view');
await p.screenshot({ path: '/tmp/calsdk-badges-month.png' });
await p.keyboard.press('a');
await verify('schedule view');
await p.screenshot({ path: '/tmp/calsdk-badges-agenda.png' });
const g2 = await gap();
check(
  g2.worstRun <= 2 ? 'PASS' : 'WARN',
  'frame gaps overall',
  `${g2.gapFrames}/${g2.frames} frames, worst consecutive run ${g2.worstRun}`,
);

console.log('Extension badges report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await p.close();
await b.close();
process.exit(fails ? 1 : 0);
