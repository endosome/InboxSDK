import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const R = (s) =>
  s
    .replace(/owner@gmail\.com/g, '<A0>')
    .replace(/invitee@gmail\.com/g, '<A1>')
    .replace(/[0-9a-f]{64}@group\.calendar\.google\.com/g, '<HEX64>@g');
for (const path of [
  'settings',
  'settings/createcalendar',
  'settings/addbyurl',
  'settings/calendar/' + 'X',
]) {
  if (path.endsWith('/X')) continue;
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${path}?hl=en`, {
    waitUntil: 'load',
  });
  await p.waitForTimeout(2500);
  console.log(
    path.padEnd(26),
    JSON.stringify(
      await p.evaluate(() => ({
        url: location.pathname,
        html: document.documentElement.dataset.prefetchViewKey ?? null,
        bodyKey: document.body.dataset.viewkey ?? null,
        family: document.body.dataset.viewfamily ?? null,
        main:
          document.querySelector('[role=main]')?.dataset.periodType ??
          (document.querySelector('[role=main]')
            ? 'main(no period)'
            : 'no main'),
        title: document.title,
      })),
    ),
  );
}
// settings for a specific calendar (click first sidebar calendar)
await p.goto('https://calendar.google.com/calendar/u/0/r/settings?hl=en', {
  waitUntil: 'load',
});
await p.waitForTimeout(2500);
await p
  .getByText(process.env.OWNER_CALENDAR_NAME ?? 'My calendar', { exact: true })
  .first()
  .click()
  .catch(() => {});
await p.waitForTimeout(2000);
console.log(
  'settings/calendar/<id>'.padEnd(26),
  R(
    JSON.stringify(
      await p.evaluate(() => ({
        url: location.pathname.replace(/[A-Za-z0-9_-]{30,}/, '<token>'),
        html: document.documentElement.dataset.prefetchViewKey ?? null,
        bodyKey: document.body.dataset.viewkey ?? null,
        family: document.body.dataset.viewfamily ?? null,
      })),
    ),
  ),
);
// xUserInfo structure
await p.goto('https://calendar.google.com/calendar/u/0/r/week?hl=en', {
  waitUntil: 'load',
});
await p.waitForTimeout(3000);
console.log(
  'xUserInfo',
  R(
    JSON.stringify(
      await p.evaluate(() => {
        const u = document.getElementById('xUserInfo');
        return {
          attrs: [...u.attributes].map(
            (a) => a.name + '=' + a.value.slice(0, 30),
          ),
          children: [...u.children].map((c) => ({
            tag: c.tagName.toLowerCase(),
            id: c.id || null,
            cls: String(c.className).slice(0, 20),
            text: c.textContent.slice(0, 60),
            attrs: [...c.attributes].map((a) => a.name).join(','),
          })),
        };
      }),
      null,
      1,
    ),
  ),
);
console.log(
  'locale/tz sources',
  R(
    JSON.stringify(
      await p.evaluate(() => ({
        htmlLang: document.documentElement.lang,
        resolvedTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tzdataHead: document
          .getElementById('timezonedata')
          ?.textContent.slice(0, 50),
      })),
    ),
  ),
);
await p.close();
await b.close();
