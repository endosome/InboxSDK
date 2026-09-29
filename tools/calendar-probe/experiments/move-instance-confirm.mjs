import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('u/0/r/eventedit/'));
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
const eid = new URL(p.url()).pathname.split('/').pop();
const t = eid.replace(/-/g, '+').replace(/_/g, '/');
console.log(
  'editor eid decodes to:',
  R(atob(t + '='.repeat((4 - (t.length % 4)) % 4))),
);
await p.getByText('This event', { exact: true }).click();
await p.getByRole('button', { name: 'OK' }).click();
await p.waitForTimeout(3000);
console.log(p.url().slice(0, 80));
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  'after',
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
              c.innerText.split('\n')[0].slice(0, 26) +
              ' | jslog2=' +
              (c.getAttribute('jslog').match(/2:\["([^"]+)"/) || [])[1]
            );
          }),
      ),
      null,
      1,
    ),
  ),
);
await b.close();
