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
const target = () =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    const r = c.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      id: c.dataset.eventid.slice(0, 8),
    };
  });
const t0 = await target();
const tid = t0.id;
await p.evaluate((tid) => {
  window.__seen = [];
  window.__tid = tid;
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const a of m.addedNodes) {
        if (a.nodeType != 1) continue;
        const cs = a.matches('[data-eventchip]')
          ? [a]
          : [...a.querySelectorAll('[data-eventchip]')];
        cs.forEach((c) =>
          window.__seen.push({
            id: (c.dataset.eventid || '(none)').slice(0, 8),
            sameAsTarget: (c.dataset.eventid || '').slice(0, 8) == window.__tid,
            attrs: [...c.attributes].map((x) => x.name).join(','),
            hasRole: c.hasAttribute('role'),
            parent:
              c.parentElement?.tagName +
              '.' +
              String(c.parentElement?.className).slice(0, 12),
            conn: c.isConnected,
          }),
        );
      }
  }).observe(document.body, { subtree: true, childList: true });
}, tid);
await p.mouse.move(t0.x + t0.w / 2, t0.y + t0.h / 2);
await p.mouse.down();
let maxDup = 0;
for (let i = 1; i <= 12; i++) {
  await p.mouse.move(t0.x + t0.w / 2, t0.y + t0.h / 2 + i * 8, { steps: 2 });
  await p.waitForTimeout(60);
  maxDup = Math.max(
    maxDup,
    await p.evaluate(
      (tid) =>
        [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
          (c.dataset.eventid || '').startsWith(tid),
        ).length,
      tid,
    ),
  );
}
await p.mouse.up();
await p.waitForTimeout(2000);
const seen = await p.evaluate(() => window.__seen);
const g = {};
for (const s of seen) {
  const k = [
    s.id === undefined
      ? ''
      : s.sameAsTarget
      ? 'TARGET-ID'
      : s.id === '(none)'
      ? 'NO-ID'
      : 'other-id',
    s.hasRole ? 'role' : 'no-role',
    s.parent,
  ].join(' ');
  g[k] = (g[k] || 0) + 1;
}
console.log(
  'max chips sharing target id during drag:',
  maxDup,
  '\nadded chip elements grouped:',
  JSON.stringify(g, null, 1),
);
await p.close();
await b.close();
