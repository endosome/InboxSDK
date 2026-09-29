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
const dump = (label) =>
  p.evaluate((label) => {
    const at = (e) =>
      Object.fromEntries(
        [...e.attributes]
          .filter((a) => !/^(style|jsaction|class)$/.test(a.name))
          .map((a) => [a.name, a.value.slice(0, 120)]),
      );
    return {
      label,
      url: location.pathname + location.search.slice(0, 60),
      title: document.title,
      dialogs: [...document.querySelectorAll('[role=dialog]')].map((d) => ({
        ...at(d),
        text: d.innerText.slice(0, 90).replace(/\n/g, ' | '),
      })),
      main: [...document.querySelectorAll('[role=main]')].map(at),
      titleInput: !!document.querySelector('input[aria-label=Title]'),
      eventidsOnPage: [
        ...new Set(
          [...document.querySelectorAll('[data-eventid]')].map((e) =>
            e.dataset.eventid.slice(0, 10),
          ),
        ),
      ],
      bodyKids: [...document.body.children]
        .map(
          (c) =>
            c.tagName + '#' + c.id + '.' + String(c.className).slice(0, 20),
        )
        .slice(0, 14),
    };
  }, label);
console.log(JSON.stringify(await dump('week-idle')));
await p.locator('[data-eventchip]', { hasText: 'Timed A' }).first().click();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Edit event' }).click();
await p.waitForTimeout(2500);
console.log(JSON.stringify(await dump('editor-from-popover')));
await p
  .getByRole('button', { name: 'Cancel event creation' })
  .or(p.locator('[jsname=gQ2Xie]'))
  .first()
  .click()
  .catch((e) => console.log('cancel err'));
await p.waitForTimeout(1500);
console.log(JSON.stringify(await dump('after-cancel')));
// quick create: click empty slot in Fri column 8am-ish
const box = await p.locator('[data-datekey]').first().boundingBox();
console.log('grid col box', !!box);
await b.close();
