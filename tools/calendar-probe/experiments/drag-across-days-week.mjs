import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
async function page(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  for (const x of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: x })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
const snap = (p, t) =>
  p.evaluate(
    (t) =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((c) => c.innerText.includes(t))
        .map((c) => {
          const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
          const r = c.getBoundingClientRect();
          return {
            id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
            label: (
              c.getAttribute('aria-label') || c.innerText.split('\n')[0]
            ).slice(0, 60),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            cid: (c.__c ??= Math.random().toString(36).slice(2, 5)),
            dk: c.closest('[data-datekey]')?.dataset.datekey,
          };
        }),
    t,
  );
async function drag(p, t, dx, dy, label) {
  await p.evaluate(() => {
    window.__ev = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        if (m.type == 'attributes')
          window.__ev.push([
            'id',
            m.oldValue?.slice(0, 6),
            m.target.dataset.eventid?.slice(0, 6),
          ]);
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-eventid'],
      attributeOldValue: true,
    });
  });
  const before = await snap(p, t);
  console.log(label, 'before', R(JSON.stringify(before)));
  const bb = await p
    .locator('[data-eventchip]')
    .filter({ hasText: t })
    .first()
    .boundingBox();
  const cx = bb.x + bb.width / 2,
    cy = bb.y + bb.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  let maxSame = 0;
  for (let i = 1; i <= 15; i++) {
    await p.mouse.move(cx + (dx * i) / 15, cy + (dy * i) / 15, { steps: 2 });
    await p.waitForTimeout(50);
    maxSame = Math.max(
      maxSame,
      await p.evaluate(
        (t) =>
          [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
            c.innerText.includes(t),
          ).length,
        t,
      ),
    );
  }
  await p.mouse.up();
  await p.waitForTimeout(2000);
  console.log(
    label,
    'max chips w/ title during drag',
    maxSame,
    '| dialogs',
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[role=dialog]')].map((d) =>
          d.innerText.replace(/\n/g, '|').slice(0, 80),
        ),
      ),
    ),
  );
  console.log(
    label,
    'after',
    R(JSON.stringify(await snap(p, t))),
    '| id mutations',
    JSON.stringify(await p.evaluate(() => window.__ev)),
  );
}

const geo = (p, sel) =>
  p.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)]
      .map((x) => x.getBoundingClientRect())
      .filter((r) => r.width > 20 && r.height > 20);
    const xs = [...new Set(e.map((r) => Math.round(r.x)))].sort(
      (a, b) => a - b,
    );
    const ys = [...new Set(e.map((r) => Math.round(r.y)))].sort(
      (a, b) => a - b,
    );
    return {
      colw: xs.length > 1 ? xs[1] - xs[0] : null,
      rowh: ys.length > 1 ? ys[1] - ys[0] : null,
    };
  }, sel);
let p = await page(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
const g = await geo(p, 'div[role=gridcell][data-datekey]');
console.log('week geometry', JSON.stringify(g));
await drag(p, 'Timed A', g.colw, 0, 'week +1 day (Sep29->Sep30)');
await drag(p, 'Timed A', g.colw * 2, 0, 'week +2 days');
await drag(p, 'Timed A', -g.colw * 2, 0, 'week -2 days (restore)');
await p.close();
p = await page(
  'https://calendar.google.com/calendar/u/0/r/month/2026/10/20?hl=en',
);
const gm = await geo(p, '[data-datekey]');
console.log('month geometry', JSON.stringify(gm));
await drag(p, 'MonthDrag', 0, gm.rowh, 'month +1 week');
await drag(p, 'MonthDrag', -gm.colw, 0, 'month -1 day');
await p.close();
await b.close();
