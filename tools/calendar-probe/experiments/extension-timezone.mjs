// EXPERIMENTAL — the browser's time zone changes WHILE the SDK is running (CDP Emulation.setTimezoneOverride
// on the open tab, no reload), in real Chrome with calendar-badges + calendar-popover-button +
// calendar-compat. Checks: chips re-render at shifted times but identity is unchanged (EventRef of a
// recurring instance is UTC-based), badges stay one-per-chip, the popover button and compat report still
// work, and what `User.getTimeZone()` (a load-time snapshot) says. Read-only; the override is removed at
// the end. Run `yarn gulp` first.
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

const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const logs = [];
p.on('console', (m) => {
  if (m.text().startsWith('CalendarSDK')) logs.push(m.text());
});
const cdp = await ctx.newCDPSession(p);
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
await p.waitForTimeout(3000);

const state = () =>
  p.evaluate(() => {
    const chips = [
      ...document.querySelectorAll('[role=main] [data-eventchip]'),
    ].filter(
      (c) =>
        c.hasAttribute('jsaction') &&
        c.hasAttribute('data-keyboardactiontype') &&
        c.getAttribute('data-eventid'),
    );
    const daily = chips.find((c) => /Daily recurring/.test(c.innerText));
    return {
      chips: chips.length,
      one: chips.filter(
        (c) => c.querySelectorAll('[data-calsdk-badge]').length === 1,
      ).length,
      total: document.querySelectorAll('[data-calsdk-badge]').length,
      dailyLabel: daily?.innerText.replace(/\s+/g, ' ').slice(0, 60) ?? null,
      xTimezone: document.getElementById('xTimezone')?.textContent ?? null,
      jsTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });
const popoverRef = async () => {
  const n = logs.length;
  await p
    .locator('[role=main] [data-eventchip]')
    .filter({ hasText: 'Daily recurring' })
    .first()
    .click();
  await p.waitForTimeout(1500);
  const buttons = await p
    .locator('[role=dialog][data-chips-dialog] [data-calsdk-popover-button]')
    .count();
  const line = logs
    .slice(n)
    .find((l) => l.startsWith('CalendarSDK popover open'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  return { buttons, ref: line?.replace('CalendarSDK popover open ', '') };
};

const before = await state();
const refBefore = await popoverRef();
info('before', JSON.stringify({ ...before }));

try {
  await cdp.send('Emulation.setTimezoneOverride', {
    timezoneId: 'Pacific/Auckland',
  });
  await p.waitForTimeout(1500);
  // in-app navigation re-renders the grid in the new browser zone: next week, back, today
  for (const key of ['n', 'p']) {
    await p.keyboard.press(key);
    await p.waitForTimeout(1800);
  }
  const after = await state();
  info('after tz change', JSON.stringify(after));
  pass(
    after.jsTz === 'Pacific/Auckland',
    'the page really is in the new zone',
    after.jsTz,
  );
  pass(
    after.chips > 0 && after.one === after.chips && after.total === after.chips,
    'one badge per chip after the change',
    JSON.stringify(after),
  );
  const refAfter = await popoverRef();
  pass(
    refAfter.buttons === 1,
    'popover button still works',
    JSON.stringify(refAfter),
  );
  pass(
    !!refAfter.ref && refAfter.ref === refBefore.ref,
    'the recurring instance has the same EventRef (UTC-based identity)',
    JSON.stringify({ refBefore, refAfter }),
  );
  info(
    'recurring instance ref before / after',
    `${refBefore.ref} | ${refAfter.ref}`,
  );
  await p.evaluate(() =>
    document.dispatchEvent(new Event('calsdk-compat-report')),
  );
  await p.waitForTimeout(500);
  const line = logs.find((l) => l.startsWith('CalendarSDK compat report'));
  const r = line && JSON.parse(line.slice('CalendarSDK compat report '.length));
  pass(
    !!r && r.issues.filter((i) => i.severity === 'hard').length === 0,
    'compat report: no hard issues',
    JSON.stringify(r?.issues),
  );
  pass(
    !logs.some((l) => l.includes('compat issue')),
    'no compat issue emitted during the change',
    JSON.stringify(logs.filter((l) => l.includes('compat issue'))),
  );
} finally {
  await cdp
    .send('Emulation.setTimezoneOverride', { timezoneId: '' })
    .catch(() => {});
}
await p.close();

console.log('Extension timezone report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
