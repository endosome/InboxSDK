import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
console.log(
  await p.evaluate(() => {
    const o = {};
    for (const c of document.querySelectorAll('[data-eventchip]')) {
      const j = c.getAttribute('jslog') || '';
      const id = c.dataset.eventid;
      const k = id.startsWith('ttb_')
        ? 'task'
        : id.startsWith('bday_')
        ? 'birthday'
        : 'event';
      o[k] = o[k] || { n: 0, withField1: 0, tail: '' };
      o[k].n++;
      if (/;1:\["/.test(j)) o[k].withField1++;
      o[k].tail = j
        .replace(/null,?/g, '')
        .replace(/[0-9a-z]{20,}/g, '<id>')
        .replace(/[\w.]+@[\w.]+/g, '<cal>')
        .slice(0, 110);
    }
    return JSON.stringify(o, null, 1);
  }),
);
await p.close();
await b.close();
