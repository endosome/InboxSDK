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
const bb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: /AllDay(?! weekly)/ })
  .first()
  .boundingBox();
const cy = bb.y + bb.height / 2;
const out = [];
for (const dx of [2, 6, 10, 60, 100, 108, 110, 112, 114, 116, 118, 120, 124]) {
  await p.mouse.move(bb.x + dx, cy);
  await p.waitForTimeout(80);
  out.push(
    dx +
      ':' +
      (await p.evaluate(
        ([x, y]) => {
          const e = document.elementFromPoint(x, y);
          return (
            (e?.closest('[data-eventchip]') ? 'inChip' : 'notChip') +
            '/' +
            e?.tagName +
            '.' +
            String(e?.className).slice(0, 14) +
            '/' +
            getComputedStyle(e).cursor
          );
        },
        [bb.x + dx, cy],
      )),
  );
}
console.log(out.join('\n'));
await p.close();
await b.close();
