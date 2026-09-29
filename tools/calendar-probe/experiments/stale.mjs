import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
await p.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/30', {
  waitUntil: 'load',
});
await p.waitForTimeout(2500);
// multiday bboxes
console.log(
  'MultiDay chips',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((e) => e.innerText.includes('MultiDay'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x | 0,
            w: r.width | 0,
            h: r.height | 0,
            vis: r.width > 0 && getComputedStyle(e).visibility,
          };
        }),
    ),
  ),
);
// datekey hypothesis
console.log(
  'datekeys',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-datekey]')].slice(0, 6).map((e) => {
        const k = +e.dataset.datekey;
        return [k, 1970 + (k >> 9), (k >> 5) & 15, k & 31];
      }),
    ),
  ),
);
// stale badge + cid tracking
await p.evaluate(() => {
  let n = 0;
  window.__cid = (e) => e.__cid || (e.__cid = ++n);
  document.querySelectorAll('[data-eventchip]').forEach((c) => {
    __cid(c);
    const s = document.createElement('span');
    s.className = '__badge';
    s.textContent = 'B';
    s.dataset.forEvent =
      c.dataset.eventid +
      '|' +
      (c.getAttribute('aria-label') || c.innerText.slice(0, 30));
    c.appendChild(s);
  });
  window.__ev = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      const f = (k, nodes) =>
        nodes.forEach((a) => {
          if (a.nodeType != 1) return;
          (a.matches('[data-eventchip]')
            ? [a]
            : [...a.querySelectorAll('[data-eventchip]')]
          ).forEach((c) => __ev.push([k, __cid(c)]));
        });
      f('add', m.addedNodes);
      f('rm', m.removedNodes);
      if (m.type == 'attributes' && m.target.matches?.('[data-eventchip]'))
        __ev.push([
          'id',
          __cid(m.target),
          m.oldValue?.slice(0, 6),
          m.target.dataset.eventid?.slice(0, 6),
        ]);
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-eventid'],
    attributeOldValue: true,
  });
});
const audit = async (label) =>
  console.log(
    label,
    JSON.stringify(
      await p.evaluate(() => {
        const chips = [...document.querySelectorAll('[data-eventchip]')];
        const badged = chips.filter((c) => c.querySelector('.__badge'));
        const stale = badged.filter(
          (c) =>
            !c
              .querySelector('.__badge')
              .dataset.forEvent.startsWith(c.dataset.eventid + '|'),
        );
        const byCid = {};
        for (const e of __ev) {
          (byCid[e[1]] ??= []).push(e[0]);
        }
        const moved = Object.values(byCid).filter(
            (a) => a.includes('rm') && a.includes('add'),
          ).length,
          idchg = __ev.filter((e) => e[0] == 'id').length;
        __ev.length = 0;
        return {
          chips: chips.length,
          badged: badged.length,
          STALE_badges: stale.length,
          cidsRemovedThenReadded: moved,
          idAttrChanges: idchg,
        };
      }),
    ),
  );
await audit('baseline');
await p.getByRole('button', { name: /^Next week/ }).click();
await p.waitForTimeout(1500);
await audit('after next');
await p.getByRole('button', { name: /^Previous week/ }).click();
await p.waitForTimeout(1500);
await audit('after prev');
await b.close();
