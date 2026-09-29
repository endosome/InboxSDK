import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1200 })
    .catch(() => {});
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
console.log(
  'task raw token + bytes',
  R(
    JSON.stringify(
      await p.evaluate(() => {
        const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
          /Task A/.test(x.innerText),
        );
        const tok = c.dataset.eventid;
        const t = tok.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
        return {
          tok: tok.slice(0, 50),
          len: tok.length,
          hexHead: [...bin.slice(0, 6)]
            .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
            .join(' '),
          ascii: bin.slice(3).replace(/owner@\w+/, '<A0>'),
        };
      }),
    ),
  ),
);
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Task A' })
  .first()
  .click();
await p.waitForTimeout(1200);
console.log(
  'task popover',
  R(
    JSON.stringify(
      await p.evaluate(() => {
        const d = document.querySelector('[role=dialog]');
        return (
          d && {
            attrs: [...d.attributes]
              .filter((a) => /data-|role/.test(a.name))
              .map((a) => a.name + '=' + a.value.slice(0, 20)),
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
            text: d.innerText.replace(/\n/g, '|').slice(0, 140),
          }
        );
      }),
    ),
  ),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
// what is the data-eventid inside the quick-create dialog?
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p
  .getByRole('menuitem', { name: /^Event/ })
  .first()
  .click();
await p.waitForTimeout(1500);
console.log(
  'quick-create event dialog',
  R(
    JSON.stringify(
      await p.evaluate(() => {
        const d = document.querySelector('[role=dialog][data-chips-dialog]');
        const e = [...d.querySelectorAll('[data-eventid]')];
        return {
          n: e.length,
          els: e.map((x) => ({
            tag: x.tagName,
            role: x.getAttribute('role'),
            chip: x.hasAttribute('data-eventchip'),
            idlen: x.dataset.eventid.length,
            id: x.dataset.eventid.slice(0, 10),
          })),
        };
      }),
    ),
  ),
);
await p.keyboard.press('Escape');
// birthdays: any chips from Birthdays calendar in a wide agenda?
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/agenda/2026/9/1?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
console.log(
  'agenda chips by jslog type',
  JSON.stringify(
    await p.evaluate(() => {
      const m = {};
      document.querySelectorAll('[data-eventchip]').forEach((c) => {
        const k = (c.getAttribute('jslog') || '').split(';')[0];
        m[k] = (m[k] || 0) + 1;
      });
      return m;
    }),
  ),
);
console.log(
  'birthday-ish',
  await p.evaluate(
    () =>
      [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
        /birthday/i.test(c.innerText),
      ).length,
  ),
);
await p.close();
await b.close();
