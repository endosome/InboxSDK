import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
// body attrs by view
for (const v of ['day', 'week', 'month', 'year', 'agenda', 'search?q=CALSDK']) {
  await p.goto(
    `https://calendar.google.com/calendar/u/0/r/${v}${
      v.includes('?') ? '' : '/2026/9/30'
    }${v.includes('?') ? '&' : '?'}hl=en`,
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(2500);
  console.log(
    v.padEnd(16),
    JSON.stringify(
      await p.evaluate(() => ({
        viewfamily: document.body.dataset.viewfamily,
        viewkey: document.body.dataset.viewkey,
        htmlKey: document.documentElement.dataset.prefetchViewKey,
      })),
    ),
  );
}
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/eventedit?text=%5BCALSDK%5D+DeleteMe&dates=20261015T100000/20261015T110000&hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 800 })
  .catch(() => {});
for (const g of await p.getByRole('button', { name: 'Got it' }).all())
  await g.click().catch(() => {});
await p.click('[jsname=x8hlje]');
await p.waitForTimeout(3000);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/10/15?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 800 })
  .catch(() => {});
await p.evaluate(() => {
  window.__l = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      for (const a of m.removedNodes)
        if (
          a.nodeType == 1 &&
          (a.matches('[data-eventchip]') ||
            a.querySelector?.('[data-eventchip]'))
        )
          window.__l.push('chip removed');
      for (const a of m.addedNodes)
        if (a.nodeType == 1) {
          const t =
            (a.getAttribute?.('role') || '') +
            ':' +
            (a.innerText || '').slice(0, 40).replace(/\n/g, '|');
          if (/Undo|deleted|Event/i.test(a.innerText || ''))
            window.__l.push('added ' + t);
        }
    }
  }).observe(document.body, { subtree: true, childList: true });
});
console.log(
  'before delete: chips titled DeleteMe =',
  await p.locator('[data-eventchip]').filter({ hasText: 'DeleteMe' }).count(),
);
await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'DeleteMe' })
  .first()
  .click();
await p.waitForTimeout(900);
await p.locator('[role=dialog] button[jsname=VkLyEc]').click();
await p.waitForTimeout(1500);
console.log(
  'after delete: dialogs',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog]')].map((d) =>
        d.innerText.slice(0, 60),
      ),
    ),
  ),
  '| live regions/snackbar',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=alert],[role=status],[aria-live]')]
        .map((e) => (e.innerText || '').trim().slice(0, 60))
        .filter(Boolean),
    ),
  ),
  '| chips left',
  await p.locator('[data-eventchip]').filter({ hasText: 'DeleteMe' }).count(),
);
console.log('mutation log', JSON.stringify(await p.evaluate(() => window.__l)));
await p.waitForTimeout(6000);
console.log(
  'after 6s chips left',
  await p.locator('[data-eventchip]').filter({ hasText: 'DeleteMe' }).count(),
);
await p.close();
await b.close();
