// EXPERIMENTAL — loads examples/calendar-editor (built SDK) in real Chrome over CDP and checks that the
// EventEditorView lives exactly as long as the EVENT_EDIT route: opened from a popover's Edit, by direct URL,
// for a new event (null ref), for a recurring instance and a guest event (with their confirm dialogs open),
// with back/forward, and that title typing / Save clicks are reported.
// Start Chrome with --enable-unsafe-extension-debugging (see extension-smoke.mjs); run `yarn gulp` first.
// Nothing is saved: every scenario ends in Cancel / Discard / "Back to editing" → Cancel. Fixtures stay unchanged.
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../examples/calendar-editor',
);
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
await (
  await b.newBrowserCDPSession()
).send('Extensions.loadUnpacked', { path: extPath });
const rows = [];
const check = (level, name, detail = '') => rows.push({ level, name, detail });
const pass = (ok, name, detail = '') =>
  check(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail);

const decodeId = (t) => {
  const x = t
    .replace(/^(ttb_|bday_)/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return atob(x + '='.repeat((4 - (x.length % 4)) % 4)).split(' ')[0];
};

async function openPage(view = 'week/2026/9/30') {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1300, height: 950 });
  p.logs = [];
  p.on('console', (m) => {
    if (m.text().startsWith('CalendarSDK editor')) p.logs.push(m.text());
  });
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${view}?hl=en`, {
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
  await p.waitForTimeout(800);
  return p;
}

const count = (p, re) => p.logs.filter((l) => re.test(l)).length;
const editorAlive = (p) => count(p, /editor open/) - count(p, /editor closed/);
const url = (p) => new URL(p.url()).pathname;
const inEditor = (p) => /\/r\/eventedit/.test(url(p));
const chip = (p, text, nth = 0) =>
  p.locator('[role=main] [data-eventchip]').filter({ hasText: text }).nth(nth);

async function waitEditor(p) {
  for (let i = 0; i < 40 && !p.locator('input#xTiIn').count(); i++)
    await p.waitForTimeout(250);
  await p.locator('input#xTiIn').first().waitFor({ timeout: 10000 });
  await p.waitForTimeout(600);
}

/** Leave the editor without saving: Cancel, then Discard if Calendar asks. */
async function cancelEditor(p) {
  await p.locator('#xCancelBu').first().click();
  await p.waitForTimeout(800);
  // "Discard unsaved changes?" is a role=alertdialog
  const discard = p.getByRole('button', { name: /^Discard$/ }).first();
  if (await discard.count()) await discard.click();
  for (let i = 0; i < 20 && inEditor(p); i++) await p.waitForTimeout(250);
  await p.waitForTimeout(800);
}

async function scenario(name, fn) {
  const p = await openPage();
  try {
    await fn(p);
  } catch (e) {
    check(
      'FAIL',
      `${name}: scenario threw`,
      String(e.message).split('\n')[0].slice(0, 160),
    );
    // recover: leave the editor if we are in one
    if (inEditor(p)) await cancelEditor(p).catch(() => {});
  }
  await p.close();
}

// 1. from a popover's Edit button
await scenario('popover Edit', async (p) => {
  await chip(p, 'Timed A').click();
  await p.waitForTimeout(1200);
  const raw = await p
    .locator('[role=dialog][data-chips-dialog] [data-eventid]')
    .first()
    .getAttribute('data-eventid');
  await p.getByRole('button', { name: 'Edit event' }).first().click();
  await waitEditor(p);
  const id = decodeId(raw);
  pass(
    p.logs.some((l) => l === `CalendarSDK editor open event ${id} -`),
    'popover Edit: editor opens with the right ref',
    JSON.stringify(p.logs),
  );
  pass(editorAlive(p) === 1, 'popover Edit: exactly one editor alive');
  pass(
    p.logs.includes('CalendarSDK editor ref derived calendar-known'),
    'popover Edit: the editor ref got its calendar id from the grid (derived)',
    JSON.stringify(p.logs),
  );
  // typing reports the title; nothing saved
  await p.locator('input#xTiIn').first().press('End');
  await p.keyboard.type('!');
  await p.waitForTimeout(300);
  pass(
    p.logs.some((l) => /editor title .*!$/.test(l)),
    'popover Edit: titleChange reported',
    JSON.stringify(p.logs.slice(-3)),
  );
  await cancelEditor(p);
  pass(
    !inEditor(p) && editorAlive(p) === 0,
    'popover Edit: Cancel → grid, editor closed',
    `${url(p)} ${JSON.stringify(p.logs)}`,
  );
});

// 2. direct URL, back/forward
await scenario('direct URL', async (p) => {
  const raw = await chip(p, 'Timed A').getAttribute('data-eventid');
  await p.goto(
    `https://calendar.google.com/calendar/u/0/r/eventedit/${raw}?hl=en`,
    { waitUntil: 'load' },
  );
  await waitEditor(p);
  // a page load re-runs the content script; the log list belongs to the page console, still attached
  pass(
    p.logs.some(
      (l) => l === `CalendarSDK editor open event ${decodeId(raw)} -`,
    ),
    'direct URL: editor opens with the right ref',
    JSON.stringify(p.logs),
  );
  pass(
    p.logs.includes('CalendarSDK editor ref exact calendar-null'),
    'direct URL: no grid chips were seen, so the calendar id stays null (never guessed)',
    JSON.stringify(p.logs),
  );
  await cancelEditor(p);
});

await scenario('back/forward', async (p) => {
  await chip(p, 'Timed A').click();
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Edit event' }).first().click();
  await waitEditor(p);
  const n = p.logs.length;
  await p.goBack();
  await p.waitForTimeout(1500);
  pass(
    !inEditor(p) && editorAlive(p) === 0,
    'back: leaves the editor, editor closed',
    `${url(p)} ${JSON.stringify(p.logs.slice(n))}`,
  );
  await p.goForward();
  await waitEditor(p);
  pass(
    editorAlive(p) === 1 && count(p, /editor open/) === 2,
    'forward: a fresh editor for the same event',
    JSON.stringify(p.logs),
  );
  await cancelEditor(p);
});

// 3. new event (URL template) → null ref
await scenario('new event', async (p) => {
  await p.goto(
    'https://calendar.google.com/calendar/u/0/r/eventedit?text=CALSDK-editor-probe&dates=20260930T160000/20260930T170000&hl=en',
    { waitUntil: 'load' },
  );
  await waitEditor(p);
  pass(
    p.logs.includes('CalendarSDK editor open new'),
    'new event: editor open with a null ref',
    JSON.stringify(p.logs),
  );
  const title = await p.locator('input#xTiIn').first().inputValue();
  pass(title === 'CALSDK-editor-probe', 'new event: title prefilled', title);
  await cancelEditor(p);
  pass(
    editorAlive(p) === 0 && !inEditor(p),
    'new event: Cancel → closed, nothing saved',
  );
});

// 4. recurring instance: Save → scope dialog opens over the editor; the editor survives it
await scenario('recurring scope dialog', async (p) => {
  await chip(p, 'Daily recurring').click();
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Edit event' }).first().click();
  await waitEditor(p);
  await p.locator('input#xTiIn').first().press('End');
  await p.keyboard.type('x');
  await p.locator('#xSaveBu').first().click();
  await p.waitForTimeout(1200);
  const dialog = p.locator('[role=dialog]', { hasText: /This event/ }).first();
  const dlgOpen = (await dialog.count()) > 0;
  check(dlgOpen ? 'PASS' : 'INFO', 'recurring: scope dialog appeared');
  pass(
    count(p, /saveClicked/) === 1,
    'recurring: saveClicked reported once',
    JSON.stringify(p.logs.slice(-3)),
  );
  pass(
    editorAlive(p) === 1 && inEditor(p),
    'recurring: the editor survives the scope dialog',
    JSON.stringify(p.logs),
  );
  // back out without saving: Cancel in the dialog, then Cancel the editor
  await dialog
    .getByRole('button', { name: /^Cancel$/ })
    .first()
    .click({ timeout: 3000 })
    .catch(() => p.keyboard.press('Escape'));
  await p.waitForTimeout(800);
  pass(
    editorAlive(p) === 1,
    'recurring: still one editor after dismissing the dialog',
    JSON.stringify(p.logs),
  );
  await cancelEditor(p);
});

// 5. guest event: Save → "send invitation emails?" → Back to editing
await scenario('guest confirm dialog', async (p) => {
  await chip(p, 'With guest').click();
  await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Edit event' }).first().click();
  await waitEditor(p);
  await p.locator('input#xTiIn').first().press('End');
  await p.keyboard.type('x');
  await p.locator('#xSaveBu').first().click();
  await p.waitForTimeout(1200);
  const back = p.getByRole('button', { name: /Back to editing/ }).first();
  const dlgOpen = (await back.count()) > 0;
  check(dlgOpen ? 'PASS' : 'INFO', 'guest: invitation dialog appeared');
  pass(
    editorAlive(p) === 1 && inEditor(p),
    'guest: the editor survives the invitation dialog',
    JSON.stringify(p.logs),
  );
  if (dlgOpen) await back.click();
  await p.waitForTimeout(600);
  pass(
    editorAlive(p) === 1 && inEditor(p),
    'guest: Back to editing keeps the same editor',
    JSON.stringify(p.logs),
  );
  await cancelEditor(p);
});

// 6. task / birthday: what does "open" do? (observational)
await scenario('task and birthday', async (p) => {
  for (const [label, text] of [
    ['task', 'Task A'],
    ['birthday', 'birthday'],
  ]) {
    const before = p.logs.length;
    await chip(p, text).click();
    await p.waitForTimeout(1200);
    const btn = p.getByRole('button', { name: /^Edit/ }).first();
    if (await btn.count()) {
      await btn.click();
      await p.waitForTimeout(2000);
      check(
        'INFO',
        `${label}: Edit goes to ${url(p)}`,
        JSON.stringify(p.logs.slice(before)),
      );
      if (inEditor(p)) await cancelEditor(p);
      else await p.keyboard.press('Escape');
    } else {
      check('INFO', `${label}: no Edit button in its popover`);
      await p.keyboard.press('Escape');
    }
    await p.waitForTimeout(600);
  }
});

console.log('Extension editor report');
for (const x of rows)
  console.log(
    `${x.level.padEnd(4)} ${x.name}${x.detail ? '  — ' + x.detail : ''}`,
  );
const fails = rows.filter((x) => x.level === 'FAIL').length;
console.log(`\n${rows.length - fails} ok, ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
