import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
const dump = async (l) =>
  console.log(
    l,
    R(
      JSON.stringify(
        await p.evaluate(() =>
          [...document.querySelectorAll('[data-eventchip]')]
            .filter((c) => /Daily recurring/.test(c.innerText))
            .map((c) => {
              const t = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
              return (
                atob(t + '='.repeat((4 - (t.length % 4)) % 4)).split(' ')[0] +
                ' | ' +
                c.innerText.split('\n')[0].slice(0, 14)
              );
            }),
        ),
      ),
    ),
  );
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1500 })
    .catch(() => {});
await dump('before');
const chip = p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Daily recurring' })
  .nth(2); // 3rd chip = Oct 1
await chip.click();
await p.waitForTimeout(1000);
await p.locator('[role=dialog] button[jsname=DyVDA]').click();
await p.waitForTimeout(2500);
console.log(
  'editor url',
  p
    .url()
    .replace(/[A-Za-z0-9_-]{30,}/, '<eid>')
    .slice(0, 90),
);
const st = p.locator('input[aria-label="Start time"]');
await st.click();
await st.fill('4:30pm');
await st.press('Enter');
await p.waitForTimeout(600);
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(1500);
console.log(
  'dialogs',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(
        (d) => d.innerText.replace(/\n/g, '|').slice(0, 200),
      ),
    ),
  ),
);
await p.screenshot({ path: 'mv.png' });
await b.close();
