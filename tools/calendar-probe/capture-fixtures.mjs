// Captures SANITISED snapshots of real Calendar pages into __tests__/calendar-fixtures/ so that unit tests can
// run the SDK's selectors, identity, popover/editor/toolbar logic against real markup — the live runner is then
// only needed to REFRESH them when Google changes something.
//
//   node capture-fixtures.mjs            (Chrome on :9222, signed in to the TEST account; read-only)
//
// Sanitising (in the page, on a clone): all text becomes `x`/`0` of the same length; attribute values that can hold
// user data are replaced (aria-label unless it is a known UI string, title, placeholder, value, href, src, jslog
// calendar ids, emails); `data-eventid` tokens are re-encoded from synthetic ids (`evtN`, `owner@<same suffix>`,
// instance suffix kept in shape); scripts, styles, svg internals and comments are dropped. Structure, tag names, `class`,
// `jsname`, `jscontroller`, `jsaction`, `role`, `data-*` and ids are kept — that is what the selectors depend on.
// Review the output (`git diff`) before committing; never commit a capture of a real user's account.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../__tests__/calendar-fixtures');
fs.mkdirSync(outDir, { recursive: true });

/** UI strings our selectors (fallback rungs) and tests rely on; everything else in aria-label is masked. */
const KEEP_LABELS = [
  'Title',
  'Search',
  'Edit event',
  'Delete event',
  'Save',
  'Cancel event creation',
  'All day',
  'Settings menu',
  'Support',
  'Main drawer',
];

/** data-* attributes whose values are structural (selectors/tests depend on them); all others are masked. */
const KEEP_DATA = [
  'data-eventchip',
  'data-datekey',
  'data-chips-dialog',
  'data-allow-wheel-scroll',
  'data-viewkey',
  'data-viewfamily',
  'data-ui-kind',
  'data-period-type',
  'data-dragsource-type',
  'data-keyboardactiontype',
  'data-idom-class',
  'data-use-native-focus-logic',
];

function sanitizeInPage({ keepLabels, keepData }) {
  const mask = (s) => s.replace(/[A-Za-zÀ-￿]/g, 'x').replace(/\d/g, '0');
  const idMap = new Map();
  const fakeBase = (base) => {
    if (!idMap.has(base)) idMap.set(base, `evt${idMap.size + 1}`);
    return idMap.get(base);
  };
  const synthetic = (raw) => {
    const m = raw.match(/^(ttb_|bday_)?(.+)$/);
    const prefix = m[1] ?? '';
    let decoded;
    try {
      const t = m[2].replace(/-/g, '+').replace(/_/g, '/');
      decoded = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    } catch {
      return 'x'.repeat(raw.length);
    }
    const sp = decoded.lastIndexOf(' ');
    if (sp < 0) return 'x'.repeat(raw.length);
    let idPart = decoded.slice(0, sp);
    const hint = decoded.slice(sp + 1);
    const inst = idPart.match(/_(\d{8}(?:T\d{6}Z)?)$/);
    const base = inst ? idPart.slice(0, -inst[0].length) : idPart;
    const suffix = hint.includes('@')
      ? hint.slice(hint.lastIndexOf('@'))
      : '@m';
    const fake =
      fakeBase(base) +
      (inst ? `_${inst[1].length > 8 ? '20260101T000000Z' : '20260101'}` : '') +
      ' owner' +
      suffix;
    return (
      prefix +
      btoa(fake).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    );
  };
  const clean = (el) => {
    const out = el.cloneNode(true);
    // pristine Calendar only: drop whatever SDK apps injected into the tab
    out.querySelectorAll('[data-calsdk-owned]').forEach((n) => n.remove());
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.COMMENT_NODE) child.remove();
        else if (child.nodeType === Node.TEXT_NODE)
          child.textContent = mask(child.textContent);
        else if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (
            ['script', 'style', 'noscript', 'iframe', 'link', 'meta'].includes(
              tag,
            )
          ) {
            child.remove();
            continue;
          }
          if (tag === 'svg') {
            child.replaceChildren();
            for (const a of [...child.attributes])
              if (!['class', 'role', 'aria-hidden'].includes(a.name))
                child.removeAttribute(a.name);
            continue;
          }
          for (const a of [...child.attributes]) {
            const n = a.name;
            let v = a.value;
            if (
              n === 'style' ||
              n === 'href' ||
              n === 'src' ||
              n === 'srcset' ||
              n === 'nonce' ||
              n.startsWith('on')
            ) {
              child.removeAttribute(n);
            } else if (n === 'data-eventid') {
              child.setAttribute(n, synthetic(v));
            } else if (n === 'jslog') {
              // calendar ids/emails and event ids: the same synthetic ids as data-eventid, so chip and jslog agree
              child.setAttribute(
                n,
                v
                  .replace(/"[^"]*@[^"]*"/g, '"cal@example.com"')
                  .replace(
                    /"([A-Za-z0-9_-]{16,})"/g,
                    (_, id) => `"${fakeBase(id)}"`,
                  ),
              );
            } else if (
              n.startsWith('data-') &&
              !keepData.includes(n) &&
              !/^data-(idom|use|allow|is|ui|view|period|dragsource|keyboard)/.test(
                n,
              )
            ) {
              child.setAttribute(n, mask(v)); // data-text, data-tooltip*, … can carry user text
            } else if (n === 'aria-label') {
              child.setAttribute(n, keepLabels.includes(v) ? v : mask(v));
            } else if (
              [
                'title',
                'placeholder',
                'value',
                'alt',
                'aria-description',
                'data-tooltip',
                'aria-valuetext',
              ].includes(n)
            ) {
              child.setAttribute(n, mask(v));
            } else if (
              /@/.test(v) ||
              /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/.test(v)
            ) {
              child.setAttribute(n, mask(v));
            }
          }
          walk(child);
        }
      }
    };
    walk(out);
    return out;
  };
  const root = clean(document.body);
  const body = {};
  for (const a of document.body.attributes)
    if (a.name.startsWith('data-view')) body[a.name] = a.value;
  const html = {
    lang: document.documentElement.lang,
    'data-ui-kind': document.documentElement.getAttribute('data-ui-kind'),
  };
  // the account's own user info: keep the structure, fake the values
  const info = root.querySelector('#xUserInfo');
  if (info) {
    const fake = {
      xUserEmail: 'owner@example.com',
      xUserName: 'Test User',
      xTimezone: 'Europe/Warsaw',
      xGmtOffset: '7200000',
      xUserLocale: 'en',
    };
    for (const [id, val] of Object.entries(fake)) {
      const el = info.querySelector('#' + id);
      if (el) el.textContent = val;
    }
  }
  return { body, html, markup: root.innerHTML, path: location.pathname };
}

const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });

async function go(url) {
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${url}?hl=en`, {
    waitUntil: 'load',
  });
  await p
    .locator('[role=dialog] button', { hasText: /^(No|Dismiss)$/ })
    .first()
    .click({ timeout: 2000 })
    .catch(() => {});
  for (
    let i = 0;
    i < 40 &&
    !(await p.locator('[role=main] [data-eventchip][data-eventid]').count());
    i++
  )
    await p.waitForTimeout(250);
  await p.waitForTimeout(2500);
}
const chip = (text) =>
  p.locator('[role=main] [data-eventchip]').filter({ hasText: text }).first();
const manifest = {
  capturedAt: new Date().toISOString().slice(0, 10),
  fixtures: {},
};
async function save(name, description) {
  const snap = await p.evaluate(sanitizeInPage, {
    keepLabels: KEEP_LABELS,
    keepData: KEEP_DATA,
  });
  const file = `${name}.html`;
  fs.writeFileSync(path.join(outDir, file), snap.markup);
  manifest.fixtures[name] = {
    description,
    body: snap.body,
    html: snap.html,
    path: snap.path
      .replace(/\/u\/\d+/, '/u/0')
      .replace(/\/(eventedit)\/[^/]+/, '/$1/TOKEN'),
  };
  console.log(name.padEnd(22), (snap.markup.length / 1024).toFixed(0) + ' KB');
}

await go('week/2026/9/30');
await save(
  'week',
  'week view with events, a task, all-day and recurring chips',
);
await chip('Timed A').click();
await p.waitForTimeout(1400);
await save('week-popover-event', 'event popover open over the week view');
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
await chip('Task A').click();
await p.waitForTimeout(1400);
await save('week-popover-task', 'task popover');
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
// quick-create: Create → Event
await p
  .getByRole('button', { name: /^Create/ })
  .first()
  .click();
await p
  .getByRole('menuitem', { name: /^Event/ })
  .first()
  .click()
  .catch(() => {});
await p.waitForTimeout(1600);
await save(
  'week-quick-create',
  'quick-create dialog (has inputs; must NOT be treated as an event popover)',
);
await p.keyboard.press('Escape');
await p.waitForTimeout(700);
await go('month/2026/9/30');
await save('month', 'month view');
await chip('birthday')
  .click()
  .catch(() => {});
await p.waitForTimeout(1400);
await save('month-popover-birthday', 'birthday popover (no Edit button)');
await go('agenda/2026/9/30');
await save(
  'agenda',
  'schedule (agenda) view: static rows instead of absolutely positioned chips',
);
await go('week/2026/9/30');
await chip('Timed A').click();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Edit event' }).first().click();
await p.locator('input#xTiIn').first().waitFor({ timeout: 10000 });
await p.waitForTimeout(1500);
await save('editor', 'full-page editor of an existing event');
await p
  .locator('#xCancelBu')
  .click()
  .catch(() => {});
await p.close();
await b.close();

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log('written to', path.relative(process.cwd(), outDir));
