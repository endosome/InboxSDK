import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1200 })
    .catch(() => {});
await p.mouse.move(600, 500);
await p.mouse.wheel(0, -3000);
await p.waitForTimeout(800);
const cb = await p
  .locator('[data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .boundingBox();
const cx = cb.x + cb.width / 2,
  cy = cb.y + cb.height / 2;
await p.mouse.move(cx, cy);
await p.mouse.down();
await p.mouse.move(cx + 3, cy - 3, { steps: 3 });
await p.waitForTimeout(150);
for (let i = 1; i <= 40; i++) {
  await p.mouse.move(cx + ((516 - cx) * i) / 40, cy + ((168 - cy) * i) / 40);
  await p.waitForTimeout(40);
}
for (let j = 0; j < 6; j++) {
  await p.mouse.move(516 + (j % 2), 168 + (j % 2));
  await p.waitForTimeout(150);
}
await p.screenshot({
  path: 'ta5.png',
  clip: { x: 256, y: 140, width: 960, height: 260 },
});
await p.mouse.up();
await p.waitForTimeout(2500);
console.log(
  'dialogs',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog]')].map((d) =>
        d.innerText.slice(0, 60),
      ),
    ),
  ),
);
console.log(
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((c) => /Timed A/.test(c.innerText))
        .map((c) => {
          const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
          const r = c.getBoundingClientRect();
          return {
            id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
            txt: c.innerText.replace(/\n/g, '|').slice(0, 44),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            role: c.getAttribute('role'),
            dk: c.closest('[data-datekey]')?.dataset.datekey || null,
          };
        }),
    ),
  ),
);
await p.close();
await b.close();
