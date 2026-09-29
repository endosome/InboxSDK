// EXPERIMENTAL: which account is /u/<n>/ and how many chips does it show
import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
for (const n of [0, 1]) {
  const p = await b.contexts()[0].newPage();
  await p.goto(
    `https://calendar.google.com/calendar/u/${n}/r/week/2026/9/30?hl=en`,
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3000);
  console.log(
    n,
    await p.evaluate(() => ({
      user: document
        .getElementById('xUserInfo')
        ?.textContent.trim()
        .replace(/^(.).*@/, '$1…@'),
      chips: document.querySelectorAll('[data-eventchip]').length,
      texts: [...document.querySelectorAll('[data-eventchip]')]
        .map((c) => c.innerText.split('\n')[0].slice(0, 28))
        .slice(0, 20),
    })),
  );
  await p.close();
}
await b.close();
