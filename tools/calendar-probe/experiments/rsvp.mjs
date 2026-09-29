import { chromium } from 'playwright-core';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const R = (s) =>
  s
    .replace(/owner@(gmail\.com|m)/g, '<A0>@m')
    .replace(/invitee@(gmail\.com|m)/g, '<A1>@m');
const p = await ctx.newPage();
const dump = async (label) =>
  console.log(
    label,
    R(
      JSON.stringify(
        await p.evaluate(() =>
          [...document.querySelectorAll('[data-eventchip]')]
            .filter((c) => /Invite|With guest/.test(c.innerText))
            .map((c) => {
              const t = c.dataset.eventid.replace(/-/g, '+').replace(/_/g, '/');
              return {
                t: c.innerText.replace(/\n/g, '|').slice(0, 75),
                dec: atob(t + '='.repeat((4 - (t.length % 4)) % 4)),
                cls: c.className.slice(0, 30),
              };
            }),
        ),
      ),
    ),
  );
for (let i = 0; i < 8; i++) {
  await p.goto(
    'https://calendar.google.com/calendar/u/1/r/week/2026/9/30?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(2500);
  if (await p.locator('[data-eventchip]', { hasText: 'Invite No' }).count())
    break;
  await p.waitForTimeout(8000);
}
for (const n of ['Dismiss', 'Got it'])
  await p
    .getByRole('button', { name: n })
    .click({ timeout: 1500 })
    .catch(() => {});
await dump('before');
for (const [t, btn] of [
  ['Invite Maybe', 'Respond Maybe'],
  ['Invite No', 'Respond No'],
]) {
  await p.locator('[data-eventchip]', { hasText: t }).first().click();
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: new RegExp('^' + btn) }).click();
  await p.waitForTimeout(2500);
  const dlg = await p.evaluate(() =>
    [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(
      (d) => d.innerText.replace(/\n/g, '|').slice(0, 120),
    ),
  );
  console.log(t, 'after respond dialogs:', JSON.stringify(dlg));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
}
await dump('after');
await p.close();
await b.close();
