import { chromium } from 'playwright-core';
const n = process.argv[2] || '0';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.goto(
  `https://calendar.google.com/calendar/u/${n}/r/week/2026/9/30?hl=en`,
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1200 })
    .catch(() => {});
const R = (s) =>
  s
    .replace(/owner@(gmail\.com|m)/g, '<A0>@m')
    .replace(/invitee@(gmail\.com|m)/g, '<A1>@m')
    .replace(/[0-9a-f]{64}(@group\.calendar\.google\.com|@g)/g, '<HEX64>$1');
console.log(
  R(
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[data-eventchip]')]
          .filter((c) => /SharedCal|Dup/.test(c.innerText))
          .map((c) => {
            const t = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
            return {
              txt: c.innerText.split('\n')[0].slice(0, 50),
              dec: atob(t + '='.repeat((4 - (t.length % 4)) % 4)),
              jslog1: (c.getAttribute('jslog').match(/;1:\[([^\]]*)\]/) ||
                [])[1],
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
