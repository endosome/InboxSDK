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
// tag existing chips with expando + install observer counting adds/removes of chip elements
await p.evaluate(() => {
  let n = 0;
  window.__log = [];
  window.__tag = (e) => {
    if (!e.__cid) e.__cid = ++n;
    return e.__cid;
  };
  document.querySelectorAll('[data-eventchip]').forEach(window.__tag);
  new MutationObserver((ms) => {
    for (const m of ms) {
      for (const a of m.addedNodes)
        if (a.nodeType == 1) {
          const cs = a.matches?.('[data-eventchip]')
            ? [a]
            : [...(a.querySelectorAll?.('[data-eventchip]') || [])];
          cs.forEach((c) =>
            window.__log.push([
              'add',
              window.__tag(c),
              c.getAttribute('data-eventid')?.slice(0, 8),
            ]),
          );
        }
      for (const r of m.removedNodes)
        if (r.nodeType == 1) {
          const cs = r.matches?.('[data-eventchip]')
            ? [r]
            : [...(r.querySelectorAll?.('[data-eventchip]') || [])];
          cs.forEach((c) =>
            window.__log.push([
              'rm',
              c.__cid,
              c.getAttribute('data-eventid')?.slice(0, 8),
            ]),
          );
        }
      if (
        m.type == 'attributes' &&
        m.attributeName == 'data-eventid' &&
        m.target.matches('[data-eventchip]')
      )
        window.__log.push(['attr-eventid-changed', m.target.__cid]);
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-eventid'],
  });
});
const step = async (label, fn) => {
  await p.evaluate(() => (window.__log = []));
  await fn();
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => ({
    url: location.href,
    chips: document.querySelectorAll('[data-eventchip]').length,
    log: window.__log.reduce((a, x) => {
      a[x[0]] = (a[x[0]] || 0) + 1;
      return a;
    }, {}),
    hist: window.__calProbe,
  }));
  console.log(label, JSON.stringify(r));
};
await step('next-week (key n)', () => p.keyboard.press('n'));
await step('prev-week (key p)', () => p.keyboard.press('p'));
await step('today (t)', () => p.keyboard.press('t'));
await step('month (m)', () => p.keyboard.press('m'));
await step('week (w)', () => p.keyboard.press('w'));
await step('day (d)', () => p.keyboard.press('d'));
await step('week (w)', () => p.keyboard.press('w'));
await step('history.back', () => p.goBack());
await b.close();
