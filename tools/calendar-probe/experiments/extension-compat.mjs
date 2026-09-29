// EXPERIMENTAL — loads examples/calendar-compat (built SDK) and checks that the IN-PAGE `sdk.Compat`
// (a) reports no hard issues on week / popover / editor, (b) gives the same structure fingerprints as
// the committed baseline (which the CDP runner wrote with the same shared code), (c) reports nothing
// user-owned, and (d) emits nothing by itself on a healthy page. Read-only; run `yarn gulp` first.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../../../examples/calendar-compat');
const baseline = JSON.parse(
  fs.readFileSync(path.join(here, '../baselines/structure.json'), 'utf8'),
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const pass = (ok, name, detail = '') =>
  rows.push({ level: ok ? 'PASS' : 'FAIL', name, detail: ok ? '' : detail });

const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const logs = [];
p.on('console', (m) => {
  if (m.text().startsWith('CalendarSDK compat')) logs.push(m.text());
});
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 2000 })
  .catch(() => {});
await p.waitForTimeout(5000); // load + the SDK's settle delay
pass(
  logs.includes('CalendarSDK compat ready'),
  'sdk loaded',
  JSON.stringify(logs),
);
pass(
  !logs.some((l) => l.includes('compat issue')),
  'healthy page: no compat issue emitted on its own',
  JSON.stringify(logs),
);

const report = async () => {
  const n = logs.length;
  await p.evaluate(() =>
    document.dispatchEvent(new Event('calsdk-compat-report')),
  );
  await p.waitForTimeout(400);
  const line = logs
    .slice(n)
    .find((l) => l.startsWith('CalendarSDK compat report'));
  return line
    ? JSON.parse(line.slice('CalendarSDK compat report '.length))
    : null;
};
const check = (name, r, scenario) => {
  pass(!!r, `${name}: got a report`);
  if (!r) return;
  const hard = r.issues.filter((i) => i.severity === 'hard');
  pass(hard.length === 0, `${name}: no hard issues`, JSON.stringify(hard));
  pass(
    r.issues.length === 0,
    `${name}: no issues at all`,
    JSON.stringify(r.issues),
  );
  const want = baseline.structures[scenario];
  pass(
    JSON.stringify(r.structure) === JSON.stringify(want),
    `${name}: structure fingerprints equal the baseline written by the CDP runner`,
    `${JSON.stringify(r.structure)} vs ${JSON.stringify(want)}`,
  );
  pass(
    !/CALSDK|@gmail|@m\b/.test(JSON.stringify(r)),
    `${name}: report has no event text, ids or emails`,
  );
};

check('week', await report(), 'week');

await p
  .locator('[role=main] [data-eventchip]')
  .filter({ hasText: 'Timed A' })
  .first()
  .click();
await p.waitForTimeout(1500);
check('popover', await report(), 'popover');

await p.getByRole('button', { name: 'Edit event' }).first().click();
await p.locator('input#xTiIn').first().waitFor({ timeout: 10000 });
await p.waitForTimeout(800);
check('editor', await report(), 'editor');
await p.locator('#xCancelBu').click();
await p.waitForTimeout(1500);
pass(
  !logs.some((l) => l.includes('compat issue')),
  'no issue emitted through the whole session',
  JSON.stringify(logs.filter((l) => l.includes('compat issue'))),
);
await p.close();

console.log('Extension compat report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
