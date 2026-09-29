import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const R = (s) => s.replace(/owner@(gmail\.com|m)/g, '<A0>@m');
async function page(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  for (const x of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: x })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
const snap = (p, t) =>
  p.evaluate(
    (t) =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((c) =>
          t === 'AllDayOnly'
            ? /AllDay(?! weekly)/.test(c.innerText)
            : c.innerText.includes(t),
        )
        .map((c) => {
          const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
          const r = c.getBoundingClientRect();
          return {
            id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
            label: (
              c.innerText.split('\n')[0] +
              ' | ' +
              (c.innerText.match(/(September|October) \d+/) || [''])[0]
            ).slice(0, 50),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            cid: (c.__c ??= Math.random().toString(36).slice(2, 5)),
            dk: c.closest('[data-datekey]')?.dataset.datekey,
          };
        }),
    t,
  );
async function drag(p, t, dx, dy, label) {
  await p.evaluate(() => {
    window.__ev = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        if (m.type == 'attributes')
          window.__ev.push([
            'id',
            m.oldValue?.slice(0, 6),
            m.target.dataset.eventid?.slice(0, 6),
          ]);
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-eventid'],
      attributeOldValue: true,
    });
  });
  const before = await snap(p, t);
  console.log(label, 'before', R(JSON.stringify(before)));
  const bb = await p
    .locator('[data-eventchip]')
    .filter({ hasText: t === 'AllDayOnly' ? /AllDay(?! weekly)/ : t })
    .first()
    .boundingBox();
  const cx = bb.x + bb.width / 2,
    cy = bb.y + bb.height / 2;
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  let maxSame = 0;
  for (let i = 1; i <= 15; i++) {
    await p.mouse.move(cx + (dx * i) / 15, cy + (dy * i) / 15, { steps: 2 });
    await p.waitForTimeout(50);
    maxSame = Math.max(
      maxSame,
      await p.evaluate(
        (t) =>
          [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
            c.innerText.includes(t),
          ).length,
        t,
      ),
    );
  }
  await p.mouse.up();
  await p.waitForTimeout(2000);
  if (await p.getByText('This event', { exact: true }).count()) {
    console.log(label, 'scope dialog shown -> This event');
    await p.getByText('This event', { exact: true }).first().click();
    await p.getByRole('button', { name: 'OK', exact: true }).click();
    await p.waitForTimeout(2500);
  }
  console.log(
    label,
    'max chips w/ title during drag',
    maxSame,
    '| dialogs',
    JSON.stringify(
      await p.evaluate(() =>
        [...document.querySelectorAll('[role=dialog]')].map((d) =>
          d.innerText.replace(/\n/g, '|').slice(0, 80),
        ),
      ),
    ),
  );
  console.log(
    label,
    'after',
    R(JSON.stringify(await snap(p, t))),
    '| id mutations',
    JSON.stringify(await p.evaluate(() => window.__ev)),
  );
}

const dlg = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('[role=dialog]')].map((d) =>
      d.innerText.replace(/\n/g, '|').slice(0, 90),
    ),
  );
let p = await page(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
await drag(p, 'AllDayOnly', 0, 330, 'allday -> timed grid');
await p.close();
p = await page(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
console.log(
  'state',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter(
          (c) =>
            /CALSDK\] AllDay(?! weekly)|^\d.*AllDay(?! weekly)/.test(
              c.innerText,
            ) || /AllDay(?! weekly)/.test(c.innerText),
        )
        .map((c) => {
          const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
          const r = c.getBoundingClientRect();
          return {
            id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
            txt: c.innerText.replace(/\n/g, '|').slice(0, 50),
            x: Math.round(r.x),
            y: Math.round(r.y),
            h: Math.round(r.height),
            role: c.getAttribute('role'),
            ariaLabel: (c.getAttribute('aria-label') || '').slice(0, 40),
          };
        }),
    ),
  ),
);
await p.close();
await b.close();
