import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = b
  .contexts()[0]
  .pages()
  .find((x) => x.url().includes('calendar.google.com'));
const seen = [];
p.on('response', async (r) => {
  const u = new URL(r.url());
  if (
    u.hostname !== 'calendar.google.com' ||
    !/sync\.|secondary|prefetch|\/_\/.*rpc|batchexecute/.test(u.pathname) ||
    r.request().method() !== 'POST'
  )
    return;
  let body = '';
  try {
    body = await r.text();
  } catch {}
  const req = r.request();
  seen.push({
    path: u.pathname,
    reqCT: req.headers()['content-type'],
    resCT: r.headers()['content-type'],
    reqLen: (req.postData() || '').length,
    reqHead: (req.postData() || '')
      .replace(/[A-Za-z0-9_-]{25,}/g, '<tok>')
      .slice(0, 160),
    resLen: body.length,
    resHead: body.slice(0, 120).replace(/[A-Za-z0-9_-]{25,}/g, '<tok>'),
    hasTitle: body.includes('CALSDK'),
    hasEventId: body.includes('fx0ba838f1de372227d532f32a'),
    initiator: req.frame()?.url().slice(0, 40),
  });
});
for (let i = 0; i < 30; i++) {
  await p.getByRole('button', { name: /^Next week/ }).click();
  await p.waitForTimeout(250);
}
await p.waitForTimeout(3000);
for (let i = 0; i < 30; i++) {
  await p.getByRole('button', { name: /^Previous week/ }).click();
  await p.waitForTimeout(150);
}
await p.waitForTimeout(2000);
await p
  .getByRole('button', { name: /^Next month/ })
  .first()
  .click()
  .catch(() => {});
await p.waitForTimeout(2000);
console.log(JSON.stringify(seen, null, 1));
await p.goto('https://calendar.google.com/calendar/u/0/r/week/2026/9/30');
await b.close();
