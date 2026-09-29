import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const install = () => {
  window.__cls = [];
  const classify = (d) => {
    const ids = [...d.querySelectorAll('[data-eventid]')].map(
      (e) => e.dataset.eventid,
    );
    const chips = [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => !d.contains(c))
      .map((c) => c.dataset.eventid);
    const routeEid = location.pathname.split('/').pop();
    return {
      nIds: ids.length,
      matchesChip: ids.some((i) => chips.includes(i)),
      matchesRoute: ids.includes(routeEid),
      addTitle: !!d.querySelector('input[aria-label="Add title"]'),
      hasEdit: !!d.querySelector('button[jsname=DyVDA]'),
      layout: d.getAttribute('data-layout-mode'),
    };
  };
  window.__classify = classify;
  new MutationObserver((ms) => {
    for (const m of ms)
      for (const a of m.addedNodes) {
        if (a.nodeType != 1) continue;
        const ds = a.matches('[role=dialog][data-chips-dialog]')
          ? [a]
          : [...a.querySelectorAll('[role=dialog][data-chips-dialog]')];
        for (const d of ds) {
          const t0 = classify(d);
          setTimeout(() => window.__cls.push({ t0, t200: classify(d) }), 250);
        }
      }
  }).observe(document.body, { subtree: true, childList: true });
};
async function scenario(p, label, act) {
  await p.evaluate(() => {
    window.__cls = [];
  });
  await act();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => window.__cls.slice(-1)[0] || null);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  console.log(label.padEnd(34), JSON.stringify(r));
}
async function open(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3200);
  for (const x of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: x })
      .click({ timeout: 1000 })
      .catch(() => {});
  await p.evaluate(install);
  return p;
}
const chip = (p, t) => () =>
  p.locator('[data-eventchip]').filter({ hasText: t }).first().click();
const p = await open(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
console.log(
  'scenario'.padEnd(34),
  '{t0/t200 classification: nIds, matchesChip, matchesRoute, addTitle, hasEdit, layout}',
);
await scenario(p, 'popover: event', chip(p, 'Timed A'));
await scenario(p, 'popover: task', chip(p, 'Task A'));
await scenario(p, 'popover: birthday', chip(p, 'birthday'));
await scenario(p, 'popover: recurring instance', chip(p, 'Weekly recurring'));
await scenario(p, 'popover: shared-cal (owner)', chip(p, 'SharedCal'));
await scenario(p, 'quick-create: Create>Event', async () => {
  await p
    .getByRole('button', { name: /^Create/ })
    .first()
    .click();
  await p
    .getByRole('menuitem', { name: /^Event/ })
    .first()
    .click();
});
await scenario(p, 'quick-create: Create>Task', async () => {
  await p
    .getByRole('button', { name: /^Create/ })
    .first()
    .click();
  await p.getByRole('menuitem', { name: /^Task/ }).first().click();
});
await scenario(p, 'quick-create: grid slot click', async () => {
  const bb = await p
    .locator('[data-eventchip]')
    .filter({ hasText: 'Timed A' })
    .first()
    .boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y - 110);
});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/month/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
await p.evaluate(install);
await scenario(p, 'month: popover event', chip(p, 'Timed A'));
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/agenda/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
await p.evaluate(install);
await scenario(p, 'agenda: popover event', chip(p, 'Timed A'));
await p.close();
const q = await open(
  'https://calendar.google.com/calendar/u/1/r/week/2026/9/30?hl=en',
);
await scenario(q, 'invitee: popover shared read-only', chip(q, 'SharedCal'));
await scenario(q, 'invitee: popover invited event', chip(q, 'With guest'));
await q.close();
await b.close();
