// EXPERIMENTAL — the SDK in other UI languages (incl. RTL and CJK), via `?hl=<code>`, in real Chrome over
// CDP (examples calendar-badges, calendar-popover-button, calendar-editor, calendar-compat loaded together).
// Per locale: the UI really is in that language (html[lang], dir), routes classify, every chip has one
// badge, a popover gets one button with the right ref, the editor opens by direct URL and its title
// field is found (`#xTiIn`, locale independent), and the compat report has no hard issue. Locale-dependent
// selector rungs that were needed (fallbacks) are listed. Read-only; run `yarn gulp` first.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = (n) => path.resolve(here, '../../../examples', n);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const bs = await b.newBrowserCDPSession();
for (const n of [
  'calendar-badges',
  'calendar-popover-button',
  'calendar-editor',
  'calendar-compat',
])
  await bs.send('Extensions.loadUnpacked', { path: ext(n) });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });
const info = (name, detail = '') => rows.push({ level: 'INFO', name, detail });

const LOCALES = ['de', 'ja', 'zh-CN', 'ar', 'he', 'pl'];
const decodeId = (t) => {
  const x = t
    .replace(/^(ttb_|bday_)/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0];
};

async function open(url) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  p.logs = [];
  p.on('console', (m) => {
    if (m.text().startsWith('CalendarSDK')) p.logs.push(m.text());
  });
  await p.goto(url, { waitUntil: 'load' });
  // consent / prompt buttons are localized: close whatever role=dialog blocks the page with Escape
  await p.waitForTimeout(3500);
  await p.keyboard.press('Escape').catch(() => {});
  return p;
}

for (const hl of LOCALES) {
  const tag = `[${hl}]`;
  let p;
  try {
    p = await open(
      `https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=${hl}`,
    );
    for (
      let i = 0;
      i < 30 && !(await p.locator('[role=main] [data-eventchip]').count());
      i++
    )
      await p.waitForTimeout(250);
    await p.waitForTimeout(2000);
    const ui = await p.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: getComputedStyle(document.body).direction,
      viewKey: document.body.getAttribute('data-viewkey'),
      chips: document.querySelectorAll('[role=main] [data-eventchip]').length,
    }));
    info(`${tag} page`, JSON.stringify(ui));
    pass(
      ui.lang.toLowerCase().startsWith(hl.split('-')[0]),
      `${tag} UI is really in this language`,
      JSON.stringify(ui),
    );
    pass(ui.viewKey === 'WEEK', `${tag} route classified as WEEK`, ui.viewKey);

    const badges = await p.evaluate(() => {
      const chips = [
        ...document.querySelectorAll('[role=main] [data-eventchip]'),
      ].filter(
        (c) =>
          c.hasAttribute('jsaction') &&
          c.hasAttribute('data-keyboardactiontype') &&
          c.getAttribute('data-eventid'),
      );
      return {
        chips: chips.length,
        one: chips.filter(
          (c) => c.querySelectorAll('[data-calsdk-badge]').length === 1,
        ).length,
      };
    });
    pass(
      badges.chips > 0 && badges.one === badges.chips,
      `${tag} one badge per chip`,
      JSON.stringify(badges),
    );

    // popover button + right ref
    const chip = p
      .locator('[role=main] [data-eventchip]')
      .filter({ hasText: 'Timed A' })
      .first();
    const raw = await chip.getAttribute('data-eventid');
    const before = p.logs.length;
    await chip.click();
    await p.waitForTimeout(1500);
    const n = await p
      .locator('[role=dialog][data-chips-dialog] [data-calsdk-popover-button]')
      .count();
    const openLog = p.logs
      .slice(before)
      .find((l) => l.startsWith('CalendarSDK popover open'));
    pass(
      n === 1 && !!openLog && openLog.includes(` ${decodeId(raw)} `),
      `${tag} popover: one button, right event`,
      `${n} ${openLog}`,
    );
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);

    // compat: which locale-dependent rungs were needed?
    await p.evaluate(() =>
      document.dispatchEvent(new Event('calsdk-compat-report')),
    );
    await p.waitForTimeout(500);
    const line = p.logs.find((l) => l.startsWith('CalendarSDK compat report'));
    const r =
      line && JSON.parse(line.slice('CalendarSDK compat report '.length));
    pass(
      !!r && r.issues.filter((i) => i.severity === 'hard').length === 0,
      `${tag} compat: no hard issues (grid)`,
      JSON.stringify(r?.issues),
    );
    if (r && r.issues.length)
      info(`${tag} compat issues (grid)`, JSON.stringify(r.issues));
    await p.close();

    // editor by direct URL
    p = await open(
      `https://calendar.google.com/calendar/u/0/r/eventedit/${raw}?hl=${hl}`,
    );
    await p
      .locator('input#xTiIn')
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});
    await p.waitForTimeout(800);
    const title = await p
      .locator('input#xTiIn')
      .first()
      .inputValue()
      .catch(() => null);
    pass(
      title !== null && /Timed A/.test(title),
      `${tag} editor: title field found by #xTiIn`,
      String(title),
    );
    pass(
      p.logs.some(
        (l) => l === `CalendarSDK editor open event ${decodeId(raw)} -`,
      ),
      `${tag} editor: view created with the right ref`,
      JSON.stringify(p.logs.filter((l) => l.includes('editor'))),
    );
    await p.evaluate(() =>
      document.dispatchEvent(new Event('calsdk-compat-report')),
    );
    await p.waitForTimeout(500);
    const l2 = p.logs.find((l) => l.startsWith('CalendarSDK compat report'));
    const r2 = l2 && JSON.parse(l2.slice('CalendarSDK compat report '.length));
    pass(
      !!r2 && r2.issues.filter((i) => i.severity === 'hard').length === 0,
      `${tag} compat: no hard issues (editor)`,
      JSON.stringify(r2?.issues),
    );
    if (r2 && r2.issues.length)
      info(`${tag} compat issues (editor)`, JSON.stringify(r2.issues));
    // leave without saving
    await p
      .locator('#xCancelBu')
      .click({ timeout: 3000 })
      .catch(() => {});
    await p.waitForTimeout(800);
    await p.close();
  } catch (e) {
    pass(false, `${tag} scenario`, String(e.message).split('\n')[0]);
    await p?.close().catch(() => {});
  }
}

console.log('Extension locales report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
