import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1200 })
    .catch(() => {});
await p.evaluate(() => {
  let n = 0;
  const cid = (e) => e.__c || (e.__c = ++n);
  window.__pre = new Set();
  document.querySelectorAll('[data-eventchip]').forEach((c) => {
    cid(c);
    __pre.add(c);
  });
  window.__ev = [];
  const is = (c) =>
    c.matches?.('[data-eventchip]')
      ? [c]
      : [...(c.querySelectorAll?.('[data-eventchip]') || [])];
  new MutationObserver((ms) => {
    for (const m of ms) {
      const t = performance.now() | 0;
      if (m.type == 'attributes') {
        if (
          m.attributeName == 'data-eventid' &&
          m.target.matches('[data-eventchip]')
        )
          __ev.push({
            t,
            k: 'id',
            cid: cid(m.target),
            pre: __pre.has(m.target),
            old: m.oldValue?.slice(0, 6) || null,
            now: m.target.dataset.eventid?.slice(0, 6),
          });
      }
      for (const a of m.addedNodes)
        if (a.nodeType == 1)
          is(a).forEach((c) =>
            __ev.push({
              t,
              k: 'add',
              cid: cid(c),
              pre: __pre.has(c),
              id: c.dataset.eventid?.slice(0, 6),
            }),
          );
      for (const a of m.removedNodes)
        if (a.nodeType == 1)
          is(a).forEach((c) =>
            __ev.push({
              t,
              k: 'rm',
              cid: cid(c),
              pre: __pre.has(c),
              id: c.dataset.eventid?.slice(0, 6),
            }),
          );
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-eventid'],
    attributeOldValue: true,
  });
});
const chipInfo = () =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      id: c.dataset.eventid.slice(0, 8),
      cid: c.__c,
      pre: __pre.has(c),
      label: c.innerText.split('\n')[0].slice(0, 24),
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    };
  });
const summarize = async (l) => {
  const ev = await p.evaluate(() => {
    const e = window.__ev.splice(0);
    return e;
  });
  const cnt = (k) => ev.filter((e) => e.k == k).length;
  console.log(
    l,
    'events',
    ev.length,
    'add',
    cnt('add'),
    'rm',
    cnt('rm'),
    'idAttr',
    cnt('id'),
    '| idAttr on pre-existing:',
    ev.filter((e) => e.k == 'id' && e.pre).length,
    '| oldValue non-null:',
    ev.filter((e) => e.k == 'id' && e.old).length,
    '| rm of target-type pre elements:',
    ev.filter((e) => e.k == 'rm' && e.pre).length,
  );
  return ev;
};
let c0 = await chipInfo();
console.log('start', JSON.stringify(c0));
// DRAG down 2 hours (48px/h assumed -> measure via 15-min snap)
await p.mouse.move(c0.x + c0.w / 2, c0.y + c0.h / 2);
await p.mouse.down();
const mid = [];
for (let i = 1; i <= 12; i++) {
  await p.mouse.move(c0.x + c0.w / 2, c0.y + c0.h / 2 + i * 8, { steps: 2 });
  await p.waitForTimeout(60);
  if (i == 6) mid.push(await chipInfo());
}
console.log('mid-drag chip', JSON.stringify(mid[0]));
await summarize('during drag');
await p.mouse.up();
await p.waitForTimeout(2500);
console.log(
  'dialogs',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(
        (d) => d.innerText.replace(/\n/g, '|').slice(0, 100),
      ),
    ),
  ),
);
await summarize('drop');
let c1 = await chipInfo();
console.log('after drop', JSON.stringify(c1));
// RESIZE: drag bottom edge of the chip down 48px
await p.mouse.move(c1.x + c1.w / 2, c1.y + c1.h - 3);
await p.mouse.down();
await p.mouse.move(c1.x + c1.w / 2, c1.y + c1.h + 45, { steps: 10 });
await p.waitForTimeout(200);
await summarize('during resize');
await p.mouse.up();
await p.waitForTimeout(2500);
await summarize('resize drop');
let c2 = await chipInfo();
console.log('after resize', JSON.stringify(c2));
await p.close();
await b.close();
