import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const s = ctx.pages().find((x) => x.url().includes('settings/calendar/'));
const tok = new URL(s.url()).pathname.split('/').pop();
const t = tok.replace(/-/g, '+').replace(/_/g, '/');
const calId = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
await s.close();
async function mk(title, dates) {
  const p = await ctx.newPage();
  await p.goto(
    `https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(
      title,
    )}&dates=${dates}&src=${encodeURIComponent(calId)}&hl=en`,
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3500);
  for (const g of await p.getByRole('button', { name: 'Got it' }).all())
    await g.click().catch(() => {});
  console.log(
    'calendar selector shows:',
    await p.evaluate(() =>
      document.body.innerText.match(/CALSDK Shared/g)?.slice(0, 3),
    ),
  );
  await p.click('[jsname=x8hlje]');
  await p.waitForTimeout(2500);
  await p.close();
}
await mk('[CALSDK] SharedCal', '20260930T090000/20260930T100000');
await mk('[CALSDK] Dup', '20260930T160000/20260930T170000');
await b.close();
