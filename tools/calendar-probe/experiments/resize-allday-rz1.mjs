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
const RX = /AllDay(?! weekly)/;
const snap = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => /AllDay(?! weekly)/.test(c.innerText))
      .map((c) => {
        const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
        const r = c.getBoundingClientRect();
        return {
          id: atob(x + '='.repeat((4 - (x.length % 4)) % 4))
            .split(' ')[0]
            .slice(0, 8),
          x: Math.round(r.x),
          w: Math.round(r.width),
          y: Math.round(r.y),
          cid: (c.__c ??= Math.random().toString(36).slice(2, 5)),
          handle: [...c.querySelectorAll('*')].filter((e) =>
            /resize|handle/i.test(
              e.className +
                e.getAttribute('jsname') +
                e.getAttribute('data-dragsource-type'),
            ),
          ).length,
        };
      }),
  );
await p.evaluate(() => {
  window.__m = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type == 'attributes')
        window.__m.push(['attr', m.oldValue?.slice(0, 6) || null]);
    }
  }).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-eventid'],
    attributeOldValue: true,
  });
});
console.log('before', JSON.stringify(await snap()));
const bb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: RX })
  .first()
  .boundingBox();
console.log(
  'chip inner structure',
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /AllDay(?! weekly)/.test(x.innerText),
    );
    return [...c.querySelectorAll('*')]
      .map(
        (e) =>
          e.tagName +
          '.' +
          (e.getAttribute('data-dragsource-type') || '') +
          '/' +
          (e.getAttribute('jsname') || '') +
          '/' +
          Math.round(e.getBoundingClientRect().width),
      )
      .slice(0, 10);
  }),
);
const ex = bb.x + bb.width - 3,
  ey = bb.y + bb.height / 2;
await p.mouse.move(ex - 20, ey);
await p.mouse.move(ex, ey);
await p.waitForTimeout(300);
console.log(
  'cursor at edge',
  await p.evaluate(
    (a) => getComputedStyle(document.elementFromPoint(a[0], a[1])).cursor,
    [ex, ey],
  ),
);
await p.mouse.down();
for (let i = 1; i <= 12; i++) {
  await p.mouse.move(ex + (126 * i) / 12, ey);
  await p.waitForTimeout(50);
}
console.log('during', JSON.stringify(await snap()));
await p.mouse.up();
await p.waitForTimeout(2200);
console.log(
  'dialogs',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog]')].map((d) =>
        d.innerText.slice(0, 60),
      ),
    ),
  ),
);
console.log(
  'after',
  JSON.stringify(await snap()),
  'mutations',
  JSON.stringify(await p.evaluate(() => window.__m)),
);
await p.close();
await b.close();
