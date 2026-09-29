import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = ctx.pages().find((x) => /calendar\.google\.com/.test(x.url()));
const setDensity = async (v) => {
  await p
    .locator(
      '[role=dialog] [role=combobox], [role=dialog] [aria-haspopup=listbox]',
    )
    .last()
    .click({ force: true });
  await p.waitForTimeout(400);
  await p.locator(`li[role=option][data-value=${v}]`).click({ force: true });
  await p.waitForTimeout(400);
};
const done = async () => {
  await p.keyboard.press('Escape').catch(() => {});
  await p.getByRole('button', { name: 'Done' }).click({ force: true });
  await p.waitForTimeout(1500);
};
const compat = () => {
  try {
    return execFileSync(
      'node',
      ['/home/mix/InboxSDK/tools/calendar-probe/compat.mjs'],
      {
        encoding: 'utf8',
        cwd: '/home/mix/InboxSDK/tools/calendar-probe',
        timeout: 90000,
      },
    )
      .trim()
      .split('\n')
      .slice(-1)[0];
  } catch (e) {
    return (
      'exit ' +
      e.status +
      ' ' +
      (e.stdout || '')
        .split('\n')
        .filter((l) => /^(FAIL|WARN)/.test(l))
        .join(' ; ')
    );
  }
};
const chipH = () =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    return c && Math.round(c.getBoundingClientRect().height);
  });
// dialog is open (from th3); set responsive
await p
  .locator(
    '[role=dialog] [role=combobox], [role=dialog] [aria-haspopup=listbox]',
  )
  .last()
  .evaluate(() => 0)
  .catch(() => {});
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await setDensity('responsive');
await done();
console.log('responsive: chipH', await chipH(), '| compat:', compat());
// restore: comfortable + device default
await p.getByRole('button', { name: /Settings menu/i }).click();
await p.getByRole('menuitem', { name: /^Appearance/i }).click();
await p.waitForTimeout(1000);
await setDensity('comfortable');
await p.locator('[role=dialog] input[value=device]').check({ force: true });
await done();
console.log('restored: chipH', await chipH(), '| compat:', compat());
await b.close();
