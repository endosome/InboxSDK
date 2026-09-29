import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
async function page(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  for (const n of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: n })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
const WEEK = 'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en';
const snap = (p) =>
  p.evaluate(() => {
    const o = {};
    for (const c of document.querySelectorAll('[data-eventchip]')) {
      const id = c.dataset.eventid
        .replace(/^(ttb_|bday_)/, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const d = atob(id + '='.repeat((4 - (id.length % 4)) % 4)).split(' ')[0];
      const t = c.innerText.split('\n')[0].slice(0, 26);
      o[d] = {
        label: t.replace(/\[CALSDK\].*/, '').trim() || t,
        dk: c.closest('[data-datekey]')?.dataset.datekey || null,
      };
    }
    return o;
  });
const compat = () => {
  try {
    return execFileSync(
      'node',
      ['/home/mix/InboxSDK/tools/calendar-probe/compat.mjs'],
      {
        encoding: 'utf8',
        cwd: '/home/mix/InboxSDK/tools/calendar-probe',
        timeout: 120000,
      },
    )
      .trim()
      .split('\n')
      .filter((l) => /^(FAIL|WARN)|pass,/.test(l))
      .join(' ; ');
  } catch (e) {
    return (
      'exit ' +
      e.status +
      ' ' +
      (e.stdout || '')
        .split('\n')
        .filter((l) => /^(FAIL|WARN)|pass,/.test(l))
        .join(' ; ')
    );
  }
};
async function setPrimary(query, pick) {
  const p = await page(
    'https://calendar.google.com/calendar/u/0/r/settings?hl=en',
  );
  const inp = p.locator('input[aria-label="Primary time zone"]');
  await inp.click({ force: true });
  await inp.fill(query);
  await p.waitForTimeout(800);
  await p
    .locator('[role=option]')
    .filter({ hasText: pick })
    .first()
    .click({ force: true });
  await p.waitForTimeout(2500);
  console.log(
    'primary now:',
    await p.locator('input[aria-label="Primary time zone"]').inputValue(),
  );
  await p.close();
}
// 1. TZCross fixture (Warsaw): Oct 2 01:00-02:00
let p = await page(
  'https://calendar.google.com/calendar/u/0/r/month/2026/10/2?hl=en',
);
if (
  !(await p.locator('[data-eventchip]').filter({ hasText: 'TZCross' }).count())
) {
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/eventedit?text=%5BCALSDK%5D+TZCross&dates=20261002T010000/20261002T020000&hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3500);
  for (const g of await p.getByRole('button', { name: 'Got it' }).all())
    await g.click().catch(() => {});
  await p.click('[jsname=x8hlje]');
  await p.waitForTimeout(2500);
  console.log('created TZCross');
}
await p.close();
p = await page(WEEK);
const a = await snap(p);
await p.close();
await setPrimary('Pacific Grove', 'Pacific Grove');
p = await page(WEEK);
const c = await snap(p);
const html = await p.evaluate(() =>
  [...document.documentElement.attributes]
    .map((a) => a.name + '=' + a.value.slice(0, 12))
    .join(' '),
);
console.log('html attrs (LA):', html);
const same = Object.keys(a).filter((k) => k in c).length;
console.log(
  'ids Warsaw:',
  Object.keys(a).length,
  'LA:',
  Object.keys(c).length,
  'common:',
  same,
  'only-W:',
  Object.keys(a).filter((k) => !(k in c)),
  'only-LA:',
  Object.keys(c).filter((k) => !(k in a)),
);
for (const k of [
  'fx3e8fc6b453a4e8c719971e8a_20260930T110000Z',
  'fx0ba838f1de372227d532f32a',
])
  console.log(
    k.slice(0, 8),
    'Warsaw',
    JSON.stringify(a[k]),
    'LA',
    JSON.stringify(c[k]),
  );
const tzc = Object.entries(c).find(
  ([k, v]) => /TZCross/.test(v.label) || (true && false),
);
await p.close();
p = await page(
  'https://calendar.google.com/calendar/u/0/r/month/2026/10/2?hl=en',
);
console.log(
  'TZCross in LA (month):',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((x) => /TZCross/.test(x.innerText))
        .map(
          (x) =>
            x.innerText.replace(/\n/g, '|').slice(0, 50) +
            ' @' +
            (x.getBoundingClientRect().x | 0) +
            ',' +
            (x.getBoundingClientRect().y | 0),
        ),
    ),
  ),
);
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/27?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3000);
await p.close();
console.log('compat (LA):', compat());
await setPrimary('Warsaw', 'Warsaw');
console.log('compat (restored):', compat());
await b.close();
