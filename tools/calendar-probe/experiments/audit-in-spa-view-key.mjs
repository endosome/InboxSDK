import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 800 })
  .catch(() => {});
const st = () =>
  p.evaluate(() => ({
    path: location.pathname.replace('/calendar/u/0/r/', ''),
    htmlKey: document.documentElement.dataset.prefetchViewKey,
    bodyKey: document.body.dataset.viewkey,
    fam: document.body.dataset.viewfamily,
    period: document.querySelector('[role=main]')?.dataset.periodType ?? null,
  }));
console.log('start'.padEnd(22), JSON.stringify(await st()));
for (const [label, key] of [
  ['key m (month)', 'm'],
  ['key d (day)', 'd'],
  ['key w (week)', 'w'],
  ['key y (year)', 'y'],
  ['key a (agenda)', 'a'],
  ['key x (4 days)', 'x'],
  ['key w', 'w'],
]) {
  await p.keyboard.press(key);
  await p.waitForTimeout(1800);
  console.log(label.padEnd(22), JSON.stringify(await st()));
}
// in-SPA to editor and back, and to settings via gear menu
await p
  .locator('[data-eventchip]')
  .first()
  .click()
  .catch(() => {});
await p.waitForTimeout(900);
await p
  .locator('[role=dialog] button[jsname=DyVDA]')
  .click({ timeout: 3000 })
  .catch(() => {});
await p.waitForTimeout(2000);
console.log('editor (in-SPA)'.padEnd(22), JSON.stringify(await st()));
await p
  .locator('[jsname=gQ2Xie]')
  .click()
  .catch(() => {});
await p.waitForTimeout(1500);
console.log('cancel editor'.padEnd(22), JSON.stringify(await st()));
await p.getByRole('button', { name: /Settings menu/i }).click();
await p.getByRole('menuitem', { name: /^Settings/ }).click();
await p.waitForTimeout(2500);
console.log('settings (in-SPA)'.padEnd(22), JSON.stringify(await st()));
await p
  .getByRole('button', { name: /Back|Close settings|Switch to Calendar/i })
  .first()
  .click({ timeout: 3000 })
  .catch(() => {});
await p.waitForTimeout(2000);
console.log('back from settings'.padEnd(22), JSON.stringify(await st()));
await p.goBack();
await p.waitForTimeout(1500);
console.log('history.back'.padEnd(22), JSON.stringify(await st()));
await p.close();
await b.close();
