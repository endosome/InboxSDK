// EXPERIMENTAL — see README.md. Read-only.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2] ?? './out';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((p) => p.url().includes('calendar.google.com')) ??
  (await ctx.newPage());
const network = [],
  routes = [],
  chips = {};
page.on('response', async (r) => {
  const u = new URL(r.url());
  if (!/google\.com$/.test(u.hostname)) return;
  network.push({
    t: Date.now(),
    method: r.request().method(),
    host: u.hostname,
    path: u.pathname,
    type: r.headers()['content-type'],
    status: r.status(),
    rt: r.request().resourceType(),
  });
});
await page.addInitScript(() => {
  const push = history.pushState,
    rep = history.replaceState;
  window.__calProbe = [];
  history.pushState = function (...a) {
    window.__calProbe.push(['push', String(a[2]), performance.now()]);
    return push.apply(this, a);
  };
  history.replaceState = function (...a) {
    window.__calProbe.push(['replace', String(a[2]), performance.now()]);
    return rep.apply(this, a);
  };
  addEventListener('popstate', () =>
    window.__calProbe.push(['popstate', location.href, performance.now()]),
  );
});
async function snap(label) {
  routes.push({
    label,
    ...(await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      hist: window.__calProbe?.splice(0),
    }))),
  });
}
async function chipAttrs(label) {
  chips[label] = await page.evaluate(() => {
    // candidate event chips: anything exposing an event-ish attribute; discover, don't assume
    const cands = [
      ...document.querySelectorAll(
        '[data-eventid],[data-eventchip],[role=button][data-draggable-id],[jscontroller][data-eventid]',
      ),
    ].slice(0, 25);
    const attrs = (el) =>
      Object.fromEntries(
        [...el.attributes]
          .filter((a) => a.name !== 'style')
          .map((a) => [a.name, a.value.slice(0, 200)]),
      );
    return cands.map((el) => ({
      own: attrs(el),
      ancestors: (() => {
        const r = [];
        let p = el.parentElement;
        for (let i = 0; i < 4 && p; i++, p = p.parentElement) r.push(attrs(p));
        return r;
      })(),
      text: el.textContent?.slice(0, 60),
    }));
  });
}
for (const v of ['day', 'week', 'month', 'year', 'agenda']) {
  await page.goto(`https://calendar.google.com/calendar/u/0/r/${v}`, {
    waitUntil: 'load',
  });
  await page.waitForTimeout(2500);
  await snap(v);
  await chipAttrs(v);
}
const globals = await page.evaluate(() =>
  Object.keys(window)
    .filter((k) => !(k in Object.getPrototypeOf(window)) && !/^on/.test(k))
    .slice(0, 400),
);
fs.writeFileSync(`${out}/chip-attributes.json`, JSON.stringify(chips, null, 1));
fs.writeFileSync(`${out}/network.json`, JSON.stringify(network, null, 1));
fs.writeFileSync(`${out}/routes.json`, JSON.stringify(routes, null, 1));
fs.writeFileSync(`${out}/globals.json`, JSON.stringify(globals, null, 1));
console.log('wrote', out);
await browser.close();
