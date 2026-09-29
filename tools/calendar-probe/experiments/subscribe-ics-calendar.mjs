import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/settings/addbyurl?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
console.log(
  p.url().slice(0, 80),
  await p.evaluate(() => ({
    inputs: [...document.querySelectorAll('input')].map(
      (i) => i.getAttribute('aria-label') || i.placeholder,
    ),
    btns: [...document.querySelectorAll('button')]
      .map((x) => x.innerText.trim())
      .filter((x) => /add/i.test(x)),
  })),
);
await p
  .locator('input[type=text], input[type=url]')
  .nth(1)
  .fill('https://www.calendarlabs.com/ical-calendar/ics/76/US_Holidays.ics')
  .catch(async (e) => console.log('fill err'));
await p.getByRole('button', { name: 'Add calendar' }).click();
await p.waitForTimeout(6000);
console.log(
  await p.evaluate(() =>
    document.body.innerText
      .match(/Settings for other calendars[\s\S]{0,200}/)?.[0]
      .replace(/\n+/g, '|'),
  ),
);
await p.screenshot({ path: 'ws1.png' });
await p.close();
await b.close();
