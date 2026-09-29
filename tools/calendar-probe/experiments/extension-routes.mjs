// EXPERIMENTAL — loads examples/calendar-hello (built SDK) in real Chrome over CDP and checks the
// sequence of route logs while navigating in-app. Start Chrome with --enable-unsafe-extension-debugging
// (see extension-smoke.mjs). Requires `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-hello',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const s = await b.newBrowserCDPSession();
const { id } = await s.send('Extensions.loadUnpacked', { path: extPath });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const logs = [];
p.on('console', (m) => {
  if (m.text().startsWith('CalendarSDK')) logs.push(m.text());
});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 1500 })
  .catch(() => {});
for (
  let i = 0;
  i < 40 && !logs.some((l) => l.startsWith('CalendarSDK route'));
  i++
)
  await p.waitForTimeout(250);
const marks = [];
const step = async (label, fn, wait = 1500) => {
  const n = logs.length;
  await fn();
  await p.waitForTimeout(wait);
  marks.push([
    label,
    logs
      .slice(n)
      .filter(
        (l) => l.startsWith('CalendarSDK route ') && !l.includes('ended'),
      ),
  ]);
};
await step('next week', () =>
  p.getByRole('button', { name: /^Next week/ }).click(),
);
await step('prev week', () =>
  p.getByRole('button', { name: /^Previous week/ }).click(),
);
await step('today', () => p.getByRole('button', { name: /^Today/ }).click());
for (const [k, label] of [
  ['m', 'month'],
  ['d', 'day'],
  ['y', 'year'],
  ['a', 'agenda'],
  ['x', 'custom days'],
  ['w', 'week'],
])
  await step(`key ${k} (${label})`, () => p.keyboard.press(k));
await step(
  'open editor',
  async () => {
    await p.locator('[data-eventchip]').first().click();
    await p.waitForTimeout(800);
    await p.locator('[role=dialog] button[jsname=DyVDA]').click();
  },
  2500,
);
await step('cancel editor', () => p.locator('[jsname=gQ2Xie]').click());
await step(
  'settings',
  async () => {
    await p.getByRole('button', { name: /Settings menu/i }).click();
    await p.getByRole('menuitem', { name: /^Settings/ }).click();
  },
  2500,
);
await step('history.back', () => p.goBack(), 2000);
await step(
  'popover open (no route change)',
  async () => {
    await p.locator('[data-eventchip]').first().click();
  },
  1200,
);
await p.keyboard.press('Escape');
console.log(
  logs.find((l) => l.startsWith('CalendarSDK loaded')) ??
    'NO "CalendarSDK loaded" log',
);
for (const [label, routes] of marks)
  console.log(
    label.padEnd(30),
    routes.map((r) => r.replace('CalendarSDK route ', '')).join(' | ') ||
      '(none)',
  );
await p.close();
await b.close();
