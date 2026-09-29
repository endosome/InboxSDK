import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
async function page() {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3500);
  for (const n of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: n })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
const snap = (p, rx) =>
  p.evaluate((src) => {
    const rx = new RegExp(src);
    return [...document.querySelectorAll('[data-eventchip]')]
      .filter((c) => rx.test(c.innerText))
      .map((c) => {
        const r = c.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          w: Math.round(r.width),
          y: Math.round(r.y),
          cid: (c.__c ??= Math.random().toString(36).slice(2, 5)),
        };
      });
  }, rx.source);
async function attempt(label, rx, edgeFromLeft, dx) {
  const p = await page();
  const loc = p.locator('[data-eventchip]').filter({ hasText: rx }).first();
  const bb = await loc.boundingBox();
  const ex = bb.x + edgeFromLeft,
    ey = bb.y + bb.height / 2;
  console.log(label, 'before', JSON.stringify(await snap(p, rx)));
  await p.mouse.move(ex, ey);
  await p.waitForTimeout(200);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(ex + (dx * i) / 12, ey);
    await p.waitForTimeout(50);
  }
  await p.mouse.up();
  await p.waitForTimeout(2200);
  console.log(
    label,
    'dialogs',
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[role=dialog]')].map((d) =>
          d.innerText.replace(/\n/g, '|').slice(0, 50),
        ),
      ),
    ),
    'after',
    JSON.stringify(await snap(p, rx)),
  );
  await p.keyboard.press('Escape');
  await p.close();
}
await attempt('AllDay right edge +126', /AllDay(?! weekly)/, 112, 126);
// multi-day: last chip's right end
const p0 = await page();
const boxes = await p0.evaluate(() =>
  [...document.querySelectorAll('[data-eventchip]')]
    .filter((c) => /MultiDay/.test(c.innerText))
    .map((c) => {
      const r = c.getBoundingClientRect();
      return [Math.round(r.x), Math.round(r.width), Math.round(r.y)];
    }),
);
console.log('multiday boxes', JSON.stringify(boxes));
await p0.close();
await b.close();
