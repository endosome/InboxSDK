import { chromium } from 'playwright-core';
import fs from 'fs';
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
  window.__n = [];
  navigation.addEventListener('navigate', (e) =>
    window.__n.push([
      e.navigationType,
      new URL(e.destination.url).pathname,
      e.userInitiated,
      performance.now() | 0,
    ]),
  );
  navigation.addEventListener('currententrychange', (e) =>
    window.__n.push([
      'cec',
      location.pathname,
      document.title.slice(0, 30),
      performance.now() | 0,
    ]),
  );
});
await p.getByRole('button', { name: /^Next week/ }).click();
await p.waitForTimeout(1500);
console.log('nav events', JSON.stringify(await p.evaluate(() => window.__n)));
await p.getByRole('button', { name: /^Previous week/ }).click();
await p.waitForTimeout(1500);
// popover
await p.evaluate(() => (window.__n = []));
const chip = p.locator('[data-eventchip]', { hasText: 'Timed A' }).first();
await chip.click();
await p.waitForTimeout(1500);
const pop = await p.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  if (!d) return null;
  const at = (e) =>
    Object.fromEntries(
      [...e.attributes].map((a) => [a.name, a.value.slice(0, 160)]),
    );
  const acts = [...d.querySelectorAll('button,[role=button]')].map((e) => ({
    l: e.getAttribute('aria-label'),
    j: e.getAttribute('jsname'),
    t: e.textContent.trim().slice(0, 20),
  }));
  return {
    attrs: at(d),
    parents: [d.parentElement, d.parentElement?.parentElement].map(
      (e) => e && at(e),
    ),
    acts,
    eventidInside: [...d.querySelectorAll('[data-eventid]')].map((e) =>
      e.getAttribute('data-eventid'),
    ),
    text: d.innerText.slice(0, 200),
    inBody: d.parentElement === document.body,
    html: d.outerHTML.length,
  };
});
console.log('popover', JSON.stringify(pop, null, 1));
console.log(
  'nav after click',
  JSON.stringify(
    await p.evaluate(() => ({ n: window.__n, url: location.pathname })),
  ),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
console.log(
  'after esc dialog?',
  await p.evaluate(() => !!document.querySelector('[role=dialog]')),
);
await b.close();
