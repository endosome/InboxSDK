// EXPERIMENTAL: what does the 2nd account (/u/1/) see for events created by account 0?
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.goto(
  'https://calendar.google.com/calendar/u/1/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  await p.evaluate(() => ({
    url: location.pathname,
    title: document.title,
    chips: [...document.querySelectorAll('[data-eventchip]')].map((c) => {
      const id = c.dataset.eventid;
      const t = id.replace(/-/g, '+').replace(/_/g, '/');
      return {
        text: c.innerText.split('\n')[0].slice(0, 40),
        dec: atob(t + '='.repeat((4 - (t.length % 4)) % 4)).replace(
          /@.*/,
          '@…',
        ),
      };
    }),
  })),
);
await p.close();
await b.close();
