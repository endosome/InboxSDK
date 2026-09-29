import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
for (let run = 0; run < 3; run++) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  const t0 = Date.now();
  const seen = {};
  const nav = p.goto(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
    { waitUntil: 'commit' },
  );
  await nav;
  while (Date.now() - t0 < 9000) {
    try {
      const st = await p.evaluate(() => ({
        rs: document.readyState,
        xUser: !!document.getElementById('xUserInfo'),
        init: !!document.getElementById('initialdata'),
        vk: !!document.documentElement.dataset.prefetchViewKey,
        main: !!document.querySelector('[role=main]'),
        chip: document.querySelectorAll('[data-eventchip]').length > 0,
        nav: typeof navigation,
      }));
      for (const k of Object.keys(st)) {
        if (!(k in seen) && st[k] && st[k] !== 'loading')
          seen[k] = Date.now() - t0;
      }
      if (seen.chip) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log('run', run, 'ms until first seen:', JSON.stringify(seen));
  await p.close();
}
await b.close();
