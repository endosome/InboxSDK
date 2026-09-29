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
await p.evaluate(() => {
  let n = 0;
  window.__cid = (e) => e.__cid || (e.__cid = ++n);
  window.__pre = new Set();
  document.querySelectorAll('[data-eventchip]').forEach((c) => {
    __cid(c);
    __pre.add(c);
  });
  window.__ev = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type == 'attributes' && m.target.matches?.('[data-eventchip]'))
        __ev.push({
          k: 'id',
          cid: __cid(m.target),
          wasPre: __pre.has(m.target),
          old: m.oldValue && m.oldValue.slice(0, 8),
          now: m.target.dataset.eventid?.slice(0, 8),
          connected: m.target.isConnected,
        });
      for (const a of m.addedNodes)
        if (a.nodeType == 1)
          (a.matches('[data-eventchip]')
            ? [a]
            : [...a.querySelectorAll('[data-eventchip]')]
          ).forEach((c) =>
            __ev.push({
              k: 'add',
              cid: __cid(c),
              wasPre: __pre.has(c),
              now: c.dataset.eventid?.slice(0, 8),
            }),
          );
      for (const a of m.removedNodes)
        if (a.nodeType == 1)
          (a.matches('[data-eventchip]')
            ? [a]
            : [...a.querySelectorAll('[data-eventchip]')]
          ).forEach((c) =>
            __ev.push({ k: 'rm', cid: __cid(c), wasPre: __pre.has(c) }),
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
for (const name of [/^Next week/, /^Previous week/]) {
  await p.evaluate(() => (window.__ev.length = 0));
  await p.getByRole('button', { name }).click();
  await p.waitForTimeout(1800);
  const ev = await p.evaluate(() => window.__ev);
  const ids = ev.filter((e) => e.k == 'id');
  console.log(
    String(name),
    'events',
    ev.length,
    '| id-changes',
    ids.length,
    '| id-changes on PRE-EXISTING chip elements:',
    ids.filter((e) => e.wasPre).length,
    '| with non-empty oldValue:',
    ids.filter((e) => e.old).length,
    '| adds of pre-existing (moved) elements:',
    ev.filter((e) => e.k == 'add' && e.wasPre).length,
  );
  console.log(' sample id events', JSON.stringify(ids.slice(0, 4)));
}
await b.close();
