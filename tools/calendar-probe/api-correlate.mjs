// EXPERIMENTAL — the one live check for Phase 4's API leg: does the Calendar API accept the ids we read
// from the page? For a few [CALSDK] fixture chips (decoded in the signed-in Chrome), asks
// `@calendarsdk/google-api` for the event and reports ONLY booleans and id shapes — never titles,
// emails or the token.
//
//   CALSDK_TEST_TOKEN=<short-lived read-only OAuth access token of the TEST account> \
//     node api-correlate.mjs
//
// The token is read from the environment and used only as a bearer header; it is never printed, logged or
// written. Scope needed: https://www.googleapis.com/auth/calendar.events.readonly. YOU run this; the
// assistant never handles the token. Read-only against Calendar.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.CALSDK_TEST_TOKEN;
if (!token) {
  console.error('Set CALSDK_TEST_TOKEN (see the header of this file).');
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const out = path.join(os.tmpdir(), 'calsdk-google-api.mjs');
execFileSync(
  path.join(repo, 'node_modules/.bin/esbuild'),
  [
    path.join(repo, 'packages/google-api/src/index.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    `--outfile=${out}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { createGoogleCalendarProvider, apiEventId } = await import(out);
const provider = createGoogleCalendarProvider({
  getAccessToken: async () => token,
});

// same decoding rules as src/.../identity.ts, kept tiny on purpose
const decode = (raw) => {
  const m = raw.match(/^(ttb_|bday_)?(.+)$/);
  const t = m[2].replace(/-/g, '+').replace(/_/g, '/');
  const [idPart, hint] = atob(t + '='.repeat((4 - (t.length % 4)) % 4)).split(
    ' ',
  );
  const inst = idPart.match(/_(\d{8}(?:T\d{6}Z)?)$/);
  return {
    kind: m[1] === 'ttb_' ? 'task' : m[1] === 'bday_' ? 'birthday' : 'event',
    eventId: inst ? idPart.slice(0, -inst[0].length) : idPart,
    ...(inst && { instanceId: inst[1] }),
    calendarIdHint: hint,
    rawId: raw,
  };
};

const b = await chromium.connectOverCDP('http://localhost:9222');
const p = await b.contexts()[0].newPage();
await p.setViewportSize({ width: 1300, height: 950 });
await p.goto(
  'https://calendar.google.com/calendar/u/0/r/week/2026/9/30?hl=en',
  {
    waitUntil: 'load',
  },
);
await p.waitForTimeout(4000);
const chips = await p.evaluate(() =>
  [
    ...document.querySelectorAll('[role=main] [data-eventchip][data-eventid]'),
  ].map((c) => ({
    raw: c.getAttribute('data-eventid'),
    label:
      c.textContent.includes('[CALSDK]') ||
      /Timed A|Daily|Weekly|AllDay|MultiDay|guest/i.test(c.textContent),
    calendarId:
      (c.getAttribute('jslog')?.match(/;\s*1:\["([^"]+)"/) ?? [])[1] ?? null,
  })),
);
await p.close();
await b.close();

const seen = new Set();
const rows = [];
for (const c of chips.filter((x) => x.label)) {
  const d = decode(c.raw);
  const key = `${d.eventId}|${d.instanceId ?? ''}`;
  if (seen.has(key) || d.kind !== 'event' || seen.size >= 8) continue;
  seen.add(key);
  const ref = { ...d, calendarId: c.calendarId, confidence: 'exact' };
  const row = {
    shape: d.instanceId
      ? d.instanceId.length > 8
        ? 'instance-timed'
        : 'instance-allday'
      : 'single/series',
    calendarIdFromJslog: !!c.calendarId,
  };
  try {
    const e = await provider.getEvent(ref);
    row.found = !!e;
    if (e) {
      row.idEqualsApiId = e.id === apiEventId(ref);
      row.calendarIdEqual = e.calendarId === c.calendarId;
    }
    if (!e && d.instanceId) {
      // is the SERIES reachable by its base id? (tells "instance id form not accepted" from "no access")
      const series = await provider.getEvent({ ...ref, instanceId: undefined });
      row.seriesFoundByBaseId = !!series;
    }
  } catch (err) {
    row.error = `${err.name} ${err.status ?? ''} ${err.reason ?? ''}`.trim();
  }
  rows.push(row);
}
console.log(JSON.stringify(rows, null, 2));
const summary = {
  checked: rows.length,
  found: rows.filter((r) => r.found).length,
  instanceForms: [
    ...new Set(
      rows
        .filter((r) => r.shape !== 'single/series')
        .map((r) => `${r.shape}:${r.found ? 'accepted' : 'not found'}`),
    ),
  ],
  errors: rows.filter((r) => r.error).length,
};
console.log('SUMMARY', JSON.stringify(summary));
process.exit(summary.errors ? 1 : 0);
