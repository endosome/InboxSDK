import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=de',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  await p.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    viewKey: document.documentElement.dataset.prefetchViewKey,
    uik: document.documentElement.dataset.uiKind,
    chips: document.querySelectorAll('[data-eventchip]').length,
    main: document.querySelector('[role=main]')?.dataset.periodType,
  })),
);
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await p.waitForTimeout(1200);
console.log(
  await p.evaluate(() => {
    const d = document.querySelector('[role=dialog][data-chips-dialog]');
    return (
      d && {
        jsnameEdit: !!d.querySelector('button[jsname=DyVDA]'),
        jsnameDel: !!d.querySelector('button[jsname=VkLyEc]'),
        enLabel: !!d.querySelector('button[aria-label="Edit event"]'),
        labels: [...d.querySelectorAll('button')]
          .map((x) => x.getAttribute('aria-label'))
          .filter(Boolean),
      }
    );
  }),
);
await p.keyboard.press('Escape');
await b.close();
