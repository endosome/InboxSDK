// EXPERIMENTAL — loads examples/calendar-popover-button (built SDK) in real Chrome over CDP and checks
// that every kind of event popover gets exactly one button with the right EventRef, that the button is
// removed when the popover closes, and that quick-create/other dialogs never get one.
// Start Chrome with --enable-unsafe-extension-debugging (see extension-smoke.mjs); run `yarn gulp` first.
// Uses both signed-in accounts (/u/0 owner, /u/1 invitee/read-only viewer). Read-only apart from opening
// popovers; theme is switched to dark and restored.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-popover-button',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const check = (level, name, detail = '') => rows.push({ level, name, detail });

const decodeId = (t) => {
  const x = t
    .replace(/^(ttb_|bday_)/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0];
};

async function installGapMeter(p) {
  // per-frame gap meter for popovers: a popover ≥3 frames old without our button
  await p.evaluate(() => {
    window.__pgap = { frames: 0, gapFrames: 0, worstRun: 0, run: 0 };
    const loop = () => {
      const g = window.__pgap;
      g.frames++;
      let gap = false;
      for (const d of document.querySelectorAll(
        '[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]',
      )) {
        if (
          d.querySelector('input, textarea') ||
          !d.querySelector('[data-eventid]')
        )
          continue;
        d.__age = (d.__age ?? 0) + 1;
        if (d.__age >= 3 && !d.querySelector('[data-calsdk-popover-button]'))
          gap = true;
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
}

async function openPage(account, view = 'week/2026/9/30') {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  p.logs = [];
  p.on('console', (m) => {
    if (m.text().startsWith('CalendarSDK popover')) p.logs.push(m.text());
  });
  await p.goto(
    `https://calendar.google.com/calendar/u/${account}/r/${view}?hl=en`,
    { waitUntil: 'load' },
  );
  await p
    .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
    .first()
    .click({ timeout: 2000 })
    .catch(() => {});
  for (
    let i = 0;
    i < 40 &&
    !(await p.locator('[role=main] [data-eventchip][data-eventid]').count());
    i++
  )
    await p.waitForTimeout(250);
  await p.waitForTimeout(800);
  await installGapMeter(p);
  return p;
}

const popoverState = (p) =>
  p.evaluate(() => {
    const dialogs = [
      ...document.querySelectorAll('[role=dialog][data-chips-dialog]'),
    ];
    const d = dialogs.find(
      (x) =>
        x.getAttribute('data-allow-wheel-scroll') === 'false' &&
        !x.querySelector('input, textarea'),
    );
    const stray = [
      ...document.querySelectorAll('[data-calsdk-popover-button]'),
    ].filter(
      (n) =>
        !n.closest(
          '[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]',
        ),
    ).length;
    if (!d)
      return {
        open: false,
        buttons: 0,
        stray,
        total: document.querySelectorAll('[data-calsdk-popover-button]').length,
      };
    const btn = d.querySelector('[data-calsdk-popover-button]');
    const dr = d.getBoundingClientRect();
    const br = btn?.getBoundingClientRect();
    return {
      open: true,
      eventId:
        d.querySelector('[data-eventid]')?.getAttribute('data-eventid') ?? null,
      buttons: d.querySelectorAll('[data-calsdk-popover-button]').length,
      text: btn?.textContent ?? null,
      inside: br
        ? br.top >= dr.top - 1 &&
          br.bottom <= dr.bottom + 1 &&
          br.left >= dr.left - 1 &&
          br.right <= dr.right + 1
        : null,
      visible: br ? br.width > 0 && br.height > 0 : null,
      stray,
      total: document.querySelectorAll('[data-calsdk-popover-button]').length,
    };
  });

const isOpen = (p) =>
  p
    .locator('[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]')
    .filter({ hasNot: p.locator('input, textarea') })
    .count()
    .then((n) => n > 0);
/** Calendar itself desynchronises when Escape/click are sent too quickly (verified without the SDK): wait for state. */
async function ensureClosed(p) {
  for (let i = 0; i < 20 && (await isOpen(p)); i++) {
    if (i % 4 === 0) await p.keyboard.press('Escape');
    else if (i % 4 === 2)
      await p
        .locator('[role=dialog][data-chips-dialog] button[jsname=LgbsSe]')
        .first()
        .click({ timeout: 1000 })
        .catch(() => {});
    await p.waitForTimeout(250);
  }
}
async function checkPopover(p, label, openFn, expectKind) {
  await ensureClosed(p);
  try {
    await checkPopoverInner(p, label, openFn, expectKind);
  } catch (e) {
    check(
      'FAIL',
      `${label}: scenario threw`,
      String(e.message).split('\n')[0].slice(0, 140),
    );
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(600);
  }
}
async function checkPopoverInner(p, label, openFn, expectKind) {
  const before = p.logs.length;
  await openFn();
  await p.waitForTimeout(1200);
  const s = await popoverState(p);
  const openLog = p.logs
    .slice(before)
    .find((l) => l.startsWith('CalendarSDK popover open'));
  const ok =
    s.open &&
    s.buttons === 1 &&
    s.text === 'Open in CRM' &&
    s.inside &&
    s.visible &&
    s.stray === 0;
  check(
    ok ? 'PASS' : 'FAIL',
    `${label}: one button, inside the popover`,
    JSON.stringify({
      open: s.open,
      buttons: s.buttons,
      inside: s.inside,
      visible: s.visible,
      stray: s.stray,
    }),
  );
  if (s.open) {
    const id = decodeId(s.eventId).replace(/_(\d{8}(T\d{6}Z)?)$/, '');
    const kindOk = !expectKind || openLog?.includes(` ${expectKind} `);
    check(
      openLog && openLog.includes(` ${id} `) && kindOk ? 'PASS' : 'FAIL',
      `${label}: handler got the popover's own EventRef`,
      `${openLog ?? 'no open log'} (dialog id ${id}, kind ${
        expectKind ?? 'any'
      })`,
    );
    // click: handler runs with the same event, popover stays open
    const btn = p
      .locator('[role=dialog][data-chips-dialog] [data-calsdk-popover-button]')
      .first();
    const n = p.logs.length;
    await btn.click();
    await p.waitForTimeout(500);
    const clickLog = p.logs
      .slice(n)
      .find((l) => l.startsWith('CalendarSDK popover click'));
    const after = await popoverState(p);
    check(
      clickLog && clickLog.includes(` ${id} `) && after.open ? 'PASS' : 'FAIL',
      `${label}: click runs the handler, popover stays open`,
      `${clickLog ?? 'no click log'}; open=${after.open}`,
    );
  }
  await p.screenshot({
    path: `/tmp/calsdk-popover-${label.replace(/\W+/g, '-')}.png`,
  });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  let closed = await popoverState(p);
  if (closed.open) {
    // Calendar itself does not close a popover opened with Space on Escape (verified without the SDK):
    // close it with its own Close button so the scenario can continue.
    check(
      'INFO',
      `${label}: Escape did not close the popover (Calendar behaviour without the SDK too)`,
      '',
    );
    await p
      .locator('[role=dialog][data-chips-dialog] button[jsname=LgbsSe]')
      .first()
      .click()
      .catch(() => {});
    await p.waitForTimeout(700);
    closed = await popoverState(p);
  }
  check(
    !closed.open && closed.total === 0 ? 'PASS' : 'FAIL',
    `${label}: closing removes the button`,
    `open=${closed.open} injected=${closed.total}`,
  );
}
const chipClick =
  (p, text, nth = 0) =>
  () =>
    p
      .locator('[role=main] [data-eventchip]')
      .filter({ hasText: text })
      .nth(nth)
      .click();

// ---- owner account, week view
let p = await openPage(0);
await checkPopover(p, 'event (owner)', chipClick(p, 'Timed A'), 'event');
await checkPopover(
  p,
  'recurring instance',
  chipClick(p, 'Weekly recurring'),
  'event',
);
await checkPopover(
  p,
  'multi-day segment',
  chipClick(p, 'MultiDay', 0),
  'event',
);
await checkPopover(p, 'all-day event', chipClick(p, 'AllDay weekly'), 'event');
await checkPopover(p, 'task', chipClick(p, 'Task A'), 'task');
await checkPopover(
  p,
  'birthday (Delete only)',
  chipClick(p, 'birthday'),
  'birthday',
);
// Space on a focused chip opens the popover too
await checkPopover(
  p,
  'event opened with Space',
  async () => {
    await p
      .locator('[role=main] [data-eventchip]')
      .filter({ hasText: 'Timed A' })
      .first()
      .focus();
    await p.keyboard.press('Space');
  },
  'event',
);
// opening one popover while another is open
await p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Weekly recurring' })
  .first()
  .click();
await p.waitForTimeout(900);
await p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Dup' })
  .first()
  .click()
  .catch(() => {});
await p.waitForTimeout(1200);
const swapped = await popoverState(p);
check(
  swapped.buttons === 1 && swapped.total === 1 ? 'PASS' : 'FAIL',
  'switching from one popover to another leaves exactly one button',
  JSON.stringify(swapped),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
// 10 open/close cycles
for (let i = 0; i < 10; i++) {
  await chipClick(p, 'Timed A')();
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(350);
}
await checkPopover(
  p,
  'event after 10 open/close cycles',
  chipClick(p, 'Timed A'),
  'event',
);

// quick-create and other dialogs never get a button
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p
  .getByRole('menuitem', { name: /^Event/ })
  .first()
  .click();
await p.waitForTimeout(1500);
let q = await popoverState(p);
check(
  q.total === 0 ? 'PASS' : 'FAIL',
  'quick-create dialog gets no button',
  JSON.stringify(q),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p.getByRole('menuitem', { name: /^Task/ }).first().click();
await p.waitForTimeout(1500);
q = await popoverState(p);
check(
  q.total === 0 ? 'PASS' : 'FAIL',
  'quick-create (task) dialog gets no button',
  JSON.stringify(q),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(800);

// other views (fresh page: the quick-create checks above leave Calendar in a state where view keys are swallowed)
const gapBefore = await p.evaluate(() => ({ ...window.__pgap }));
await p.reload();
await p.waitForTimeout(4000);
await installGapMeter(p);
for (const [key, label, text] of [
  ['m', 'month view', 'Daily recurring'],
  ['a', 'schedule view', 'Timed A'],
  ['d', 'day view', 'Daily recurring'],
  ['x', 'custom days view', 'Daily recurring'],
]) {
  await ensureClosed(p);
  await p.keyboard.press(key);
  await p.waitForTimeout(1500);
  await checkPopover(
    p,
    label,
    () =>
      p
        .locator('[role=main] [data-eventchip]')
        .filter({ hasText: text })
        .first()
        .click(),
    'event',
  );
}
await p.keyboard.press('w');
await p.waitForTimeout(1200);

// dark theme
const appearance = async (fn) => {
  await p.getByRole('button', { name: /Settings menu/i }).click();
  await p.getByRole('menuitem', { name: /^Appearance/i }).click();
  await p.waitForTimeout(900);
  await fn();
  await p.getByRole('button', { name: 'Done' }).click({ force: true });
  await p.waitForTimeout(1500);
};
try {
  await appearance(async () => {
    await p.locator('[role=dialog] input[value=dark]').check({ force: true });
  });
  await checkPopover(
    p,
    'event in dark theme',
    chipClick(p, 'Timed A'),
    'event',
  );
} finally {
  await appearance(async () => {
    await p.locator('[role=dialog] input[value=device]').check({ force: true });
  }).catch(() => {});
}
const gapAfter = await p.evaluate(() => ({ ...window.__pgap }));
const gap = {
  frames: gapBefore.frames + gapAfter.frames,
  gapFrames: gapBefore.gapFrames + gapAfter.gapFrames,
  worstRun: Math.max(gapBefore.worstRun, gapAfter.worstRun),
};
check(
  gap.worstRun <= 2 ? 'PASS' : 'WARN',
  'popover frame gaps (popover ≥3 frames old without a button)',
  `${gap.gapFrames}/${gap.frames} frames, worst run ${gap.worstRun}`,
);
await p.close();

// ---- second account: read-only shared event (no Edit/Delete) and an invited event
p = await openPage(1);
await checkPopover(
  p,
  'shared read-only event (no Edit/Delete)',
  chipClick(p, 'SharedCal'),
  'event',
);
await checkPopover(
  p,
  'invited event with RSVP buttons',
  chipClick(p, 'With guest'),
  'event',
);
await p.close();

console.log('Extension popovers report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
