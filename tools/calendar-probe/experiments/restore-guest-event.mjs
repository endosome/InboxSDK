import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1200 })
    .catch(() => {});
console.log(
  'before',
  await p
    .locator('[data-eventchip]')
    .filter({ hasText: 'With guest' })
    .first()
    .evaluate((c) => c.innerText.split('\n')[0].slice(0, 28)),
);
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'With guest' })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
const st = p.locator('input[aria-label="Start time"]');
await st.click();
await st.fill('6:00pm');
await st.press('Enter');
await p.waitForTimeout(500);
const et = p.locator('input[aria-label="End time"]');
await et.click();
await et.fill('7:00pm');
await et.press('Enter');
await p.waitForTimeout(500);
const ed = p.locator('input[aria-label="End date"]');
await ed.click();
await ed.fill('Sep 30, 2026');
await ed.press('Enter');
await p.waitForTimeout(500);
console.log('end date', await ed.inputValue());
console.log('editor', await st.inputValue(), await et.inputValue());
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(1500);
await p
  .getByRole('button', { name: "Don't send" })
  .click({ timeout: 4000 })
  .catch(() => console.log('no confirm'));
await p.waitForTimeout(2500);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(2500);
console.log(
  'after',
  await p
    .locator('[data-eventchip]')
    .filter({ hasText: 'With guest' })
    .first()
    .evaluate((c) => c.innerText.split('\n')[0].slice(0, 28)),
);
await p.close();
await b.close();
