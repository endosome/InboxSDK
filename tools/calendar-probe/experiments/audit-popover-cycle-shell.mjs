import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 800 })
  .catch(() => {});
await p.evaluate(() => {
  let n = 0;
  window.__cid = (e) => e.__c || (e.__c = ++n);
  document.querySelectorAll('[data-eventchip]').forEach(window.__cid);
  window.__pre = new Set([...document.querySelectorAll('[data-eventchip]')]);
  document.querySelectorAll('[data-eventchip]').forEach((c) => {
    const s = document.createElement('span');
    s.className = '__mark';
    c.appendChild(s);
  });
});
const st = (l) =>
  p
    .evaluate(
      (l) => ({
        l,
        chips: document.querySelectorAll('[data-eventchip]').length,
        sameElements: [...document.querySelectorAll('[data-eventchip]')].filter(
          (c) => window.__pre.has(c),
        ).length,
        marksLeft: document.querySelectorAll('.__mark').length,
      }),
      l,
    )
    .then((x) => console.log(JSON.stringify(x)));
await st('baseline');
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await p.waitForTimeout(1200);
await st('popover open');
// overlay ancestry of popover
console.log(
  'popover ancestry',
  JSON.stringify(
    await p.evaluate(() => {
      let e = document.querySelector('[role=dialog][data-chips-dialog]');
      const out = [];
      while (e && e !== document.documentElement) {
        out.push(
          e.tagName.toLowerCase() +
            (e.id ? '#' + e.id : '') +
            '[' +
            [...e.attributes]
              .filter(
                (a) =>
                  /^(role|jscontroller|jsname|data-|aria-modal|id)/.test(
                    a.name,
                  ) && a.name !== 'id',
              )
              .map((a) => a.name)
              .join(',') +
            ']' +
            '.' +
            String(e.className).split(' ')[0],
        );
        e = e.parentElement;
      }
      return out;
    }),
  ),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
await st('popover closed');
// static shell candidates
console.log(
  'shell',
  JSON.stringify(
    await p.evaluate(() => {
      const q = (s) => {
        const e = document.querySelector(s);
        return e
          ? {
              tag: e.tagName.toLowerCase(),
              id: e.id || null,
              role: e.getAttribute('role'),
              attrs: [...e.attributes]
                .filter((a) =>
                  /^(jscontroller|jsname|aria-label|data-)/.test(a.name),
                )
                .map((a) => a.name + '=' + a.value.slice(0, 18))
                .slice(0, 5),
            }
          : null;
      };
      return {
        app: q('#yDmH0d'),
        banner: q('header,[role=banner]'),
        main: q('[role=main]'),
        nav: q('[role=navigation]'),
        miniCal: q('[role=grid][aria-label]'),
        complementary: q('[role=complementary]'),
        create: q('button[aria-label^=Create],[aria-label^=Create]'),
      };
    }),
  ),
);
console.log(
  'header buttons',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('header button,[role=banner] button')]
        .map((b) => ({
          l: (b.getAttribute('aria-label') || b.innerText).trim().slice(0, 22),
          j: b.getAttribute('jsname'),
          jc: b.getAttribute('jscontroller'),
        }))
        .slice(0, 14),
    ),
  ),
);
await p.close();
await b.close();
