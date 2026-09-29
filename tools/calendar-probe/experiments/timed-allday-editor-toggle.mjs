import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
async function page() {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3500);
  for (const n of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: n })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
const st = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => /Timed A/.test(c.innerText))
      .map((c) => {
        const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
        const r = c.getBoundingClientRect();
        return {
          id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
          txt: c.innerText.replace(/\n/g, '|').slice(0, 40),
          y: Math.round(r.y),
          h: Math.round(r.height),
          role: c.getAttribute('role'),
          dk: c.closest('[data-datekey]')?.dataset.datekey || null,
        };
      }),
  );
let p = await page();
console.log('before', JSON.stringify(await st(p)));
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
await p.locator('input[aria-label="All day"]').check({ force: true });
await p.waitForTimeout(500);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(3000);
await p.close();
p = await page();
console.log('as all-day', JSON.stringify(await st(p)));
// restore
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
await p.locator('input[aria-label="All day"]').uncheck({ force: true });
await p.waitForTimeout(600);
const s1 = p.locator('input[aria-label="Start time"]');
await s1.click();
await s1.fill('10:00am');
await s1.press('Enter');
const e1 = p.locator('input[aria-label="End time"]');
await e1.click();
await e1.fill('11:00am');
await e1.press('Enter');
const ed = p.locator('input[aria-label="End date"]');
await ed.click();
await ed.fill('Sep 30, 2026');
await ed.press('Enter');
await p.waitForTimeout(400);
console.log(
  'editor',
  await p.locator('input[aria-label="Start date"]').inputValue(),
  await s1.inputValue(),
  await e1.inputValue(),
  await ed.inputValue(),
);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(3000);
await p.close();
p = await page();
console.log('restored', JSON.stringify(await st(p)));
await p.close();
await b.close();
