import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1200 })
    .catch(() => {});
await p
  .locator('[data-eventchip]')
  .filter({ hasText: /AllDay(?! weekly)/ })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
await p
  .locator('input[aria-label="All day"]')
  .check({ force: true })
  .catch(async () => {
    await p.getByText('All day', { exact: true }).first().click();
  });
await p.waitForTimeout(600);
console.log(
  'dates',
  await p.locator('input[aria-label="Start date"]').inputValue(),
  await p.locator('input[aria-label="End date"]').inputValue(),
  'allday',
  await p.locator('input[aria-label="All day"]').isChecked(),
);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(3000);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  await p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => /AllDay(?! weekly)/.test(c.innerText))
      .map((c) => {
        const r = c.getBoundingClientRect();
        return (
          c.innerText.split('\n')[0].slice(0, 30) +
          ' x=' +
          Math.round(r.x) +
          ' y=' +
          Math.round(r.y) +
          ' w=' +
          Math.round(r.width)
        );
      }),
  ),
);
await p.close();
await b.close();
