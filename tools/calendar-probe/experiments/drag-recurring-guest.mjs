import { chromium } from 'playwright-core';
const [, , title, nth = '0', mode = 'inspect'] = process.argv; // mode: inspect | choose:<label>
const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p.waitForTimeout(3500);
for (const x of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: x })
    .click({ timeout: 1000 })
    .catch(() => {});
const R = (s) =>
  s
    .replace(/owner@(gmail\.com|m)/g, '<A0>@m')
    .replace(/invitee@(gmail\.com|m)/g, '<A1>@m');
const snap = () =>
  p.evaluate(
    (t) =>
      [...document.querySelectorAll('[data-eventchip]')]
        .filter((c) => c.innerText.includes(t))
        .map((c) => {
          const x = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
          const r = c.getBoundingClientRect();
          return {
            id: atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0],
            label: c.innerText.split('\n')[0].slice(0, 22),
            y: Math.round(r.y),
            cid: (c.__c ??= Math.random().toString(36).slice(2, 6)),
          };
        }),
    title,
  );
await p.evaluate(() => {
  window.__ev = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type == 'attributes')
        window.__ev.push([
          'id',
          m.target.dataset.eventid?.slice(0, 6),
          m.oldValue?.slice(0, 6),
        ]);
    }
  }).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-eventid'],
    attributeOldValue: true,
  });
});
const before = await snap();
console.log('before', R(JSON.stringify(before)));
const loc = p.locator('[data-eventchip]').filter({ hasText: title }).nth(+nth);
const bb = await loc.boundingBox();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.mouse.down();
for (let i = 1; i <= 12; i++)
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + i * 8, {
    steps: 2,
  });
await p.mouse.up();
await p.waitForTimeout(1800);
const dl = async () =>
  p.evaluate(() =>
    [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(
      (d) => ({
        t: d.innerText.replace(/\n/g, '|').slice(0, 240),
        chips: !!d.getAttribute('data-chips-dialog'),
      }),
    ),
  );
console.log('dialogs after drop', R(JSON.stringify(await dl())));
if (mode.startsWith('choose:')) {
  const [scope, btn] = mode.slice(7).split('>');
  if (scope) await p.getByText(scope, { exact: true }).first().click();
  await p.getByRole('button', { name: btn, exact: true }).click();
  await p.waitForTimeout(2500);
  console.log('dialogs after choose', R(JSON.stringify(await dl())));
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3000);
  console.log('after (reloaded)', R(JSON.stringify(await snap())));
} else
  console.log(
    'id mutations',
    JSON.stringify(await p.evaluate(() => window.__ev)),
  );
await p.keyboard.press('Escape');
await b.close();
