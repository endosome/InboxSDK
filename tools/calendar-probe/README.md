# calendar-probe (EXPERIMENTAL)

Read-only exploratory probe for Google Calendar. Not part of the SDK build.
Attaches to a Chrome you started and signed in yourself; it never handles
credentials.

    google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.calsdk-profile https://calendar.google.com
    npm i   # run from this directory (installs playwright-core)
    node probe.mjs [outDir]

Outputs (default `./out/`, git-ignored; contains YOUR calendar data — sanitize
before committing):

- `chip-attributes.json`: every attribute on candidate event chips + ancestors,
  per view
- `network.json`: request METHOD + URL path + content-type + size (no bodies, no
  headers)
- `routes.json`: URL / history / title after each navigation
- `globals.json`: MAIN-world global names (keys only, no values) The probe only
  navigates and opens popovers (clicks a chip); it never edits or deletes.

## Testing real extensions (Phase 2)

Branded Chrome ignores `--load-extension`. Start Chrome with
`--enable-unsafe-extension-debugging` and load extensions over CDP
(`Extensions.loadUnpacked`), as `experiments/extension-smoke.mjs` and
`experiments/extension-routes.mjs` do (run `yarn gulp` first).

## Compat runner (Phase 8)

`compat-runner.mjs` runs the SDK's own compat checks (bundled with esbuild) in
the main views, a popover and the editor of the signed-in test Chrome, compares
structure fingerprints with `baselines/structure.json` and writes
`out/compat-report.{json,md}`. Flags: `--update-baseline`, `--drill`
(broken-selector drill), `--issue-dry-run` (writes issue text; files nothing).
`compat-nightly.sh` wraps it for cron and keeps dated copies. Needs the
`[CALSDK]` fixtures (`seed.mjs`) and read-only access only.

## Real-markup fixtures (`capture-fixtures.mjs`)

`node capture-fixtures.mjs` snapshots sanitised copies of real Calendar pages
(week, month, schedule, event/task/birthday popovers, quick-create, editor) into
`__tests__/calendar-fixtures/`; `__tests__/calendar-fixtures.test.ts` runs the
SDK's selectors, identity, popover, editor and toolbar code against them in
jsdom. Sanitising happens in the page on a clone: all text becomes `x`/`0`,
attributes that can hold user data (aria-label unless a known UI string, title,
value, href, `data-*` other than structural ones, `jslog` calendar ids, emails)
are masked, `data-eventid` tokens are re-encoded from synthetic ids,
SDK-injected nodes are dropped. **Review the diff and run the tests before
committing a re-capture, and only capture the test account.** Re-capture when
Calendar changes and these tests (or the compat runner) fail: the diff of the
fixtures then shows exactly what Google changed.
