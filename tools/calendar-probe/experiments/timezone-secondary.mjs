import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
async function page(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  await p
    .locator('[role=dialog] button', { hasText: /^No$/ })
    .first()
    .click({ timeout: 1000 })
    .catch(() => {});
  return p;
}
const compat = () => {
  try {
    return execFileSync(
      'node',
      ['/home/mix/InboxSDK/tools/calendar-probe/compat.mjs'],
      {
        encoding: 'utf8',
        cwd: '/home/mix/InboxSDK/tools/calendar-probe',
        timeout: 120000,
      },
    )
      .trim()
      .split('\n')
      .filter((l) => /^(FAIL|WARN)|pass,/.test(l))
      .join(' ; ');
  } catch (e) {
    return (
      'exit ' +
      e.status +
      ' ' +
      (e.stdout || '')
        .split('\n')
        .filter((l) => /^(FAIL|WARN)|pass,/.test(l))
        .join(' ; ')
    );
  }
};
const grid = (p) =>
  p.evaluate(() => ({
    gutterLabels: [...document.querySelectorAll('[role=main] *')]
      .filter(
        (e) =>
          e.children.length === 0 && /^GMT[+-]\d\d/.test(e.textContent.trim()),
      )
      .map((e) => e.textContent.trim()),
    chips: document.querySelectorAll('[data-eventchip]').length,
    datekeys: document.querySelectorAll('[data-datekey]').length,
    html: document.documentElement.dataset.uiKind,
    firstChip: (() => {
      const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
        /Timed A/.test(x.innerText),
      );
      const r = c?.getBoundingClientRect();
      return r && { x: Math.round(r.x), y: Math.round(r.y) };
    })(),
  }));
let p;
try {
  p = await page('https://calendar.google.com/calendar/u/0/r/settings?hl=en');
  await p
    .locator('input[aria-label="Display secondary time zone"]')
    .check({ force: true });
  await p.waitForTimeout(800);
  const sec = p.locator('input[aria-label="Secondary time zone"]');
  await sec.click({ force: true });
  await sec.fill('Tokyo');
  await p.waitForTimeout(900);
  await p
    .locator('[role=option]')
    .filter({ hasText: 'Tokyo' })
    .first()
    .click({ force: true });
  await p.waitForTimeout(2500);
  console.log('secondary ->', await sec.inputValue());
  await p.close();
  p = await page(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  );
  console.log('with secondary ', JSON.stringify(await grid(p)));
  await p.screenshot({ path: 'tz6.png' });
  await p.close();
  console.log('compat (LA + secondary Tokyo):', compat());
} catch (e) {
  console.log('ERR', e.message.split('\n')[0]);
}
// restore: clear secondary, primary Warsaw
p = await page('https://calendar.google.com/calendar/u/0/r/settings?hl=en');
const disp = p.locator('input[aria-label="Display secondary time zone"]');
console.log(
  'display secondary checkbox checked?',
  await disp.isChecked().catch(() => 'n/a'),
);
await p
  .locator('input[aria-label="Display secondary time zone"]')
  .uncheck({ force: true })
  .catch(() => console.log('uncheck n/a'));
await p.waitForTimeout(1500);
const prim = p.locator('input[aria-label="Primary time zone"]');
await prim.click({ force: true });
await prim.fill('Warsaw, Poland');
await p.waitForTimeout(900);
await p
  .locator('[role=option]')
  .filter({ hasText: /Warsaw, Poland/ })
  .first()
  .click({ force: true });
await p.waitForTimeout(2500);
console.log('primary ->', await prim.inputValue());
await p.close();
p = await page(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
console.log('restored      ', JSON.stringify(await grid(p)));
await p.close();
console.log('compat (restored):', compat());
await b.close();
