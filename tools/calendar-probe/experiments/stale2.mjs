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
const add = () =>
  p.evaluate(() => {
    document.querySelectorAll('[data-eventchip]').forEach((c) => {
      const s = document.createElement('span');
      s.className = '__badge';
      s.textContent = 'B';
      c.appendChild(s);
      const t = document.createElement('span');
      t.className = '__adj';
      c.parentElement.insertBefore(t, c.nextSibling);
    });
  });
const cnt = (l) =>
  p
    .evaluate(
      (l) => ({
        l,
        inChip: document.querySelectorAll('[data-eventchip] .__badge').length,
        adjacent: document.querySelectorAll('.__adj').length,
        chips: document.querySelectorAll('[data-eventchip]').length,
      }),
      l,
    )
    .then((x) => console.log(JSON.stringify(x)));
await add();
await cnt('t0');
await p.hover('[data-eventchip]');
await p.waitForTimeout(800);
await cnt('after hover');
const vp = p.viewportSize();
await p.setViewportSize({
  width: (vp?.width || 1200) - 120,
  height: vp?.height || 900,
});
await p.waitForTimeout(1500);
await cnt('after resize');
await p.locator('[data-eventchip]', { hasText: 'Timed A' }).first().click();
await p.waitForTimeout(1000);
await cnt('popover open');
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
await cnt('popover closed');
await p.setViewportSize(vp || { width: 1200, height: 900 });
await b.close();
