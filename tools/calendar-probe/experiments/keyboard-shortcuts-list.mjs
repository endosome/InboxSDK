import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
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
await p.keyboard.press('?');
await p.waitForTimeout(1500);
const txt = await p.evaluate(() => document.body.innerText);
const i = txt.search(/Keyboard shortcuts/i);
const lines = (
  await p.evaluate(() =>
    [...document.querySelectorAll('[role=dialog]')]
      .map((d) => d.innerText)
      .join('\n'),
  )
)
  .split('\n')
  .filter((l) => /move|drag|resize|arrow|shift|alt|event|select|focus/i.test(l))
  .slice(0, 60);
console.log(lines.join('\n'));
await p.keyboard.press('Escape');
await p.close();
await b.close();
