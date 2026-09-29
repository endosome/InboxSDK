import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const kind = (c) => {
  const id = c.dataset.eventid;
  const k = id.startsWith('ttb_')
    ? 'task'
    : id.startsWith('bday_')
    ? 'birthday'
    : 'event';
  const allday = !c.getAttribute('role') && !c.closest('[data-datekey]');
  return (
    k +
    (k === 'event'
      ? /All day/.test(c.getAttribute('aria-label') || c.innerText)
        ? '/allday-ish'
        : ''
      : '')
  );
};
for (const v of ['day', 'week', 'month', 'agenda']) {
  await p.goto(
    `https://calendar.google.com/calendar/u/0/r/${v}/2026/9/30?hl=en`,
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3200);
  console.log(
    v.padEnd(7),
    JSON.stringify(
      await p.evaluate(() => {
        const m = {};
        for (const c of document.querySelectorAll('[data-eventchip]')) {
          const id = c.dataset.eventid;
          const k =
            (id.startsWith('ttb_')
              ? 'task'
              : id.startsWith('bday_')
              ? 'bday'
              : 'event') +
            '/' +
            (c.getAttribute('role') ? 'role' : 'norole') +
            '/' +
            (c.closest('[data-datekey]') ? 'dk' : 'nodk');
          const d = c.getAttribute('data-dragsource-type') ?? '-';
          m[k] = m[k] || {};
          m[k][d] = (m[k][d] || 0) + 1;
        }
        return m;
      }),
    ),
  );
}
await p.close();
await b.close();
