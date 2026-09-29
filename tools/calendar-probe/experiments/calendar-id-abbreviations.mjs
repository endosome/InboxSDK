import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/agenda/2026/10/1?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(4000);
const R = (s) =>
  s
    .replace(/owner@(gmail\.com|m)/g, '<A0>@m')
    .replace(/[0-9a-f]{64}(@group\.calendar\.google\.com|@g)/g, '<HEX64>$1');
console.log(
  R(
    JSON.stringify(
      await p.evaluate(() => {
        const seen = {};
        for (const c of document.querySelectorAll('[data-eventchip]')) {
          const x = c.dataset.eventid
            .replace(/^(ttb_|bday_)/, '')
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          const d = atob(x + '='.repeat((4 - (x.length % 4)) % 4));
          const cal = d.split(' ')[1];
          const full =
            (c.getAttribute('jslog').match(/;1:\["([^"]+)"/) || [])[1] || null;
          const k = cal + ' <= ' + full;
          if (!seen[k])
            seen[k] = { n: 0, ex: c.innerText.split('\n')[0].slice(0, 26) };
          seen[k].n++;
        }
        return seen;
      }),
      null,
      1,
    ),
  ),
);
await p.close();
await b.close();
