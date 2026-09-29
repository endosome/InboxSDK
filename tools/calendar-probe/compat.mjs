// EXPERIMENTAL compat runner v0 — read-only. Prints a PASS/WARN/FAIL report and exits 1 on any FAIL.
// Requires fixtures from seed.mjs ([CALSDK] events) for the identity checks.
import { chromium } from 'playwright-core';
const results = [];
const rec = (level, name, detail = '') => {
  results.push({ level, name, detail });
};
const b = await chromium.connectOverCDP('http://localhost:9222');
const p =
  b
    .contexts()[0]
    .pages()
    .find((x) => x.url().includes('calendar.google.com')) ??
  (await b.contexts()[0].newPage());
const go = async (path) => {
  await p.goto('https://calendar.google.com/calendar/u/0/r/' + path, {
    waitUntil: 'load',
  });
  await p.waitForTimeout(2200);
  await clearOverlays();
};
// Known environment overlays that intercept clicks (notification prompt, Meet coach-mark,
// "Change time zone to …?" prompt when browser tz != calendar primary tz). Each dismissal is reported.
const cleared = [];
const clearOverlays = async () => {
  for (const name of ['Dismiss', 'Got it', 'No']) {
    const btn = p
      .locator('[role=dialog] button', {
        hasText: new RegExp('^' + name + '$'),
      })
      .first();
    if (await btn.count()) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      cleared.push(name);
      await p.waitForTimeout(400);
    }
  }
};
// data-eventid = [kindPrefix_]base64url("<id>[_<instance>] <calAbbrev>"); kindPrefix: none=event, ttb_=task, bday_=birthday [V]
const b64 = `(id)=>{try{const m=id.match(/^(ttb_|bday_)?(.*)$/);const t=m[2].replace(/-/g,'+').replace(/_/g,'/');return atob(t+'='.repeat((4-t.length%4)%4))}catch{return null}}`;

await go('week/2026/9/30');
const s = await p.evaluate((b64src) => {
  const dec = eval(b64src);
  const r = (sel) => document.querySelectorAll(sel).length;
  const chips = [...document.querySelectorAll('[data-eventchip]')];
  const ok = chips.filter((c) => {
    const d = dec(c.dataset.eventid || '');
    return d && /^[a-z0-9_]+(_\d{8}(T\d{6}Z)?)? \S+$/.test(d);
  });
  return {
    main: r('[role=main]'),
    viewKey: document.documentElement.dataset.prefetchViewKey,
    period: document.querySelector('[role=main]')?.dataset.periodType,
    chips: chips.length,
    decodable: ok.length,
    datekeys: r('[data-datekey]'),
    uiKind: document.documentElement.dataset.uiKind,
    xUser: !!document.getElementById('xUserInfo'),
    initialdata: !!document.getElementById('initialdata'),
    navApi: typeof navigation !== 'undefined',
    overlayHost: !!document.getElementById('yDmH0d'),
    overlayHostEmptyWhenIdle:
      document.getElementById('yDmH0d')?.children.length === 0,
    bodyViewKey: document.body.dataset.viewkey,
    bodyFamily: document.body.dataset.viewfamily,
    dragClasses: [
      ...new Set(
        chips.map((c) => c.getAttribute('data-dragsource-type') ?? '-'),
      ),
    ]
      .sort()
      .join(','),
    trustedTypesRequired: (() => {
      try {
        const d = document.createElement('div');
        d.innerHTML = '<i></i>';
        return false;
      } catch {
        return true;
      }
    })(),
    evChips: chips.filter((c) => !/^(ttb_|bday_)/.test(c.dataset.eventid))
      .length,
    jslogCal: chips.filter(
      (c) =>
        !/^(ttb_|bday_)/.test(c.dataset.eventid) &&
        /1:\["[^"]+@/.test(c.getAttribute('jslog') || ''),
    ).length,
  };
}, b64);
rec(s.main === 1 ? 'PASS' : 'FAIL', 'mainRegion', `count=${s.main}`);
rec(
  s.viewKey === 'WEEK' ? 'PASS' : 'FAIL',
  'route: WEEK via body[data-viewkey]',
  s.viewKey,
);
rec(s.period === 'week' ? 'PASS' : 'WARN', 'mainPeriodType', s.period);
rec(s.chips > 0 ? 'PASS' : 'FAIL', 'event detection', `${s.chips} chips`);
rec(
  s.chips > 0 && s.decodable === s.chips ? 'PASS' : 'FAIL',
  'event identity decode',
  `${s.decodable}/${s.chips}`,
);
rec(
  s.jslogCal === s.evChips ? 'PASS' : 'WARN',
  'calendarId via jslog',
  `${s.jslogCal}/${s.evChips} plain events (tasks/birthdays have no full id in jslog)`,
);
rec(s.datekeys > 0 ? 'PASS' : 'FAIL', 'dateCell (data-datekey)', s.datekeys);
rec(
  s.xUser && s.initialdata ? 'PASS' : 'FAIL',
  'user info in DOM',
  `xUserInfo=${s.xUser} initialdata=${s.initialdata}`,
);
rec(s.navApi ? 'PASS' : 'WARN', 'Navigation API present');
rec(s.overlayHost ? 'PASS' : 'FAIL', 'overlay host #yDmH0d present');
rec(
  s.overlayHostEmptyWhenIdle ? 'PASS' : 'WARN',
  '#yDmH0d empty when no dialog is open',
);
rec(
  s.bodyViewKey === 'WEEK' ? 'PASS' : 'FAIL',
  'body[data-viewkey] is the live route key (WEEK)',
  s.bodyViewKey,
);
rec(
  s.viewKey === 'WEEK' ? 'PASS' : 'WARN',
  'html[data-prefetch-view-key] at load (load-time only)',
  s.viewKey,
);
rec(
  s.bodyFamily === 'EVENT' ? 'PASS' : 'WARN',
  'body[data-viewfamily]',
  s.bodyFamily,
);
rec(
  ['2', '6', '2,6', '2,6,9', '2,9', '6,9', '9'].includes(s.dragClasses)
    ? 'PASS'
    : 'WARN',
  'data-dragsource-type classes (2 timed, 6 all-day, 9 read-only)',
  s.dragClasses,
);
rec(
  s.trustedTypesRequired ? 'INFO' : 'WARN',
  'Trusted Types enforced for innerHTML (SDK must use DOM builders / TT policy)',
  s.trustedTypesRequired ? 'yes' : 'NO — Calendar dropped the requirement?',
);
rec(
  s.uiKind === '10' ? 'PASS' : 'WARN',
  'variant fingerprint data-ui-kind',
  `seen=${s.uiKind} (expected 10)`,
);

for (const [path, key] of [
  ['day/2026/9/30', 'DAY'],
  ['month/2026/9/30', 'MONTH'],
  ['year/2026/9/30', 'YEAR'],
  ['agenda/2026/9/30', 'AGENDA'],
  ['search?q=CALSDK', 'SEARCH'],
]) {
  await go(path);
  const vk = await p.evaluate(() => document.body.dataset.viewkey);
  rec(vk === key ? 'PASS' : 'FAIL', `route: ${key} (body key, full load)`, vk);
}
// In-app navigation: only body[data-viewkey] follows; html[data-prefetch-view-key] is load-time only.
await go('week/2026/9/30');
for (const [k, expected] of [
  ['m', 'MONTH'],
  ['d', 'DAY'],
  ['y', 'YEAR'],
  ['a', 'AGENDA'],
  ['x', 'CUSTOM_DAYS'],
  ['w', 'WEEK'],
]) {
  await p.keyboard.press(k);
  await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({
    body: document.body.dataset.viewkey,
    html: document.documentElement.dataset.prefetchViewKey,
    path: location.pathname,
  }));
  rec(
    st.body === expected ? 'PASS' : 'FAIL',
    `route (in-app key ${k}): ${expected}`,
    `body=${st.body} html=${st.html}`,
  );
}
await go('week/2026/9/30');
await p.locator('[data-eventchip]', { hasText: 'Timed A' }).first().click();
await p.waitForTimeout(1200);
const pop = await p.evaluate(() => {
  const d = document.querySelector('[role=dialog][data-chips-dialog]');
  return (
    d && {
      hasId: !!d.querySelector('[data-eventid]'),
      inAppRoot: !!d.closest('#yDmH0d'),
      noInputs: !d.querySelector('input, textarea'),
      wheelFalse: d.getAttribute('data-allow-wheel-scroll') === 'false',
      edit: !!d.querySelector('button[jsname=DyVDA]'),
      editLabel: !!d.querySelector('button[aria-label="Edit event"]'),
      del: !!d.querySelector('button[jsname=VkLyEc]'),
    }
  );
});
rec(pop ? 'PASS' : 'FAIL', 'popover detected');
if (pop) {
  rec(pop.hasId ? 'PASS' : 'FAIL', 'popover identity');
  rec(pop.inAppRoot ? 'PASS' : 'FAIL', 'popover is inside #yDmH0d');
  rec(
    pop.noInputs ? 'PASS' : 'FAIL',
    'popover discriminator: no form controls',
  );
  rec(
    pop.wheelFalse ? 'PASS' : 'WARN',
    'popover discriminator: data-allow-wheel-scroll=false',
  );
  rec(pop.edit ? 'PASS' : 'WARN', 'popoverEditButton jsname rung');
  rec(
    pop.editLabel ? 'PASS' : 'WARN',
    'popoverEditButton aria-label rung (locale-dependent)',
  );
  rec(pop.del ? 'PASS' : 'WARN', 'popoverDeleteButton jsname rung');
}
await p.keyboard.press('Escape');
await p.waitForTimeout(1000);
if ((await p.locator('[role=dialog][data-chips-dialog]').count()) === 0) {
  await p.locator('[data-eventchip]', { hasText: 'Timed A' }).first().click();
  await p.waitForTimeout(1200);
}
await p
  .locator('[role=dialog] button[jsname=DyVDA]')
  .click({ timeout: 8000 })
  .catch(() => rec('FAIL', 'popoverEditButton clickable'));
await p.waitForTimeout(2200);
const ed = await p.evaluate(() => ({
  path: location.pathname,
  title: !!document.querySelector('input[aria-label=Title]'),
  save: !!document.querySelector('[jsname=x8hlje]'),
  cancel: !!document.querySelector('[jsname=gQ2Xie]'),
}));
rec(
  /\/r\/eventedit\/[A-Za-z0-9_-]+$/.test(ed.path) ? 'PASS' : 'FAIL',
  'route: EVENT_EDIT',
  ed.path.replace(/[A-Za-z0-9_-]{20,}$/, '<eid>'),
);
rec(ed.title ? 'PASS' : 'FAIL', 'editorTitle');
rec(ed.save ? 'PASS' : 'FAIL', 'editorSave jsname');
rec(ed.cancel ? 'PASS' : 'FAIL', 'editorCancel jsname');
await p
  .locator('[jsname=gQ2Xie]')
  .click()
  .catch(() => {});
await p.waitForTimeout(800);

console.log('Calendar compatibility report');
if (cleared.length)
  console.log(`INFO overlays dismissed: ${[...new Set(cleared)].join(', ')}`);
for (const r of results)
  console.log(
    `${r.level.padEnd(4)} ${r.name}${r.detail !== '' ? '  — ' + r.detail : ''}`,
  );
const f = results.filter((r) => r.level === 'FAIL').length,
  w = results.filter((r) => r.level === 'WARN').length,
  info = results.filter((r) => r.level === 'INFO').length;
console.log(
  `\n${results.length - f - w - info} pass, ${w} warn, ${f} fail, ${info} info`,
);
await b.close();
process.exit(f ? 1 : 0);
