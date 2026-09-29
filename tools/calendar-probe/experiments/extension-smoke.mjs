// EXPERIMENTAL — drives examples/calendar-smoke (a real MV3 content script) on live Calendar and
// checks the isolated-world assumptions of docs/calendar-sdk-plan.md §12 Phase 2.
// Requires Chrome started with:
//   google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.calsdk-profile --enable-unsafe-extension-debugging
// (branded Chrome ignores --load-extension; the extension is loaded over CDP `Extensions.loadUnpacked`).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-smoke',
);
const rows = [];
const check = (level, name, detail = '') => rows.push({ level, name, detail });

const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const browserSession = await b.newBrowserCDPSession();
let extId = null;
try {
  extId = (
    await browserSession.send('Extensions.loadUnpacked', { path: extPath })
  ).id;
} catch (e) {
  console.log(
    'Extensions.loadUnpacked failed (start Chrome with --enable-unsafe-extension-debugging):',
    e.message.slice(0, 160),
  );
  process.exit(2);
}
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  { waitUntil: 'load' },
);
const read = async () =>
  JSON.parse(
    (await p.evaluate(() =>
      document.documentElement.getAttribute('data-calsdk-smoke'),
    )) ?? 'null',
  );
for (let i = 0; i < 40 && !(await read())?.firstChipMs; i++)
  await p.waitForTimeout(250);
await p
  .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
  .first()
  .click({ timeout: 800 })
  .catch(() => {});
let r = await read();
if (!r) {
  check(
    'FAIL',
    'content script ran and published results',
    'no data-calsdk-smoke attribute',
  );
} else {
  check(
    'PASS',
    'content script ran in a real MV3 extension',
    `extension ${extId}`,
  );
  check(
    r.world.chromeRuntime === 'function' ? 'PASS' : 'FAIL',
    'chrome.runtime available (isolated world)',
  );
  check(
    r.world.pageGlobalsVisible.length === 0 ? 'PASS' : 'WARN',
    'page-world globals not visible',
    r.world.pageGlobalsVisible.join(','),
  );
  check(
    r.world.navigationApi === 'object' ? 'PASS' : 'FAIL',
    'Navigation API present',
  );
  check(
    r.user.hasEmail && r.user.timezone && r.user.locale ? 'PASS' : 'FAIL',
    'user info readable (#xUserEmail/#xTimezone/#xUserLocale)',
    `tz=${r.user.timezone} locale=${r.user.locale}`,
  );
  check(
    r.route.viewkey === 'WEEK' && r.route.viewfamily === 'EVENT'
      ? 'PASS'
      : 'FAIL',
    'body[data-viewkey]/viewfamily readable',
    `${r.route.viewkey}/${r.route.viewfamily}`,
  );
  const tt = r.trustedTypes;
  // FINDING (2026-09-29): Trusted Types are NOT enforced for a real content script (they are for
  // CDP-created isolated worlds and for page/MAIN-world code). Report what happens; either outcome is INFO.
  check(
    'INFO',
    'innerHTML in a real content script (detached div)',
    tt.innerHTMLPlain.ok ? 'allowed' : 'THROWS: ' + tt.innerHTMLPlain.error,
  );
  check(
    'INFO',
    'insertAdjacentHTML in a real content script (detached div)',
    tt.insertAdjacentHTMLPlain.ok
      ? 'allowed'
      : 'THROWS: ' + tt.insertAdjacentHTMLPlain.error,
  );
  check(
    'INFO',
    'innerHTML on an element attached inside a chip',
    tt.innerHTMLOnChip?.ok
      ? 'allowed'
      : 'THROWS: ' + (tt.innerHTMLOnChip?.error ?? 'n/a'),
  );
  check(
    'INFO',
    'insertAdjacentHTML on document.body',
    tt.insertAdjacentHTMLOnBody?.ok
      ? 'allowed'
      : 'THROWS: ' + (tt.insertAdjacentHTMLOnBody?.error ?? 'n/a'),
  );
  check(
    tt.createPolicy.ok && tt.createPolicy.value ? 'PASS' : 'FAIL',
    'trustedTypes.createPolicy + innerHTML works',
    tt.createPolicy.error ?? '',
  );
  check(
    tt.styleElement.ok && tt.styleElement.value === 'rgb(1, 2, 3)'
      ? 'PASS'
      : 'FAIL',
    '<style> injection applies',
    JSON.stringify(tt.styleElement),
  );
  check(
    r.extensionImage?.loaded ? 'PASS' : 'FAIL',
    'extension-URL image loads under page CSP',
    JSON.stringify(r.extensionImage),
  );
  check(
    r.firstChipMs != null ? 'PASS' : 'FAIL',
    'chips observed via body MutationObserver',
    `first chip after ${r.firstChipMs} ms, ${r.chips} chips`,
  );
  check(
    r.markerLog.some((x) => x.startsWith('inserted')) ? 'PASS' : 'FAIL',
    'DOM-builder marker inserted into a chip',
  );

  // navigation events from a real content script
  const before = (await read()).navEvents.length;
  await p.getByRole('button', { name: /^Next week/ }).click();
  await p.waitForTimeout(1500);
  r = await read();
  const pushes = r.navEvents.slice(before).filter((e) => e[0] === 'push');
  check(
    pushes.length > 0 ? 'PASS' : 'FAIL',
    'Navigation API `navigate` events reach the content script',
    JSON.stringify(r.navEvents.slice(-2)),
  );
  // in-app view switch updates body[data-viewkey]
  await p.keyboard.press('m');
  await p.waitForTimeout(1500);
  r = await read();
  check(
    r.route.viewkey === 'MONTH' ? 'PASS' : 'FAIL',
    'body[data-viewkey] follows in-app navigation',
    `${r.route.viewkey} (html prefetch key stays ${r.route.htmlPrefetchKey})`,
  );
  check(
    r.bodyAttrChanges.some((c) => c[0] === 'data-viewkey' && c[1] === 'MONTH')
      ? 'PASS'
      : 'FAIL',
    'MutationObserver on body attributes fires for view changes',
  );
  await p.keyboard.press('w');
  await p.waitForTimeout(1500);
  // popover open strips the injected marker
  await p.evaluate(() => {
    document.querySelector('[data-calsdk-marker]')?.remove?.();
  });
  await b.close;
}
console.log('Extension smoke report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok/warn/info, ${fails} fail`);
await p.close();
await b.close();
process.exit(fails ? 1 : 0);
