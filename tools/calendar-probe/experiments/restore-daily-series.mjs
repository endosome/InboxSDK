import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
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
  .filter({ hasText: 'Daily recurring' })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
const st = p.locator('input[aria-label="Start time"]');
await st.click();
await st.fill('1:00pm');
await st.press('Enter');
await p.waitForTimeout(400);
const et = p.locator('input[aria-label="End time"]');
await et.click();
await et.fill('2:00pm');
await et.press('Enter');
await p.waitForTimeout(400);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(1200);
await p.getByText('All events', { exact: true }).first().click();
await p.getByRole('button', { name: 'OK' }).click();
await p.waitForTimeout(3000);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  await p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => /Daily recurring/.test(c.innerText))
      .map((c) => {
        const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
        return (
          atob(x + '='.repeat((4 - (x.length % 4)) % 4))
            .split(' ')[0]
            .slice(-16) +
          ' ' +
          c.innerText.split('\n')[0].slice(0, 12)
        );
      }),
  ),
);
await p.close();
await b.close();
