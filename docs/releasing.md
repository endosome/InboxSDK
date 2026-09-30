# Releasing

Nothing has been published yet; the scope `@calendarsdk` is a placeholder (plan
§17). This is the checklist for the first and every later release.

## Before the first publish (owner decisions)

- Final package name/scope; update `name` in both `package.json` files, the
  docs, and the examples' imports. Fill `repository` in
  `packages/core/package.json`.
- Whether to enable scheduled compat runs (`tools/calendar-probe/schedule/`).
- Phase 4 items if you want `calendarId` claims beyond consumer accounts
  (Workspace pass, API correlation): otherwise publish with the documented
  "unverified" note.

## Every release

1. **Green tree:** `yarn gulp && yarn typecheck && yarn lint && yarn test`.
2. **Fresh fixtures** (if Calendar may have changed): re-capture
   (`tools/calendar-probe/README.md`), read the fixture diff, run the tests.
3. **Live suites** against the test account (Chrome per the probe README):
   `experiments/extension-*.mjs`, `compat-runner.mjs` (must report 0 hard, 0
   warning; with `--drill` it must catch the broken selector).
4. **Package contents:** build `@calendarsdk/google-api`
   (`yarn workspace @calendarsdk/google-api build`), then
   `node tools/check-packages.mjs`. It fails if an entry point or license is
   missing, tests or internals are shipped, the bundle lacks an export the types
   promise (`default`, `CalendarSDK`, `load`, `LOADER_VERSION`), or a tarball is
   too big. CI runs it too.
5. **Consumer smoke:** `npm pack` both packages, install the tarballs into an
   empty project, `tsc` a file that imports both and calls `load`,
   `Toolbar.addButton` and `Data.getEvent`.
6. **Version and notes:** bump `version` in both packages (they move together
   while `google-api` peers on `core: *`), move `CHANGELOG.md` entries from
   _Unreleased_ under the new version with the date, mention selector fixes
   explicitly.
7. **Publish** (`npm publish --access public`, ideally with provenance from CI)
   and tag `v<version>`.

## Patch releases for Google UI changes

`sdk.Compat` / the compat runner report the break; fix the selector chain in
`src/platform-implementation-js/dom-driver/google-calendar/selectors.ts` (most
semantic candidate first, locale-dependent last), re-capture fixtures, release
as a patch. Users can bridge the gap meanwhile with `selectorOverrides`
(prepended candidates; never replaces the bundled chain).
