// EXPERIMENTAL — idempotent fixture seeder for the signed-in TEST account (account 0).
// Creates [CALSDK] fixtures via the eventedit URL template, but only those whose expected
// number of chips is not already found by a search (so re-running never duplicates).
// Usage: node seed.mjs --check            report missing fixtures, change nothing
//        node seed.mjs [guestEmail]       create the missing ones (guest fixtures need guestEmail)
// Not created here (need manual/other-account steps, see docs): shared calendar `CALSDK Shared`,
// Tasks, the Birthday contact, invite RSVP states, modified recurring instances.
import { chromium } from 'playwright-core';
const check = process.argv.includes('--check');
const guest = process.argv.slice(2).find((a) => !a.startsWith('--'));
const F = (text, dates, extra = '', expectChips = 1) => ({
  text,
  expectChips,
  url: `https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(
    text,
  )}&dates=${dates}${extra}&hl=en`,
});
const rec = (rule) => '&recur=' + encodeURIComponent(rule);
const fixtures = [
  F('[CALSDK] Timed A', '20260930T100000/20260930T110000'),
  F('[CALSDK] AllDay', '20260930/20261001'),
  F('[CALSDK] MultiDay', '20261001/20261004', '', 3),
  F(
    '[CALSDK] Daily recurring',
    '20260929T130000/20260929T140000',
    rec('RRULE:FREQ=DAILY;COUNT=5'),
    5,
  ),
  F(
    '[CALSDK] Weekly recurring',
    '20260930T140000/20260930T150000',
    rec('RRULE:FREQ=WEEKLY;COUNT=4'),
    4,
  ),
  F(
    '[CALSDK] AllDay weekly',
    '20260930/20261001',
    rec('RRULE:FREQ=WEEKLY;COUNT=3'),
    3,
  ),
  F(
    '[CALSDK] Dup',
    '20260930T160000/20260930T170000',
    '',
    3 /* 2 primary + 1 on CALSDK Shared */,
  ),
  F('[CALSDK] MonthDrag', '20261020T100000/20261020T110000'),
  F('[CALSDK] TZCross', '20261002T010000/20261002T020000'),
  ...(guest
    ? [
        F(
          '[CALSDK] With guest',
          '20260930T180000/20260930T190000',
          '&add=' + encodeURIComponent(guest),
        ),
      ]
    : []),
];
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });
const clearOverlays = async () => {
  for (const name of ['Dismiss', 'Got it', 'No']) {
    const btn = p
      .locator('[role=dialog] button', {
        hasText: new RegExp('^' + name + '$'),
      })
      .first();
    if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => {});
  }
};
const countChips = async (title) => {
  await p.goto(
    `https://calendar.google.com/calendar/u/0/r/search?q=${encodeURIComponent(
      title,
    )}&hl=en`,
    { waitUntil: 'load' },
  );
  await p.waitForTimeout(3000);
  await clearOverlays();
  // exact title on one line of the chip text (a substring match would confuse
  // `AllDay` with `AllDay weekly`); multi-day chips read `<title> (Day 1/3)`
  return p.evaluate(
    (t) =>
      [...document.querySelectorAll('[data-eventchip]')].filter((c) =>
        c.innerText
          .split('\n')
          .some((l) => l.trim() === t || l.trim().startsWith(t + ' (Day ')),
      ).length,
    title,
  );
};
const seen = new Set();
for (const f of fixtures) {
  if (seen.has(f.text)) continue;
  seen.add(f.text);
  const have = await countChips(f.text);
  if (have >= f.expectChips) {
    console.log(`ok       ${f.text} (${have}/${f.expectChips})`);
    continue;
  }
  console.log(`MISSING  ${f.text} (${have}/${f.expectChips})`);
  if (check) continue;
  const copies = f.text === '[CALSDK] Dup' ? 2 - Math.min(have, 2) : 1; // Dup: create only the primary-calendar pair
  for (let i = 0; i < copies; i++) {
    await p.goto(f.url, { waitUntil: 'load' });
    await p.waitForSelector('[jsname=x8hlje]', { timeout: 15000 });
    await p.waitForTimeout(800);
    await clearOverlays();
    await p.click('[jsname=x8hlje]');
    await p.waitForTimeout(1200);
    // guests → "Would you like to send invitation emails…?" (we choose Don't send)
    await p
      .getByRole('button', { name: "Don't send" })
      .click({ timeout: 2500 })
      .catch(() => {});
    await p.waitForTimeout(2000);
    console.log('created  ', f.text);
  }
}
await p.close();
await b.close();
