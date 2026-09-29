# Calendar compatibility testing, change detection and test strategy

Status: the investigation harness **exists and ran against live Calendar on
2026-09-29** (`tools/calendar-probe/`, EXPERIMENTAL). Everything below marked
_(built)_ is in the repo; the rest is design.

## 1. Repeatable investigation system

```
human signs in once ──► Chrome (persistent profile, --remote-debugging-port=9222)
                                   │  CDP
                      ┌────────────┴─────────────┐
                      ▼                          ▼
        tools/calendar-probe/seed.mjs     tools/calendar-probe/compat.mjs
        (create [CALSDK] fixtures)        (PASS/WARN/FAIL report, exit 1 on FAIL)
                      │                          │
                      ▼                          ▼
              fixture calendar dataset   experiments/*.mjs (structure, lifecycle, network shape)
```

Decisions (and why):

- **Attach over CDP to a human-signed-in real Chrome**, not `chromium.launch()`.
  Headless Playwright was redirected to Google sign-in (verified) and
  automation-flagged browsers are commonly refused at Google login. The
  persistent `--user-data-dir` doubles as the CI/dev profile. _No credentials or
  cookies are ever written to the repo or handled by scripts._
- **Dedicated test accounts only** (never a personal account). Fixtures are
  prefixed `[CALSDK]`; scripts refuse to delete anything that is not.
- **Read-only by default**; `seed.mjs` is the only fixture writer and is now
  **idempotent** (`--check` reports missing fixtures; a run creates only what a
  search does not find, matching chip titles exactly). It handles overlays and
  the guest "send invitation emails?" confirm (_Don't send_).
- **Coach-marks and permission prompts are part of the environment**: "Want to
  get better notifications?" and the Meet "Got it" coach-mark intercepted clicks
  and broke the first automation runs [V]. Runners must dismiss overlays before
  interacting, and record that they did (an unexpected new overlay is itself an
  _informational_ diff).
- **Time-zone prompt**: when the browser tz differs from the calendar's primary
  tz Calendar shows _"Change time zone to …? Yes / No / Never ask again /
  Settings"_, which intercepts clicks; `compat.mjs` dismisses it with _No_
  (never _Yes_, which mutates the account).
- **Locale**: all runner steps currently use English `aria-label`s. Every runner
  step must prefer locale-independent hooks (`jsname`, `data-*`, roles) and the
  report records which rung (A/B/C grade) each step used, so the locale pass
  ranks selectors automatically.

### Fixture dataset (as built on the test accounts, 2026-09-29)

Account 0 = owner, account 1 = second consumer account (`/calendar/u/1/`). All
fixtures are persistent regression data (decision: keep).
`node seed.mjs --check` verifies the seedable ones (9/9 present).

| Fixture                                                                                                                                                         | State                                                  | Notes                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `[CALSDK] Timed A` Sep 30 10:00–11:00; `AllDay` Sep 30; `MultiDay` Oct 1–3 (3 chips); `MonthDrag` Oct 20; `TZCross` Oct 2 01:00 (Warsaw)                        | ✅ seedable                                            | drag/lifecycle/timezone fixtures                                    |
| `Daily recurring` ×5 (13:00), `Weekly recurring` ×4 (14:00 → split at Oct 7 into a second series), `AllDay weekly` ×3 (Sep 30 instance is a modified exception) | ✅ seedable; **series state was mutated by the tests** | seeder sees them as present; a pristine copy needs delete + re-seed |
| `Dup` ×2 on primary + 1 on `CALSDK Shared`                                                                                                                      | ✅                                                     | ids `…@m`, `…@m`, `…@g`                                             |
| `[CALSDK] With guest` (invite to account 1, accepted), `Invite Maybe` (tentative), `Invite No` (declined)                                                       | ✅ manual/`--guest`                                    | invitee RSVP done by hand via popover (RSVP buttons documented)     |
| Secondary calendar `CALSDK Shared` (shared with account 1, read-only) with `SharedCal`                                                                          | ✅ manual                                              | create via Settings; `src=<calendarId>` in the editor URL           |
| Task `[CALSDK] Task A` ×2, contact `CALSDK Birthday` (Oct 2), subscriptions (Holidays PL/US, third-party `.ics` = `@import`)                                    | ✅ manual                                              | Birthday needs Google Contacts                                      |
| modified single recurring instance                                                                                                                              | ☐ (reset by an _All events_ test)                      | recreate with `experiments/move-instance.mjs`                       |
| event with Meet link / long description; Workspace-owned event                                                                                                  | ☐                                                      | Workspace account missing                                           |

Fixtures are dated 2026-09-29…10-20 — they drift out of range and must be
re-anchored periodically (a `seed.mjs --rebase` is still to be built).

### Automated state walk (the "example flow", with current status)

`compat.mjs` _(built)_ walks: load Week → check root/view-key/chips/identity →
Day, Month, Year, Agenda, Search → open popover → check identity + action
buttons → Esc → Edit → editor route + title/save/cancel → Cancel. To add:
create-temp-event/edit/delete (uses `seed.mjs` helpers, only `[CALSDK] tmp*`),
recurring-instance editor dialog, quick-create (via _Create_ menu or `c`; a
grid-slot click did not open it in one attempt), in-app view switches
(`m/d/w/y/a/x`, verifying `body[data-viewkey]` follows), browser back/forward,
drag/resize with lifecycle instrumentation, rapid view switching.

At every step capture: URL, title, `body[data-viewkey]`/`data-viewfamily`,
`[role=main]` attrs, per-key selector **match count and rung index**, chip count
and decode count, overlay children of `body`, a **structure hash** (below),
timing of URL-change→DOM-settle, and (optional) network-shape hashes.

### Latest report _(built, live run 2026-09-29, after the pre-implementation audit)_

```
Calendar compatibility report
PASS mainRegion / route: WEEK / mainPeriodType / event detection
PASS event identity decode — N/N (kind-prefix aware: ttb_ / bday_)
PASS calendarId via jslog — plain events only (tasks/birthdays have no full id)
PASS dateCell (data-datekey) / user info in DOM / Navigation API present
PASS overlay host #yDmH0d present / empty when idle / body[data-viewkey] live key / body[data-viewfamily]
PASS data-dragsource-type classes (2 timed, 6 all-day, 9 read-only)
INFO Trusted Types enforced for innerHTML (SDK must use DOM builders / TT policy) — yes
PASS variant fingerprint data-ui-kind / route: DAY MONTH YEAR AGENDA SEARCH
PASS popover detected / identity / inside #yDmH0d / no form controls / data-allow-wheel-scroll=false / edit+delete jsnames
PASS route: EVENT_EDIT / editorTitle / editorSave / editorCancel
32 pass, 0 warn, 0 fail, 1 info
```

History worth keeping: the first draft of this runner produced a **FAIL** on
`dateCell` because our notes said `[role=rowgroup][data-datekey]`; and the
pre-implementation audit's new `appRoot` check FAILED because we had claimed
`#yDmH0d` encloses `[role=main]` (it is an empty overlay host). Both times the
runner caught a wrong assumption in our _own docs_, not a Google change — keep
runner and docs mutually checking.

## 2. Change detection

Severity model:

| Class                      | Meaning                                                                                                       | Action                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Hard failure**           | a _required_ capability is gone                                                                               | CI red; release blocked; page owner |
| **Warning**                | degraded: first-choice rung missed but a fallback matched; multiple unexpected matches; locale-only rung used | issue auto-filed, no block          |
| **Info (structural diff)** | fingerprint/structure changed without functional impact                                                       | appended to report; weekly digest   |

| Check                                                                                                                                                             | Class if it fails                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `mainRegion` count ≠ 1                                                                                                                                            | hard                                                                                             |
| view-key → RouteType classification (`body[data-viewkey]`/`data-viewfamily`, URL) for each verified view, **after in-app navigation** (not only after full loads) | hard                                                                                             |
| route-classification disagreement (URL says WEEK, key says MONTH) beyond one frame                                                                                | warning                                                                                          |
| `eventChip` count == 0 on a fixture range                                                                                                                         | hard                                                                                             |
| **identity decode rate < 100 %** of chips (`data-eventid` → `eventId [instance] cal`)                                                                             | **hard**                                                                                         |
| decode OK but `jslog` calendarId missing                                                                                                                          | warning                                                                                          |
| chip-lifecycle assumption flips (today: elements recreated, `data-eventid` set after insertion, no in-place id change) — measured by `reuse.mjs`                  | warning (design input changed)                                                                   |
| injected-node survival test (badge survives N navigations + popover open)                                                                                         | hard once badges ship                                                                            |
| popover not detected / no inner `data-eventid`                                                                                                                    | hard                                                                                             |
| popover action button found only via a locale rung                                                                                                                | warning                                                                                          |
| editor route regex `/r/eventedit/<eid>` no longer matches                                                                                                         | hard; editor title/save/cancel `jsname` missing → warning                                        |
| Navigation API absent                                                                                                                                             | warning (fallback path)                                                                          |
| Trusted Types **no longer** enforced (`innerHTML` succeeds)                                                                                                       | info (opportunity); the SDK keeps using DOM builders                                             |
| overlay host `#yDmH0d` missing / non-empty when idle                                                                                                              | hard / warning                                                                                   |
| `body[data-viewkey]` ≠ `html[data-prefetch-view-key]`                                                                                                             | **expected** to differ after in-app navigation (html key is load-time only) — informational only |
| `data-dragsource-type` value outside {2, 6, 9, absent}                                                                                                            | warning                                                                                          |
| `#xUserInfo`/`#initialdata` absent                                                                                                                                | hard for `User`                                                                                  |
| unexpected new overlay/dialog kinds under body                                                                                                                    | info                                                                                             |
| selector rung: index of first matching candidate > 0                                                                                                              | warning ("drift")                                                                                |
| selector matches a **different count** than baseline (e.g. 1 → 3)                                                                                                 | warning                                                                                          |
| network shape hash (`sync.*` `f.req` top-level arity, response XSSI prefix `)]}'`, endpoint set) changed                                                          | info (canary; not used by V1)                                                                    |
| DOM **structure hash** changed                                                                                                                                    | info                                                                                             |
| `data-ui-kind` / html attrs differ from known variants                                                                                                            | info + `unknown-variant`                                                                         |
| page-world bridge (only if the shim is enabled) stops answering                                                                                                   | hard for shim features only                                                                      |

**Structure hash**: for each catalogued key take the matched element, serialize
_tag + role + sorted attribute NAMES (not values) + child tag sequence_ to depth
2, hash it. Values (ids, classes, labels) are excluded so it is stable across
data and locale but moves when Google restructures. Store baselines in
`compat/baselines/<variant>.json`; diff produces the informational report.

The runner is a library (`compat/`) with two front-ends so checks are shared:
(1) CLI over CDP (dev + nightly CI), (2) **in-page** `sdk.Compat.getReport()`
which runs the _same_ selector/identity checks against the live DOM using the
SDK's own registry, so real users' extensions can `onCompatIssue` when their
Calendar variant breaks something (only counts and key names are reported — no
titles, ids or emails).

### Nightly/weekly job

Scheduled runner machine (not a hosted CI VM: needs the persistent signed-in
profile) executes `compat.mjs`, uploads the report + screenshots + sanitised
structure JSON (no event titles, no emails), and opens/updates a GitHub issue on
any hard failure or new warning. Frequency: nightly for the hard-failure set;
weekly for the long walk. Keep runs low-rate and human-account based; review
Google ToS/automation policy before enabling scheduling (**open item**).

## 3. Handling Google UI experiments / variants

- Bundled implementation + **declarative** compat data only
  (`selectorOverrides`, variant table). No remote executable code, ever.
- `variants.ts` maps a _fingerprint_ (`data-ui-kind`, presence/absence of key
  attributes, structure hash) → selector set + capability flags
  (`hasNavigationApi`, `popoverInOverlay`, …). Currently one variant observed:
  `data-ui-kind="10"` [V]. Unknown fingerprint ⇒ try every rung, report
  `unknown-variant`, keep working per feature.
- Per-feature graceful failure: a missing popover selector must not disable
  `EventView`; each service reports independently in `Compat`.
- CI matrix target: consumer account, Workspace account, non-English locale,
  dark theme, narrow window, dense/compact density. **Exercised so far (all
  checks green):** two consumer accounts; `en` + `de`; light + dark;
  comfortable/compact/responsive density; primary tz Warsaw + Los Angeles;
  secondary tz on. **Not exercised:** Workspace account, narrow window, RTL/CJK,
  forced OS dark.

## 4. Test layers

| Layer                        | Scope                                                                                                                                                                                                              | Tooling                                                                                            | Blocks release?                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Unit**                     | `identity.ts` decoder/suffix classifier, route classifier table, `SelectorRegistry`, `Membrane`, `HandlerRegistry`, lifecycle (id-change ⇒ destroy+create; remove+re-add same frame ⇒ no destroy), `CalendarIdMap` | Jest + jsdom (existing setup: 58 suites / 420 tests green baseline)                                | **Yes**                                                                               |
| **DOM fixture**              | sanitised HTML captured by the probe (week/month/agenda/popover/editor), replayed in jsdom with scripted attribute mutations (simulating node reuse, subtree wipes)                                                | Jest; extend `common/censorHTMLtree` to keep `data-eventid`/`jslog` _structure_ with synthetic ids | **Yes**                                                                               |
| **Extension smoke (first!)** | throwaway MV3 extension: Navigation API events, `#xUserInfo` read, DOM-builder + Trusted-Types-policy injection, body observer, in a _real_ content script                                                         | Playwright + unpacked extension                                                                    | **Yes** — gates Phase 2                                                               |
| **Real-browser integration** | SDK bundled into an example extension, loaded in Chrome, walked by Playwright-over-CDP; assertions on badges, popover buttons, route events, view destroy                                                          | Playwright (+ persistent profile)                                                                  | **Yes** for release branches (run on the signed-in runner)                            |
| **Compatibility (live)**     | `compat.mjs` (§2) against live Calendar, scheduled                                                                                                                                                                 | CDP runner                                                                                         | Hard failures block a release _that day_; they also page maintainers between releases |
| **Consumer-level**           | a tiny extension: `addBadge` on every event, popover button, route logger; verify badge count == chip count, no duplicates after 50 navigations, `destroy` events fire, button click yields right `EventRef`       | Playwright + example extension in `examples/`                                                      | **Yes**                                                                               |
| **Performance**              | 300-chip synthetic week: observer handler time per mutation batch, reconcile cost per frame; drag simulation                                                                                                       | jsdom micro-bench + Chrome trace                                                                   | Warn threshold, not blocking initially                                                |

Not release-blocking: locale/variant matrix (warnings until the matrix is
stable), network canary, structure-hash diffs.

## 5. What was learned about the harness itself (feeds the design)

1. Google sign-in cannot be scripted; a human-signed-in profile is mandatory.
   [V]
2. Overlays (notification prompt, Meet coach-mark) intercept clicks → runner
   needs an overlay-clearing pre-step. [V]
3. A `history.pushState` monkeypatch applied after page load saw no Next/Prev
   navigations while Navigation-API events did fire (cause unproven); use the
   Navigation API. [V]
4. The first compat run's only FAIL was a wrong assumption in our own docs —
   keep runner and docs mutually checking.
5. Scripts print account identifiers; sanitise before committing anything from
   `out/` (git-ignored).
