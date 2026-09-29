import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
console.log(p.url());
const r = await p.evaluate(() =>
  [...document.querySelectorAll('[data-eventchip]')].map((e) => {
    const id = e.getAttribute('data-eventid');
    const pad = id + '='.repeat((4 - (id.length % 4)) % 4);
    let dec;
    try {
      dec = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      dec = 'ERR';
    }
    const jl = e.getAttribute('jslog') || '';
    return {
      title: (e.innerText || '').split('\n')[0].slice(0, 26),
      dec,
      jslog: jl.slice(0, 230),
      dk: e.closest('[data-datekey]')?.getAttribute('data-datekey'),
      tag: e.tagName,
      others: [...e.attributes].map((a) => a.name).join(','),
    };
  }),
);
for (const x of r) console.log(JSON.stringify(x));
await b.close();
