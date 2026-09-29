import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const feat = () => {
  const d = document.querySelector('[role=dialog][data-chips-dialog]');
  if (!d) return null;
  const chips = [...document.querySelectorAll('[data-eventchip]')]
    .filter((c) => !d.contains(c))
    .map((c) => c.dataset.eventid);
  const ids = [...d.querySelectorAll('[data-eventid]')].map(
    (e) => e.dataset.eventid,
  );
  return {
    allowWheel: d.getAttribute('data-allow-wheel-scroll'),
    backToCancel: d.getAttribute('data-back-to-cancel'),
    textInputs: d.querySelectorAll(
      'input[type=text],input:not([type]),textarea',
    ).length,
    anyInput: d.querySelectorAll('input,textarea').length,
    matchesChip: ids.some((i) => chips.includes(i)),
    chipWithDraftId: ids.length
      ? chips.filter((c) => ids.includes(c)).length
      : 0,
    draftChipAttrs: (() => {
      const c = [...document.querySelectorAll('[data-eventchip]')].find(
        (c) => !d.contains(c) && ids.includes(c.dataset.eventid),
      );
      return c ? [...c.attributes].map((a) => a.name).join(',') : null;
    })(),
    nonChipIdEl: [...d.querySelectorAll('[data-eventid]')].filter(
      (e) => !e.hasAttribute('data-eventchip'),
    ).length,
    chipInsideIds: [...d.querySelectorAll('[data-eventchip]')].length,
  };
};
async function open(url) {
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
async function sc(p, label, act) {
  await act();
  await p.waitForTimeout(1500);
  console.log(label.padEnd(30), JSON.stringify(await p.evaluate(feat)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
}
const chip = (p, t) => async () => {
  const l = p.locator('[data-eventchip]').filter({ hasText: t }).first();
  await l.waitFor({ timeout: 8000 });
  await l.click();
};
let p = await open(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
);
await sc(p, 'popover event', chip(p, 'Timed A'));
await sc(p, 'popover task', chip(p, 'Task A'));
await sc(p, 'quick-create event', async () => {
  await p
    .getByRole('button', { name: /^Create/ })
    .first()
    .click();
  await p
    .getByRole('menuitem', { name: /^Event/ })
    .first()
    .click();
});
await sc(p, 'quick-create task', async () => {
  await p
    .getByRole('button', { name: /^Create/ })
    .first()
    .click();
  await p.getByRole('menuitem', { name: /^Task/ }).first().click();
});
// grid slot: use keyboard shortcut 'c' (create event) as alternative to click
await sc(p, 'quick-create: key c', async () => {
  await p.keyboard.press('c');
});
await p.close();
p = await open(
  'https://calendar.google.com/calendar/u/0/r/month/2026/9/30?hl=en',
);
console.log(
  'month chips',
  await p.evaluate(() =>
    [...document.querySelectorAll('[data-eventchip]')]
      .map((c) => c.innerText.replace(/\n/g, '|').slice(0, 25))
      .slice(0, 6),
  ),
);
await sc(p, 'month popover', async () => {
  const l = p
    .locator('[data-eventchip]')
    .filter({ hasText: /Timed|Dup/ })
    .first();
  await l.waitFor({ timeout: 8000 });
  await l.click();
});
await p.close();
p = await open(
  'https://calendar.google.com/calendar/u/0/r/agenda/2026/9/30?hl=en',
);
await sc(p, 'agenda popover', chip(p, 'Timed A'));
await p.close();
p = await open(
  'https://calendar.google.com/calendar/u/1/r/week/2026/9/30?hl=en',
);
await sc(p, 'invitee shared read-only', chip(p, 'SharedCal'));
await sc(p, 'invitee invited', chip(p, 'With guest'));
await p.close();
await b.close();
