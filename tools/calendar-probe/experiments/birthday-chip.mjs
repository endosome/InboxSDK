import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1200 })
    .catch(() => {});
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
console.log(
  R(
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[data-eventchip]')]
          .filter((c) => /CALSDK Birthday|birthday/i.test(c.innerText))
          .map((c) => ({
            txt: c.innerText.replace(/\n/g, '|').slice(0, 80),
            attrs: [...c.attributes].map((a) => a.name).join(','),
            eventid: c.dataset.eventid?.slice(0, 60),
            jslog: (c.getAttribute('jslog') || '').slice(0, 150),
            role: c.getAttribute('role'),
          })),
      ),
      null,
      1,
    ),
  ),
);
await p
  .locator('[data-eventchip]')
  .filter({ hasText: /Birthday/ })
  .first()
  .click()
  .then(async () => {
    await p.waitForTimeout(1200);
    console.log(
      'popover',
      JSON.stringify(
        await p.evaluate(() => {
          const d = document.querySelector('[role=dialog]');
          return (
            d && {
              ids: d.querySelectorAll('[data-eventid]').length,
              btns: [...d.querySelectorAll('button')]
                .map((x) =>
                  (x.getAttribute('aria-label') || x.innerText)
                    .trim()
                    .slice(0, 24),
                )
                .filter(Boolean),
              jsnames: [...d.querySelectorAll('button')]
                .map((x) => x.getAttribute('jsname'))
                .filter(Boolean),
              text: d.innerText.replace(/\n/g, '|').slice(0, 120),
            }
          );
        }),
      ),
    );
  })
  .catch(() => console.log('no birthday chip in view'));
await p.close();
await b.close();
