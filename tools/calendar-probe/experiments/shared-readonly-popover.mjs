import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.goto(
  'https://calendar.google.com/calendar/u/1/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1200 })
    .catch(() => {});
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'SharedCal' })
  .first()
  .click();
await p.waitForTimeout(1200);
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const d = document.querySelector('[role=dialog][data-chips-dialog]');
      return (
        d && {
          ids: d.querySelectorAll('[data-eventid]').length,
          edit: !!d.querySelector('button[jsname=DyVDA]'),
          del: !!d.querySelector('button[jsname=VkLyEc]'),
          labels: [...d.querySelectorAll('button')]
            .map((x) => x.getAttribute('aria-label'))
            .filter(Boolean),
          text: d.innerText.replace(/\n/g, '|').slice(0, 160),
        }
      );
    }),
  ),
);
await p.keyboard.press('Escape');
await p.close();
await b.close();
