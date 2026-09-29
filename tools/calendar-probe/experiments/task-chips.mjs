import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
for (const q of ctx.pages())
  if (
    /calendar\.google\.com\/calendar\/u\/0\/r\/week\/2026\/9\/30/.test(q.url())
  )
    await q.close();
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1200 })
    .catch(() => {});
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p.getByRole('menuitem', { name: /Task/ }).first().click();
await p.waitForTimeout(1500);
await p
  .locator('[role=dialog] input[aria-label="Add title"]')
  .fill('[CALSDK] Task A');
console.log(
  'quick-create dialog contains data-eventid?',
  await p.evaluate(
    () =>
      !!document.querySelector(
        '[role=dialog][data-chips-dialog] [data-eventid]',
      ),
  ),
);
await p
  .locator('[role=dialog]')
  .getByRole('button', { name: 'Save', exact: true })
  .click();
await p.waitForTimeout(3000);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
console.log(
  R(
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[data-eventchip]')]
          .filter((c) => /Task A/.test(c.innerText))
          .map((c) => {
            const t = (c.dataset.eventid || '')
              .replace(/-/g, '+')
              .replace(/_/g, '/');
            let d = '';
            try {
              d = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
            } catch {
              d = '(undecodable) ' + c.dataset.eventid;
            }
            return {
              txt: c.innerText.replace(/\n/g, '|').slice(0, 70),
              dec: d,
              attrs: [...c.attributes].map((a) => a.name).join(','),
              jslog: (c.getAttribute('jslog') || '').slice(0, 170),
              role: c.getAttribute('role'),
            };
          }),
      ),
      null,
      1,
    ),
  ),
);
await p.close();
await b.close();
