import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const chain = (e) => {
        const o = [];
        while (e && e !== document.documentElement) {
          o.push(
            e.tagName.toLowerCase() +
              (e.id ? '#' + e.id : '') +
              (e.getAttribute('role')
                ? '[role=' + e.getAttribute('role') + ']'
                : ''),
          );
          e = e.parentElement;
        }
        return o.join(' < ');
      };
      const chip = document.querySelector('[data-eventchip]');
      return {
        main: chain(document.querySelector('[role=main]')),
        chip: chain(chip).split(' < ').slice(-6).join(' < '),
        bodyChildren: [...document.body.children]
          .filter((c) => !/SCRIPT|STYLE/.test(c.tagName))
          .map(
            (c) =>
              c.tagName.toLowerCase() +
              (c.id ? '#' + c.id : '') +
              '.' +
              String(c.className).split(' ')[0] +
              ' kids=' +
              c.children.length,
          ),
        appRootKids: [...document.getElementById('yDmH0d').children]
          .map(
            (c) =>
              c.tagName.toLowerCase() + '.' + String(c.className).split(' ')[0],
          )
          .slice(0, 10),
      };
    }),
    null,
    1,
  ),
);
await p.close();
await b.close();
