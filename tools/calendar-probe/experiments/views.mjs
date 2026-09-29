import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
const info = () =>
  p.evaluate(() => ({
    path: location.pathname,
    search: location.search.slice(0, 50),
    period: document
      .querySelector('[role=main]')
      ?.getAttribute('data-period-type'),
    htmlAttrs: {
      uik: document.documentElement.dataset.uiKind,
      pvk: document.documentElement.dataset.prefetchViewKey,
      bt: document.documentElement.dataset.baseTitle,
    },
    chips: document.querySelectorAll('[data-eventchip]').length,
    grids: [...document.querySelectorAll('[role=grid]')].length,
    datekeys: document.querySelectorAll('[data-datekey]').length,
  }));
for (const v of [
  'day',
  'week',
  'month',
  'year',
  'agenda',
  'customweek',
  '4day',
]) {
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${v}/2026/9/30`, {
    waitUntil: 'load',
  });
  await p.waitForTimeout(2200);
  console.log(v, JSON.stringify(await info()));
}
// search route
await p.goto('https://calendar.google.com/calendar/u/0/r/search?q=CALSDK', {
  waitUntil: 'load',
});
await p.waitForTimeout(2500);
console.log('search', JSON.stringify(await info()));
// eid deep link (event details popup route)
await p.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/30', {
  waitUntil: 'load',
});
await p.waitForTimeout(2000);
// quick create: click empty slot
const col = p.locator('[role=main] [data-datekey]').nth(3);
const bb = await col.boundingBox();
console.log('col', bb && [bb.x | 0, bb.y | 0, bb.width | 0, bb.height | 0]);
await p.mouse.click(bb.x + bb.width / 2, bb.y + 40);
await p.waitForTimeout(1500);
console.log(
  'quickcreate',
  JSON.stringify(
    await p.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      return (
        d && {
          attrs: [...d.attributes]
            .filter((a) => !/jsaction|style|class/.test(a.name))
            .map((a) => a.name + '=' + a.value.slice(0, 40)),
          text: d.innerText.slice(0, 80).replace(/\n/g, '|'),
          hasEventId: !!d.querySelector('[data-eventid]'),
          url: location.pathname,
        }
      );
    }),
  ),
);
await p.keyboard.press('Escape');
await p.waitForTimeout(600);
console.log(
  'after esc',
  await p.evaluate(() => !!document.querySelector('[role=dialog]')),
  await p.evaluate(() => document.querySelectorAll('[data-eventchip]').length),
);
await b.close();
