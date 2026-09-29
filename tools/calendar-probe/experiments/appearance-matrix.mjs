import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
async function open() {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3500);
  for (const n of ['Dismiss', 'Got it'])
    await p
      .getByRole('button', { name: n })
      .click({ timeout: 1000 })
      .catch(() => {});
  return p;
}
async function appearance(p, { theme, density }) {
  await p.getByRole('button', { name: /Settings menu/i }).click();
  await p.getByRole('menuitem', { name: /^Appearance/i }).click();
  await p.waitForTimeout(1000);
  if (theme)
    await p
      .locator(
        '[role=dialog] input[value=' +
          theme +
          '], [role=dialog] [role=radio][data-value=' +
          theme +
          ']',
      )
      .first()
      .check({ force: true })
      .catch(async () => {
        await p
          .getByText(
            theme === 'device'
              ? 'Device default'
              : theme[0].toUpperCase() + theme.slice(1),
            { exact: true },
          )
          .first()
          .click();
      });
  if (density) {
    await p
      .locator('[role=dialog]')
      .getByText(/Comfortable|Default|Compact/)
      .first()
      .click({ force: true });
    await p.waitForTimeout(500);
    console.log(
      'density options',
      JSON.stringify(
        await p.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[role=option],[role=listbox] li,[role=menuitem]',
            ),
          ]
            .map((o) => o.innerText.trim())
            .filter(Boolean)
            .slice(0, 6),
        ),
      ),
    );
    await p
      .getByRole('option', { name: density, exact: true })
      .first()
      .click({ force: true })
      .catch(() => console.log('option click failed'));
    await p.waitForTimeout(500);
  }
  await p.getByRole('button', { name: 'Done' }).click();
  await p.waitForTimeout(1500);
}
const metrics = (p) =>
  p.evaluate(() => {
    const c = [...document.querySelectorAll('[data-eventchip]')].find((x) =>
      /Timed A/.test(x.innerText),
    );
    const r = c?.getBoundingClientRect();
    const h = document.documentElement;
    return {
      htmlAttrs: [...h.attributes]
        .map((a) => a.name + '=' + String(a.value).slice(0, 14))
        .join(' '),
      chips: document.querySelectorAll('[data-eventchip]').length,
      chipAttrs: c ? [...c.attributes].map((a) => a.name).join(',') : null,
      chipH: r && Math.round(r.height),
      bg: c && getComputedStyle(c).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      scheme: matchMedia('(prefers-color-scheme: dark)').matches,
      dragsource: c?.getAttribute('data-dragsource-type'),
      dk: !!document.querySelector('[data-datekey]'),
      main: document.querySelector('[role=main]')?.dataset.periodType,
    };
  });
let p = await open();
console.log('baseline', JSON.stringify(await metrics(p)));
const runs = [
  { theme: 'dark' },
  { theme: 'light', density: 'Compact' },
  { density: 'Default' },
];
for (const r of runs) {
  await appearance(p, r);
  console.log('after', JSON.stringify(r), JSON.stringify(await metrics(p)));
  try {
    const out = execFileSync(
      'node',
      ['/home/mix/InboxSDK/tools/calendar-probe/compat.mjs'],
      {
        encoding: 'utf8',
        cwd: '/home/mix/InboxSDK/tools/calendar-probe',
        timeout: 90000,
      },
    );
    console.log('compat:', out.trim().split('\n').slice(-1)[0]);
  } catch (e) {
    console.log(
      'compat exit',
      e.status,
      (e.stdout || '')
        .split('\n')
        .filter((l) => /^(FAIL|WARN)/.test(l))
        .join(' ; '),
    );
  }
}
await p.close();
await b.close();
