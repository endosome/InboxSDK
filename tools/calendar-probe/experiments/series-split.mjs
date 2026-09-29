import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
const dec = `(id)=>{const t=id.replace(/-/g,'+').replace(/_/g,'/');return atob(t+'='.repeat((4-t.length%4)%4))}`;
const dump = async (l, path) => {
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/' + path + '?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3000);
  for (const n of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: n })
      .click({ timeout: 1200 })
      .catch(() => {});
  console.log(
    l,
    R(
      JSON.stringify(
        await p.evaluate((d) => {
          const f = eval(d);
          return [...document.querySelectorAll('[data-eventchip]')]
            .filter((c) => /Weekly recurring/.test(c.innerText))
            .map(
              (c) =>
                f(c.dataset.eventid).split(' ')[0] +
                ' | ' +
                c.innerText.split('\n')[0].slice(0, 22),
            );
        }, dec),
      ),
    ),
  );
};
await dump('before wk Oct7', 'week/2026/10/7');
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Weekly recurring' })
  .first()
  .click();
await p.waitForTimeout(1000);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
const st = p.locator('input[aria-label="Start time"]');
await st.click();
await st.fill('3:30pm');
await st.press('Enter');
await p.waitForTimeout(500);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(1200);
await p.getByText('This and following events', { exact: true }).click();
await p.getByRole('button', { name: 'OK' }).click();
await p.waitForTimeout(3000);
await dump('after wk Sep30', 'week/2026/9/30');
await dump('after wk Oct7', 'week/2026/10/7');
await dump('after wk Oct14', 'week/2026/10/14');
await p.close();
await b.close();
