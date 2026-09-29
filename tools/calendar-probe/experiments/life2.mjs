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
  window.__h = [];
  for (const k of ['pushState', 'replaceState']) {
    const o = history[k];
    history[k] = function (...a) {
      window.__h.push([k, String(a[2])]);
      return o.apply(this, a);
    };
  }
  addEventListener('popstate', () =>
    window.__h.push(['popstate', location.pathname]),
  );
  addEventListener('hashchange', () => window.__h.push(['hashchange']));
});
console.log(
  await p.evaluate(() =>
    [...document.querySelectorAll('[role=tab],[role=radio],button')]
      .map((e) => e.getAttribute('aria-label') || '')
      .filter((x) =>
        /week|month|day|year|schedule|today|next|previous/i.test(x),
      )
      .slice(0, 20),
  ),
);
const step = async (label, fn) => {
  await p.evaluate(() => (window.__h = []));
  await fn();
  await p.waitForTimeout(1800);
  console.log(
    label,
    JSON.stringify(
      await p.evaluate(() => ({
        p: location.pathname,
        t: document.title,
        h: window.__h,
      })),
    ),
  );
};
await step('next btn', () =>
  p.getByRole('button', { name: /next week/i }).click(),
);
await step('prev btn', () =>
  p.getByRole('button', { name: /previous week/i }).click(),
);
await step('today btn', () =>
  p.getByRole('button', { name: /^Today/ }).click(),
);
await step('goBack', () => p.goBack());
await step('goForward', () => p.goForward());
await b.close();
