import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
console.log(
  await p.evaluate(() => {
    const s = document.getElementById('initialdata');
    const t = s?.textContent || '';
    const u = document.getElementById('xUserInfo');
    return {
      initialLen: t.length,
      head: t.slice(0, 80).replace(/[A-Za-z0-9+/_-]{20,}/g, '<tok>'),
      hasEmail: /@gmail\.com/.test(t),
      hasEventId: t.includes('fx0ba838f1de372227d532f32a'),
      xUserInfo: u
        ? [...u.attributes].map((a) => a.name).join(',') +
          ' | ' +
          u.textContent.slice(0, 40).replace(/@.*/, '@…')
        : null,
      tz: document.getElementById('timezonedata')?.textContent.slice(0, 60),
      wiz: Object.keys(WIZ_global_data),
      htmlLang: document.documentElement.lang,
      htmlAttrs: [...document.documentElement.attributes]
        .map((a) => a.name)
        .join(','),
    };
  }),
);
await b.close();
