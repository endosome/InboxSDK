import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
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
const bb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .boundingBox();
const cx = bb.x + bb.width / 2,
  cy = bb.y + bb.height / 2;
await p.mouse.move(cx, cy);
await p.mouse.down();
for (let i = 1; i <= 8; i++) {
  await p.mouse.move(cx, cy + i * 6, { steps: 2 });
  await p.waitForTimeout(60);
}
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const tid = [...document.querySelectorAll('[data-eventchip]')].find(
        (c) => /Timed A/.test(c.innerText) || true,
      )?.dataset.eventid;
      const all = [...document.querySelectorAll('[data-eventchip]')].filter(
        (c) => c.dataset.eventid.startsWith('NDBnZmwz'),
      );
      const desc = (c) => ({
        attrs: [...c.attributes].map((a) => a.name).join(','),
        hasJsaction: c.hasAttribute('jsaction'),
        hasKbd: c.hasAttribute('data-keyboardactiontype'),
        dragsrc: c.getAttribute('data-dragsource-type'),
        role: c.getAttribute('role'),
        tabindex: c.getAttribute('tabindex'),
        ancestors: (() => {
          const o = [];
          let e = c.parentElement;
          for (let i = 0; i < 4 && e; i++, e = e.parentElement)
            o.push(
              e.tagName.toLowerCase() +
                '.' +
                String(e.className).split(' ')[0] +
                (e.getAttribute('role')
                  ? '[' + e.getAttribute('role') + ']'
                  : ''),
            );
          return o;
        })(),
        inDatekey: !!c.closest('[data-datekey]'),
        inMain: !!c.closest('[role=main]'),
        pos: getComputedStyle(c).position,
        ptr: getComputedStyle(c).pointerEvents,
        opacity: getComputedStyle(c).opacity,
      });
      return all.map(desc);
    }),
    null,
    1,
  ),
);
await p.mouse.up();
await p.waitForTimeout(1500);
await p.keyboard.press('Escape');
await p.close();
await b.close();
