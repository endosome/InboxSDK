# Google Calendar reverse-engineering log

Method: real Chrome (WSLg) with a dedicated profile, signed in by a human to a
**dedicated test account**, attached over CDP (`chromium.connectOverCDP`).
Scripts live in `tools/calendar-probe/` and `tools/calendar-probe/experiments/`
(EXPERIMENTAL). Observation date: **2026-09-29**, Calendar build string seen in
requests: `calendar.web_20260923.07_p0`. Two consumer (gmail.com) test accounts,
UI languages `en` and `de`, desktop layout. **No Workspace account.**

Evidence levels: **[V]** verified by experiment in this session (script named) ·
**[H]** hypothesis, not yet tested · **[X]** experiment defined, not run (or run
but inconclusive — stated in place). Nothing below is recalled-from-memory
unless marked `[H]`. Account identifiers are redacted (`<owner>`); raw captures
are git-ignored.

## 0. Scope actually covered vs. the brief

| Brief item                                                                                                       | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day / Week / Month / Year / Schedule(agenda) / Search / customday views                                          | **[V]** `views.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Existing-event popover                                                                                           | **[V]** `pop.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Full editor (from popover and via URL template)                                                                  | **[V]** `ed2.mjs`, `seed.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Recurring events + instances (daily/weekly, timed + all-day)                                                     | **[V]** `ident.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Duplicate title+time events                                                                                      | **[V]** `ident.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Multi-day events                                                                                                 | **[V]** `stale.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Back/forward, today, prev/next                                                                                   | **[V]** `life*.mjs`, `iso.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Quick-create dialog                                                                                              | **[V]** opened via Create → Event/Task and key `c` (§1.7); _grid-slot click_ did not open it in my attempt [X]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Drag / resize                                                                                                    | **[V]** §1.4, §1.8–§1.15 (timed→all-day _drag gesture_ inconclusive §1.12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Modified single recurring instance, other-owner events, RSVP states, shared calendars, same event on 2 calendars | **[V]** §1.2, §1.5, second-account section below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Tasks / Birthdays chips                                                                                          | **[V]** §1.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Locale                                                                                                           | **[V] one non-English locale (`?hl=de`)** via `loc.mjs`: `<html lang>`=de, `data-prefetch-view-key`=WEEK, `data-ui-kind`=10, `[role=main][data-period-type]`=week and 14 `[data-eventchip]` all **unchanged**; popover buttons `jsname=DyVDA` (edit) and `jsname=VkLyEc` (delete) **still match** while English `aria-label`s do not (German: `Bearbeiten`, `Termin löschen`, `Schließen`, …); `<title>` changes (`Google Kalender - Woche vom 27. September 2026`) → **never classify routes from title text**. Supports grading `jsname` as B (locale-independent on this build) and aria-label as C. Other locales/RTL untested [X] |
| Timezone / theme / density                                                                                       | **[V]** §1.17 (Workspace account: [X])                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Delete, RSVP, recurring-edit dialog                                                                              | **[V]** delete (§1.18), RSVP (second-account section), recurring-edit scope dialog (§1.2, §1.8); _delete of a recurring instance / guest event_ [X]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Second account (verified 2026-09-29, `/calendar/u/1/`, scripts `acct2.mjs`,
`whoami.mjs`, plus scratch RSVP runs):**

- Invitations only appeared on the invitee's calendar after the invitee acted on
  the invite (Gmail) — automation must account for this delay/precondition.
- **Same event, different `data-eventid` per viewer**: organizer sees
  `fx05bbee190dfe96e828f9317e <A0>@m`, invitee sees
  `fx05bbee190dfe96e828f9317e <A1>@m`. The **`eventId` part is identical across
  attendees; the calendar part is the viewer's own calendar** (also in `jslog`
  field 1). Consequence: `EventRef.calendarId` = "the calendar this copy lives
  on", and a cross-user key must use `eventId` (+instance) only. [V, 1 invited
  event]
- **RSVP state does not change identity**: `Needs RSVP → Yes/Maybe/No` on the
  invitee left `data-eventid` unchanged; the chip stays rendered even when
  **Declined** (default setting). State is only in chip text ("Needs
  RSVP"/"Accepted"/"Tentative"/"Declined", locale-dependent) and generated
  classes (`LKeQwe` vs `EiZ8Dd` — do not use). [V for 3 states]
- Invitee popover exposes RSVP buttons `button[jsname=lezaG]` (Yes; aria-label
  `Respond Yes, selected` carries state), `jsname=TtJ8Me` (No), `jsname=EVpSp`
  (Maybe), plus "Email guests" and "Show additional actions". Responding raised
  no confirm dialog. [V]
- The invitee UI also showed the notification-permission overlay; overlay
  clearing is required per account.

## 0.1 Quick reference — what an implementer needs (authoritative summary)

Details and evidence are in the sections named; anything not [V] there is not
listed here.

| Topic             | Fact                                                                                                                                                                                                                    | §                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Chip              | `[data-eventchip]` **inside `[role=main]`** with `jsaction` + `data-keyboardactiontype`; `data-eventid` is set after insertion                                                                                          | 1.1, 1.7, 1.18, 2   |
| Identity          | `data-eventid` = `[ttb_\|bday_]` + base64url(`<id>[_<instance>] <calAbbrev>`); suffix = original UTC start (timed) or date (all-day)                                                                                    | 1.1, 1.6            |
| Calendar id       | abbreviations `@m` gmail.com, `@g` group, `@v` group.v, `@i` import; full id in `jslog` field 1 (plain events only); per-viewer for invitations                                                                         | 1.5, 1.16           |
| Stability         | RSVP state, theme, density, timezone, locale, same-day drag/resize, "This event" edits never change ids; "This and following" → new base id; "All events" → new instance suffixes                                       | 1.2, 1.4, 1.8, 1.17 |
| Multi-day         | N chips, one id                                                                                                                                                                                                         | 1.1, 1.10           |
| Year view         | renders **no** `[data-eventchip]` (0 chips although events exist) — no `EventView`s there                                                                                                                               | 3                   |
| Kind / drag class | `data-dragsource-type` 2 timed, 6 all-day, 9 read-only, absent in Schedule                                                                                                                                              | 1.15                |
| Route             | `body[data-viewkey]` + `data-viewfamily` (live); `<html data-prefetch-view-key>` is load-time only; Navigation API works in an isolated world                                                                           | 1.18, 3             |
| User              | `#xUserInfo` children `#xUserEmail`, `#xTimezone`, `#xGmtOffset`, `#xUserLocale`                                                                                                                                        | 1.18, 6             |
| Popover           | `[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]`, no `input`/`textarea`; lives in overlay host `#yDmH0d`; Edit and Delete absent on read-only shared events; Edit absent on birthdays (Delete present) | 1.5–1.7, 4          |
| Other dialogs     | notification prompt, Meet coach-mark, time-zone prompt, recurring-scope, guest-update, invite-confirm — plain `[role=dialog]`, block clicks                                                                             | 1.8, 1.17           |
| Injection         | Trusted Types are enforced for page/MAIN-world code but **not for a real content script** (`innerHTML` works there); Calendar strips injected children on re-render while chips persist                                 | 1.18, 4             |
| Load              | chips 2.2–3.1 s after commit; `#xUserInfo` ~1 s                                                                                                                                                                         | 1.18                |
| Not verified      | Workspace ids, real content-script run, ≥300 chips, RTL/CJK, narrow window, Calendar API correlation                                                                                                                    | 9                   |

## 1. Event identity (highest priority)

### 1.1 What the DOM carries [V: `ident.mjs`, `views.mjs`, initial `probe.mjs`]

Every rendered event **chip** is an element matching `[data-eventchip]`,
carrying (attribute names exact): `data-eventchip`, `data-opens-details="true"`,
`data-eventid`, `data-keyboardactiontype`, `data-dragsource-type`,
`jscontroller`, `jsaction`, `jslog`, and (timed chips) `role="button"`,
`tabindex`, `data-focusable`.

`data-eventid` = **base64url of
`"<eventId>[_<instanceSuffix>] <calendarIdAbbrev>"`** (padding stripped).
Decoded samples (owner redacted):

| Case                                      | Decoded `data-eventid`                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| plain timed event                         | `fx0ba838f1de372227d532f32a <owner>@m`                                                                                                         |
| plain all-day event                       | `fxab7fcc89ba1ce9feece6d3b0 <owner>@m`                                                                                                         |
| recurring timed instance                  | `fx3e8fc6b453a4e8c719971e8a_20260929T110000Z <owner>@m` (suffix = instance **original start, UTC**; the 13:00 local event in GMT+2 → `11:00Z`) |
| recurring all-day instance                | `fx2f16666fd05befe129423b75_20260930 <owner>@m` (suffix = date)                                                                                |
| two events, identical title/time/calendar | `fx3b8c3141d8b4adbf89984e3b …` vs `fxa4d9088ff01b92a5fce70986 …` — **distinct**, no ambiguity                                                  |
| holiday calendar event                    | `20261101_fx9f9eb6661eca187fee9a8d7c en.polish#holiday@v`                                                                                      |

Calendar-ID abbreviation: see §1.16 (`@m`, `@g`, `@v`, `@i` verified;
custom-domain [X]) — do NOT hard-code an expansion table. **Full calendar ID is
present in `jslog`**: `…;1:["<owner>@gmail.com",1];…` and, for the holiday
event, in the prefetch request
(`en.polish#holiday@group.v.calendar.google.com`). `jslog` also repeats the raw
event ID (`2:["<eventId>",…]`). [V]

Proposed extraction order (highest confidence first):

1. Decode `data-eventid` → `eventId` (+ `instanceSuffix`) — **high confidence,
   no network, no MAIN world**.
2. Full `calendarId`: parse `jslog` field `1:[<id>,…]` **[H: format is a
   Google-internal tracking string; brittle]**; fallback: expand the
   abbreviation via a learned map built from (abbrev, full) pairs seen in
   `jslog`/`#initialdata`.
3. `iCalUID`, `recurringEventId` (= `eventId` minus `_suffix`),
   `originalStartTime` (= suffix) — derivable from the suffix for recurring
   instances **[V for unmodified instances; X for moved/edited instances]**.

### 1.2 Confidence and failure modes

| Question from brief                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can identity be read from every rendered event? | **Yes for every chip seen** in Day/Week/Month/Agenda/Search, including invited, shared-calendar, task, birthday and holiday chips (§1.5, §1.6) [V]; ids of Workspace calendars [X]                                                                                                                                                                                                                                                                                                                                                                  |
| Duplicates (same title/time)?                   | Distinct IDs [V]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Recurring instances distinguishable?            | Yes via `_suffix` [V, unmodified instances]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Edited/moved single instance?                   | **Suffix keeps the ORIGINAL start.** Moved the Oct 1 instance of the daily series from 13:00 to 16:30 ("This event" scope; Calendar shows an _Edit recurring event: This event / This and following events / All events_ dialog): `data-eventid`, `jslog` field 2 and the editor route token all stayed `<id>_20261001T110000Z` while the chip now reads `4:30pm to 5:30pm`. So `instanceId` = `originalStartTime` (Calendar-API semantics), **not** the displayed start [V, timed instance, one move; all-day and "this and following" splits [X]] |
| Same event on two calendars (copies)?           | Same _title+time on two calendars_ → distinct ids [V §1.5]. The _same_ event copied to two calendars was not created [X]                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Multi-day event                                 | One event renders as **N chips with the same `data-eventid`** (3 chips for a 3-day event: one full-width 242px + two 80px per-day segments, all visible) [V `stale.mjs`]. **Chip ≠ event.**                                                                                                                                                                                                                                                                                                                                                         |
| Agenda view                                     | chip **and** an inner `[role=button]` both carry `data-eventid` [V] — discover on `[data-eventchip]`, never `[data-eventid]`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Timezone-crossing events                        | **[V]** ids identical in Warsaw and Los Angeles primary time zones; only labels/dates shift (§1.17)                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 1.3 Route-based identity [V: `ed2.mjs`]

Opening the editor navigates to `/calendar/u/0/r/eventedit/<data-eventid>` — the
**same** base64url token. Title becomes `Google Calendar - Event details`. Deep
links and identity therefore share one encoding. The event popover contains
`[data-eventid]` (2 nodes inside the dialog, same value) [V `pop.mjs`] → popover
identity is direct.

### 1.4 Series split and drag/resize [V: `series-split.mjs`, `drag-resize.mjs`, `drag-ghost.mjs`]

- **"This and following events" splits the series and changes identity.** Weekly
  series `43f41r2j…` (Sep 30, Oct 7, …), edit the Oct 7 instance's time with
  scope _This and following events_: the earlier part keeps
  `43f41r2j…_20260930T120000Z`; Oct 7 and later become a **new base id**
  `38rl5q55…` with suffixes from the _new_ start (`_20261007T133000Z`,
  `_20261014T133000Z`). The old `43f41r2j…_20261007T120000Z` no longer exists.
  An `EventRef` held for the Oct 7 instance is therefore **invalidated with no
  forward link** in the DOM; the SDK must treat it as destroy + new view, never
  as a rename. (Single-instance "This event" edits keep the id — §1.2.)
- **Drag (move) does not change identity or replace the element.** Dragging
  `Timed A` (10:00→11:45): same element (`pre-existing` cid), same
  `data-eventid`, 0 `data-eventid` mutations, 0 removals of the original chip;
  its label and inline position update in place (`y` 340→424).
- **Resize likewise**: same element and id, height 46→94px, label
  `11:45am to 1:45pm`.
- **During a drag, a _second_ chip element with the same `data-eventid` is
  created** (max 2 chips sharing the id at once; 25 chip additions / 23 removals
  in ~12 mouse moves) inside a separate container (`div.feMFof.A3o4O`, generated
  names), i.e. a drag ghost/preview. It disappears on drop. → **transient
  duplicates of one event id are normal**; `EventView` must not assume 1 chip
  per id and should either ignore chips in the drag layer (discriminator to be
  found: their container) or tolerate churn (debounce view creation by a frame).
- **Drop with no guests raises no dialog.** (Guest events likely ask to notify
  guests — [X].)
- Fixtures: `Timed A` was moved/resized then restored via the editor
  (10:00–11:00, Sep 30). Editing start time first, then end time, then **End
  date** is required: setting only times had silently turned it into a multi-day
  event.

### 1.5 Secondary and shared calendars [V: `shared-calendar-ids.mjs`, `shared-readonly-popover.mjs`, `create-shared-events.mjs`]

Setup: account 0 created calendar `CALSDK Shared` (id
`<64 hex>@group.calendar.google.com`; the settings URL
`/r/settings/calendar/<token>` is that id base64url-encoded) and shared it with
account 1 (_See event details_). The share appeared on account 1 without further
action (a Gmail notification was also sent).

- **`@group.calendar.google.com` abbreviates to `@g`** (third data point:
  `@gmail.com`→`@m`, `@group.v.calendar.google.com`→`@v`,
  `@group.calendar.google.com`→`@g`). Rule looks like "strip
  `.calendar.google.com`/`gmail.com` and keep the leading letter of the domain"
  **[H, undetermined; keep learned-map design]**.
- `jslog` field 1 is `[<fullCalendarId>, <n>]`; `n` = 1 for the primary
  calendar, 2 for a secondary/shared one (only two values seen [H]).
- **Same title + time on two calendars**: three `[CALSDK] Dup` chips (2 on the
  primary calendar, 1 on the shared one) have three distinct ids (`4dseuv…@m`,
  `71uqu4…@m`, `5uea2q…@g`).
- **A shared calendar's event has the same `data-eventid` for owner and viewer**
  (`5jvtnbtm…@g` identical on `/u/0/` and `/u/1/`), unlike invited events where
  the calendar part is per-viewer (§ second account). So the calendar part = the
  calendar the _viewed copy_ lives on: for shared calendars that is one
  calendar; for invitations each attendee has their own copy.
- Chip text for secondary-calendar events contains `Calendar: <name>`
  (locale-dependent).
- **Read-only shared events have a reduced popover**: on the _See event details_
  viewer the popover has Close / _Email event details_ / Options only — **no
  `jsname=DyVDA` (Edit) or `jsname=VkLyEc` (Delete)**, and a "Why do I see this
  event?" note. The SDK must not assume Edit/Delete exist; `addButton` placement
  anchored on them needs a fallback.
- The popover contains 3 `[data-eventid]` nodes here (2 on owned events).

### 1.6 Tasks and Birthdays [V: `task-chips.mjs`, `task-popover-quickcreate.mjs`, `birthday-chip.mjs`]

Both render as ordinary `[data-eventchip]` elements with `data-eventid`, but the
token carries a **kind prefix** that a naive base64 decode of the whole string
turns into garbage (the first compat-style regex would have failed on them):

| Kind         | `data-eventid`                                         | `jslog` head                                           | Chip text                                        | Popover                                                                                                                          |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Event        | `base64url("<id>[_<inst>] <cal>")`                     | `35463;` … trailing position `6`/`10`                  | title …                                          | Edit event, Delete event                                                                                                         |
| **Task**     | `ttb_` + `base64url("<taskId> <cal>")`                 | **`185338;`** … trailing position `19`                 | `task: <title>, Not completed, <date>…` (locale) | _Edit task_, _Delete task_ (**same `jsname`s DyVDA / VkLyEc**), _Mark completed_ (`jsname=xFuBUb`), shows "Task list: My Tasks"  |
| **Birthday** | `bday_` + `base64url("<contactKey>_<YYYYMMDD> <cal>")` | `35463;` (same as events), instance suffix `_YYYYMMDD` | `cake\|<Name>'s birthday\|Birthday: …`           | **Delete event only** (`jsname=VkLyEc`), no Edit; all-day, stacked-layout chip (`data-stacked-layout-chip-container`), no `role` |

- Decode rule: `^(ttb_|bday_)?` then base64url of the remainder; the prefix is
  the **kind discriminator** (locale-independent), corroborated for tasks by the
  `jslog` head `185338`. Tasks and Birthdays live on pseudo-calendars in the
  sidebar (`Tasks`, `Birthdays`) that are checked by default.
- **`jslog` field 1 (full calendar id) exists only on plain events** (19/19);
  the birthday chip has `1:[4]` (no id) and task chips have no field 1
  (`jslog-by-kind.mjs`). For tasks/birthdays `calendarId` is only the
  abbreviation hint.
- Two tasks with the same title created in one session got distinct ids
  (`1lv1…`, `5bnd…`).
- Both kinds have `calendarAbbrev` = the owner (`@m`), i.e. tasks/birthdays are
  not on a separate calendar id.
- **Quick-create dialog** (Create → Event/Task):
  `[role=dialog][data-chips-dialog][data-layout-mode=bubble]` — **the same
  dialog shape as the existing-event popover — and it contains a
  `[data-eventid]`** (one non-chip `div`, a freshly generated _draft_ event id
  that matches no rendered chip). So "`[data-chips-dialog]` with
  `[data-eventid]`" does **not** discriminate popover from quick-create.
  Candidate rule [H]: an event popover is a `data-chips-dialog` whose
  `data-eventid` equals the `data-eventid` of a rendered chip (or the route's
  eid); a draft id matches none. Quick-create has
  `input[aria-label="Add title"]`; popovers don't.
- Creating a birthday required a Google Contacts entry
  (`contacts.google.com/new`, Month/Day fields); the chip appeared on the next
  Calendar load.
- Fixtures added: 2× `[CALSDK] Task A` (Sep 30 9:30) and contact
  `CALSDK Birthday` (Oct 2, chip `_20261002`).

### 1.7 Popover vs quick-create discriminator [V: `popover-vs-quickcreate-*.mjs`]

Both are `[role=dialog][data-chips-dialog][data-layout-mode=bubble]`. Tested on
12 dialogs: popovers for event, task, birthday, recurring instance,
shared-calendar event (owner), month view, agenda view, and on the second
account a read-only shared event and an invited event; quick-create via _Create
→ Event_, _Create → Task_ and keyboard `c`.

- **The originally proposed rule ("dialog's `data-eventid` matches a rendered
  chip") FAILS for quick-create**: at dialog-add time (t0) the draft id matched
  no chip, but ~200 ms later it did — Calendar inserts a **draft chip** into the
  grid carrying the same draft `data-eventid`. A watcher that classifies at t0
  would pass; one that classifies later would misclassify. Do not use.
- **Two locale-independent discriminators agreed on all 12 dialogs**:
  1. Popover has **no form controls**:
     `dialog.querySelector('input, textarea') === null` (0 inputs in 9/9
     popovers) vs quick-create **5–7** inputs (3/3).
  2. `data-allow-wheel-scroll`: `"false"` on all 9 popovers, `"true"` on all 3
     quick-creates. (Google-internal flag → grade B.) Draft is also identified
     by `input[aria-label="Add title"]` (locale-dependent, grade C).
- Classification is stable between t0 and t+250 ms for popovers (`nIds` and
  `matchesChip` unchanged), so a popover can be classified as soon as it's
  added.
- **Draft chips are `[data-eventchip]` elements** in the grid while quick-create
  is open, with a draft `data-eventid` that will not exist after cancel. They
  differ from real chips: **no `jsaction` and no `data-keyboardactiontype`**
  attributes (real chips in all views have both; 1 draft form seen in week
  view). An `EventView` for a draft chip would be a phantom → skip chips without
  `jsaction` (grade B [H]; verify on all-day quick-create and month view).
- Popover element count of `[data-eventid]`: 3 for events (chip-like nodes
  inside), 2 for tasks, 1 for birthdays — do not depend on the count.
- A grid-slot click did not open quick-create in my attempt (no dialog); the
  keyboard/menu routes did. [X: grid click path]

### 1.8 Dragging recurring and guest events [V: `drag-recurring-guest.mjs`, `restore-*.mjs`]

- **Dragging a recurring instance opens a scope dialog on drop**: plain
  `[role=dialog]` (**not** `data-chips-dialog`) reading _Edit recurring event —
  This event / This and following events / All events — Cancel / OK_. No
  `data-eventid` mutations occur before the user answers.
  - **This event** (Oct 3 instance 13:00→15:00): id unchanged
    (`…_20261003T110000Z`), chip label/position changed. Same as the editor move
    (§1.2).
  - **All events** (dragged the Sep 29 instance 13:00→15:00): the **base id is
    unchanged but every instance suffix changed** (`_…T110000Z` → `_…T130000Z`
    for all 5), and the two single-instance exceptions made earlier were
    overwritten to the same time. So **an "All events" edit invalidates every
    instance-level ref while `eventId` (the series) survives.** (Consistent with
    §1.4 where "This and following" produced a new base id.) → The stable key
    across series edits is the base `eventId`; `instanceId` is only stable until
    the series' start changes.
- **Dragging a guest event opens** _"Would you like to send update emails to
  existing Google Calendar guests? — Cancel / Don't send / Send"_ (plain
  dialog). Chose _Don't send_: id unchanged (`7b2evu7k…`), chip moved
  18:00→20:00. **Editing the same event through the editor raises the same
  confirm dialog on Save**; automation (and the `seed.mjs` restore step) must
  click _Don't send_ or it silently does not save.
- Neither dialog is a popover/quick-create; they are ordinary `[role=dialog]`
  **without** `data-chips-dialog`. A dialog watcher keyed on `[role=dialog]`
  alone would treat them as popovers — key on `data-chips-dialog` first (§1.7).
- Fixture state changes: the Daily series was restored to 13:00–14:00 with _All
  events_ (this **reset the earlier single-instance move fixture** from §1.2 —
  re-create it if a modified-instance fixture is needed); the guest event was
  restored to 18:00–19:00.

### 1.9 Cross-day drag (week) and month-view drag [V: `drag-across-days-week.mjs`, `drag-month.mjs`]

- **Week view, drag to another day column** (Sep 29→30, →Oct 3, →Sep 30; one
  column ≈ 126 px): `data-eventid` **unchanged** every time, but the **chip
  element is replaced** (`cid` differs after every drop: 4 different elements
  over 4 drops) and each new element receives `data-eventid` _after_ insertion
  (`oldValue` null; 2–6 attribute-set records per drop, i.e. real + ghost
  elements). Contrast with same-day drag (§1.4) where the original element
  stays. Width also changes with overlap layout (114 → 28 → 48 px), and
  `closest('[data-datekey]')` changes to the target day (28989 → 28990 → 28994).
- **Month view** (chip `MonthDrag`, Oct 20): dragging one cell right (+138 px),
  one cell left, one row down (+170 px) and one row up all keep the same
  `data-eventid`; each drop **replaces the chip element** (new element, id
  attribute set after insertion) and no dialog appears for a non-recurring,
  guest-less event. During drag 2 chips share the id (ghost), as in week view.
- **Time drift**: dragging horizontally with the pointer at the chip centre
  changed the start time by −15 min per drop in week view (10:00 → 9:30 over 2
  drops) — a grab-offset/snap artefact of my automation, not identity related;
  fixture restored via editor (`restore-fixture.mjs`).
- **Consequence for the SDK**: cross-day and month drags look like _remove old
  chip + add new chip with the same id_ → the "moved, not destroyed"
  reconciliation (cancel a pending destroy when the same `eventId` reappears
  within a frame or two) applies to **cross-day/cross-week moves but not
  same-day moves**, and must key on the id (+ instance) rather than the element.
  Any injected badge is lost with the replaced element and must be re-applied by
  the reconciler.
- Fixtures: added `[CALSDK] MonthDrag` (Oct 20 → currently Oct 20 10:00, month
  view); `Timed A` restored to Sep 30 10:00–11:00.

### 1.10 Dragging all-day chips (week view) [V: `drag-allday.mjs`, `drag-allday-recurring-multiday.mjs`]

- **Single-day all-day, +1 day**: `data-eventid` unchanged (`6fm815…`, no
  suffix); chip **element replaced** (`l5h`→`unp`), id attribute set after
  insertion; label date Sep 30→Oct 1. The _other_ all-day chip in the row was
  **kept** (same element) but reflowed vertically (y 172→148) when the row order
  changed. 3 chips shared the title during the drag (ghost).
- **Recurring all-day (weekly), +1 day**: same _Edit recurring event_ scope
  dialog as timed chips; with _This event_ the id stays `…_20260930` (original
  date suffix) although the chip now shows Oct 1 — same "suffix = original
  start" rule as timed instances (§1.2), here for `_YYYYMMDD`. Element replaced.
- **Multi-day event (3 chips), +1 day**: `data-eventid` unchanged on all chips;
  **chips were reused, not replaced** (2 of 3 elements survived with the same
  identity, one — the full-span chip — was removed) and their geometry changed
  (126→253 px); the visible chip count went 3→2 because the event's tail ran
  past the week boundary (Oct 4 is next week). Moving it back restored 3 chips
  (new elements, id attribute set after insert). So **multi-day drags mix reuse
  and replacement in one drop**.
- No dialog for non-recurring, guest-less all-day chips.
- Not tested: dragging an all-day chip into the timed grid (converts to timed?),
  all-day drag in month/schedule view, resize of an all-day chip's end.
- Fixtures restored: `AllDay` and `AllDay weekly` on Sep 30, `MultiDay` Oct 1–3.
  (The `AllDay weekly` Sep 30 instance is now a _modified_ instance — still at
  its original date.) Automation gotcha: `hasText:'AllDay'` also matches
  `AllDay weekly` — my first restore moved the wrong chip; use exact/negative
  matching.

### 1.11 All-day → timed conversion by drag [V: `drag-allday-to-timed.mjs`, `restore-allday-toggle.mjs`]

- Dragging the non-recurring `AllDay` chip from the all-day row down into the
  timed grid **converts the event to a timed event of the default 30-minute
  length** (landed 10:15–10:45 at the drop position, same day, no dialog).
  **`data-eventid` unchanged** (`6fm815…`, same event), chip **element
  replaced**, and the new element is `role=button`, has
  `tabindex`/`data-focusable`, and sits under a `[data-datekey]` (28990) unlike
  all-day chips (no datekey, no `role`) [V].
- Consequences: `isAllDay()` (and `getSegment()`, date anchor) **must be
  recomputed per render, never cached at view creation**, since the same
  `eventId` can flip between all-day and timed via a UI gesture; an `EventView`
  cannot infer allday-ness from the id.
- Restore: the editor's _All day_ checkbox (`input[aria-label="All day"]`) with
  start = end = Sep 30 returned it to an all-day chip (x=705, w=126) — the
  earlier fixture shape.
- Timed → all-day: see §1.12.

### 1.12 Timed → all-day [V for editor toggle; drag gesture INCONCLUSIVE — `drag-timed-to-allday-attempt.mjs`, `timed-allday-editor-toggle.mjs`]

- **Drag gesture: could not be reproduced with synthetic mouse events** (5
  attempts: straight up in the same column, into a different column's all-day
  cell, slow approach with hover jitter, with the timed grid scrolled to the
  top). In each case the drag ghost stayed **pinned to the top of the timed grid
  (`11:45pm – 12:45am`)** and never switched to an all-day pill; on drop nothing
  changed (still 10:00–11:00, no dialog, **no `data-eventid` mutations**).
  Whether real pointer input converts it is [X] — do not draw conclusions from
  this beyond "the all-day drop target was not triggered by Playwright's mouse".
- **Semantics via the editor's All-day checkbox** [V]: turning _All day_ on for
  `Timed A` keeps `data-eventid` (`40gfl3ep…`), the chip becomes an all-day pill
  (`role` absent, no `[data-datekey]` ancestor, height 24 px, in the all-day
  row, text `[CALSDK] Timed A|All day, …`); turning it off and re-entering
  10:00–11:00 (and the end date) restores the timed chip (`role=button`,
  `dk=28990`, h=46). So identity is stable across the all-day↔timed flip in
  **both** directions (§1.11 for the drag-into-grid direction).
- Fixture restored to Sep 30 10:00–11:00.

### 1.13 Drag in Day and Schedule views [V: `drag-day-schedule.mjs`]

- **Day view**: dragging `Timed A` vertically (+96 px, then −96 px):
  `data-eventid` unchanged, **same chip element retained** (same element
  identity across the drop, 0 `data-eventid` mutations), label updated in place,
  chip width re-laid out (499 → 881 → 220 px as overlaps changed), a same-id
  ghost chip present during the drag (2 chips). Same behaviour as same-day drag
  in Week (§1.4). No dialog for a non-recurring, guest-less event. (Time drifted
  10:00 → 9:45 across the two drops — my grab/snap artefact; restored via the
  editor.)
- **Schedule (agenda) view**: **not draggable.** The chip has neither
  `data-dragsource-type` nor `data-stacked…`; vertical (+140 px) and horizontal
  (+120 px) drags produced no ghost (1 chip only), no mutations and no dialog;
  the event stayed put. Attribute set of an agenda chip:
  `role, jsname, data-eventchip, data-opens-details, jscontroller, jsaction, jslog, data-eventid, data-keyboardactiontype, class`
  — **`data-dragsource-type` is absent**, which is a semantic hint that a chip
  is draggable (present on Week/Month/Day chips) [V for 5 views].
- Summary of same-day/other-day behaviour by view: Week/Day same-day = element
  kept; Week cross-day / Month = element replaced (§1.9); Schedule = no drag.

### 1.14 Keyboard "drag" [V: `keyboard-shortcuts-list.mjs`, `keyboard-move-attempt.mjs`]

- **There is no keyboard move/drag.** Calendar's in-app shortcut sheet (`?`)
  lists create (all-day / timed), edit (`e`), delete, save, focus-people-search
  and _"Announce event title/date and
  time/guests/rooms/description/attachments/notifications"_ (Alt+…) — nothing
  about moving or resizing. Empirically, with the `Timed A` chip focused, none
  of ArrowUp/Down/Left/Right, Shift/Alt/Ctrl/Ctrl+Shift/Alt+Shift +
  ArrowDown/Right, Space(+ArrowDown+Enter), `m`, `g` changed the event (label
  stayed `10am to 11am`; 0 `data-eventid` mutations), and no dialog other than
  the popover appeared.
- What the keys _do_ do (relevant to focus/lifecycle, not identity): plain
  arrows **move focus between day-group elements** (focus text like
  `"3 events, Thursday, …"`, `"2 all day events, We…"`,
  `"1 event, Tuesday, Se…"` — locale-dependent summary nodes) and back to chips;
  **Space on a focused chip opens the event popover** (24 attribute/child
  mutations, popover with Close/Edit/Delete) with no URL change; so popovers can
  open **without a pointer click** — the popover watcher must not depend on
  mouse events.
- Chips carry `data-keyboardactiontype="0;1"`; real chips have it, draft chips
  don't (§1.7). It appears to describe supported keyboard actions (open/… ) but
  its values were not decoded [X].
- Fixture unchanged.

### 1.15 Resizing all-day chips [V: `resize-allday-rz*.mjs`]

**All-day chips (week view) have no resize affordance; every edge gesture I
tried is a move.**

- DOM: an all-day chip (24 px tall) has 5 descendant nodes (`div.KF4T6b`, two
  `span`s with the title text, a 1×1 span, a 0×0 span) and **no handle/`resize`
  element**; hover produces no new nodes. `elementFromPoint` across the chip
  width shows the cursor is `pointer` everywhere (no `e-resize`/`ew-resize`),
  and the chip's right ~12 px (`126 → 114` wide inner div) is **not part of the
  chip** — it belongs to a different container (`div.qLWd9c`, cursor `auto`).
- Grabbing the single-day chip **inside** its right edge (x+112) and dragging
  +126 px **moved** the event +1 day (id unchanged, element replaced, dropped
  into the second all-day row) rather than making it 2 days long. Grabbing the
  _last segment's right end_ of the 3-day event and dragging −126 px **moved**
  the whole event −1 day (start x 832→705; chips `lv3`,`2z8` kept as elements
  with new positions, a new chip added) rather than shrinking it.
- Grabbing in the **12 px gutter** at the right of the chip (x+123) starts a
  _create-by-drag_ in the all-day row and opens the quick-create dialog
  (`Create | Event | Task | …`) instead — a reminder that pointer-driven
  automation near chip edges can create events.
- **Semantic hint** (**corrected**): an earlier draft of this section said timed
  chips have `data-dragsource-type=5`; that value had not been measured. Survey
  (`dragsource-type-survey.mjs`, Day/Week/Month/Schedule, 2026-09-29): **timed
  chips = `2`** (Day 8/8, Week 14/14 events, Week+Day tasks with a time),
  **all-day event chips = `6`** (Day 2, Week 5, Month 12; also all-day-style
  tasks in Month), **read-only birthday chips = `9`** (Week 1, Month 1; two
  Month holiday-calendar chips also `9`), **Schedule chips: attribute absent** —
  so it encodes the chip's drag class (timed / all-day /
  non-draggable-read-only), locale-independent [V for these views]. Values are
  Google-internal enums; treat as grade B and re-verify in the compat run. chips
  (Schedule: absent, not draggable) — so the attribute encodes the chip's _drag
  class_, a locale-independent timed-vs-all-day discriminator [V for Week;
  Month/Day values not recorded].
- Fixtures restored (`AllDay` Sep 30, `MultiDay` Oct 1–3). Changing an all-day
  event's length is only possible via the editor's End date (§1.11 restore).

### 1.16 Calendar-id abbreviation table and Workspace status [V for 4 suffixes; Workspace custom domain NOT tested — `calendar-id-abbreviations.mjs`, `subscribe-ics-calendar.mjs`]

**No Workspace / custom-domain account was available** (both test accounts are
consumer `@gmail.com`), so custom-domain user calendars (`user@company.com`) and
Workspace resource calendars (`…@resource.calendar.google.com`) are **untested
[X]**. What could be verified with consumer accounts:

| Full calendar id suffix (from `jslog` field 1) | `data-eventid` abbreviation | How obtained                                                                                                                   |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@gmail.com`                                   | `@m`                        | own calendar                                                                                                                   |
| `@group.calendar.google.com`                   | `@g`                        | created secondary calendar                                                                                                     |
| `@group.v.calendar.google.com`                 | `@v`                        | subscribed Google holiday calendars (Poland; US via public `.ics` URL resolved to the same native holiday id — _no_ `@import`) |
| `@import.calendar.google.com`                  | `@i`                        | subscribed a **third-party `.ics` URL** (`Add calendar → From URL`; id `<32 chars>@import.calendar.google.com`)                |

- This is a **fixed suffix table** (first letter of the distinguishing part),
  not a generic transform; with four rows consistent, the hypothesis that
  unknown suffixes (custom domains, `resource.calendar.google.com`) are left
  **unabbreviated** is plausible [H] but unverified. The plan's design (learned
  `abbrev → full` map from `jslog` field 1, never a hard-coded table; unknown →
  `calendarId:null` + raw hint) already covers this.
- **Decoder consequence**: a custom-domain id contains `@` and dots inside the
  calendar part; the decoder must split `eventId[_instance]` from the calendar
  part on the **first space only** and must not assume the calendar part matches
  `[a-z]@[a-z]`. Add a unit test with `alice@example-corp.com` style input
  (synthetic) — behaviour of Calendar itself for such ids stays [X].
- Plain `jslog` field 1 held the full id for all subscribed calendars seen
  (`en.usa#holiday@group.v.calendar.google.com`,
  `<hex>@import.calendar.google.com`).
- Fixtures added on the main test account: subscriptions to _Holidays in United
  States_ and the third-party US Holidays `.ics` (id
  `…@import.calendar.google.com`).

### 1.17 Timezones, themes and density [V: `appearance-matrix.mjs`, `appearance-density-restore.mjs`, `timezone-primary.mjs`, `timezone-secondary.mjs`]

Settings were changed on the main test account and **restored afterwards**
(theme _Device default_, density _Comfortable_, primary tz Warsaw, secondary tz
off). Week view, 21–23 chips, `compat.mjs` 26 checks run in each state.

| State                                                                                              | What changed                                                                                                                                                            | What did not                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dark theme** (Settings → Appearance → Dark)                                                      | chip background `rgb(3,155,229)` → `rgb(75,153,210)`, body background white → `rgb(19,19,20)`                                                                           | `<html>` attributes (`data-prefetch-view-key`, `data-ui-kind=10`, `data-base-title`), chip attribute set, chip count (22), `data-dragsource-type`, `[role=main][data-period-type]`; compat **26/0/0** |
| **Density** (Appearance → _Information density_: options `responsive` / `comfortable` / `compact`) | timed chip height **46 px (comfortable) → 38 px (compact) → 58 px (responsive at 1300×950)**                                                                            | every attribute and selector; compat 26/0/0 in all three. Geometry-based logic (drag distances, hit boxes, virtual row math) must not hard-code pixel sizes                                           |
| **Primary time zone** Europe/Warsaw → America/Los_Angeles                                          | chip labels shift (`1pm to 2pm` → `4am to 5am`, `10am` → `1am`); a chip's date can change (`TZCross`, Warsaw Oct 2 01:00 → Oct 1 16:00 in LA); page `<title>` unchanged | **All 21 `data-eventid` values identical** in both zones (ids and recurring-instance suffixes are UTC-based), `data-datekey` for same-day events, `<html>` attributes; compat 26/0/0                  |
| **Secondary time zone** (Tokyo) with primary LA                                                    | a second gutter column: time labels `GMT+09` and `GMT-07` both present, chips shift right ~32 px (x 703→735)                                                            | chip/selector set, `[data-datekey]` count (21), compat 26/0/0                                                                                                                                         |

- **Identity is timezone-independent** — this confirms the earlier hypothesis
  that `_YYYYMMDDTHHMMSSZ` suffixes are UTC. Any _date_ the SDK derives from
  labels or `[data-datekey]` is in the **viewer's primary tz** and can differ
  from the event's own date in another tz; provide UTC via a dataProvider or
  from the instance suffix, never from label text.
- **New overlay: "Change time zone to (GMT+02:00) Central European Time -
  Warsaw? — Yes / No / Never ask again / Settings"** appears on load whenever
  the browser's tz differs from the calendar's primary tz (setting "Ask to
  update my primary time zone to current location" = on). Plain `[role=dialog]`
  (no `data-chips-dialog`), it **blocks pointer input** (scrim
  `div.uW2Fw-IE5DDf`) exactly like the notification and Meet coach-mark
  overlays; `compat.mjs` now clears `Dismiss`/`Got it`/`No` dialogs and reports
  `INFO overlays dismissed: …`. Clicking _Yes_ changes the account's primary
  time zone (a side effect).
- `<html data-ui-kind>` stayed `10` across all theme/density/tz states → it is
  **not** a theme/density fingerprint; it remains a candidate for
  experiment/variant detection only.
- Not tested: Workspace-managed settings, 12/24-hour clock, week-start day,
  "High contrast", RTL locales, forced dark via OS (`prefers-color-scheme`) —
  Device-default theme was left in place and
  `matchMedia('(prefers-color-scheme: dark)')` was false during tests [X].
- Fixture added: `[CALSDK] TZCross` (Oct 2 01:00–02:00 Warsaw) for date-boundary
  checks; a stray subscription to a 404 `.ics` URL created during the Workspace
  test was removed.

### 1.18 Pre-implementation audit findings [V: `audit-*.mjs`]

**1. Trusted Types: enforced for page/MAIN-world code and for CDP-created
isolated worlds, but NOT for a real extension content script** (**corrected** —
an earlier draft, based only on CDP `Page.createIsolatedWorld`, called this a
critical constraint on all SDK UI code). The document response carries
`Content-Security-Policy: … require-trusted-types-for 'script'` (plus a
nonce/`strict-dynamic` script-src).

| Operation                                                                                   | Page main world / CDP isolated world                         | **Real MV3 content script (Chrome 154)** [V `extension-smoke.mjs`]                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `el.innerHTML = '<b>…'`, `insertAdjacentHTML`, `template.innerHTML`, `shadowRoot.innerHTML` | **Throws** `This document requires 'TrustedHTML' assignment` | **Allowed** — detached `div`, an element attached inside a chip, and `document.body.insertAdjacentHTML` all worked |
| `createElement` + `textContent` + `setAttribute` + `style.*`, SVG via `createElementNS`     | works                                                        | works                                                                                                              |
| `trustedTypes.createPolicy(<any name>)` + `createHTML`                                      | works (no `trusted-types` allow-list directive)              | works                                                                                                              |
| `<style>` element / inline style attribute                                                  | applies                                                      | applies (computed colour verified)                                                                                 |
| `data:` image; `chrome-extension://` image (web-accessible resource)                        | loads                                                        | both load (16×16 icon, `naturalWidth` 16)                                                                          |

- **Implication:** SDK code that runs in the content script (everything in V1)
  may use HTML strings; InboxSDK's `innerHTML`-based widgets are **not**
  blocked. HTML-string sinks remain forbidden in any **MAIN-world** shim
  (`src/injected-js/`), and DOM builders are still preferable for robustness
  (Firefox behaviour untested [X]). The ESLint ban is therefore scoped to
  `src/injected-js/**` only.
- Lesson recorded: CDP isolated worlds are _not_ a faithful model of content
  scripts for CSP/Trusted Types (they were faithful for the Navigation API, DOM
  reads and observers — re-verified in the real extension).

**2. Load timing** (3 runs, from navigation commit):
`<html data-prefetch-view-key>` and `navigation` at ~0.4 s; `#xUserInfo`,
`#initialdata`, `[role=main]` at ~1.0 s (around DOMContentLoaded); first
`[data-eventchip]` **2.2–3.1 s** (async render). The SDK must not assume chips
exist at load or `document_idle`; observe from `document.body` and treat "no
chips yet" as normal.

**3. Delete** (temporary `[CALSDK] DeleteMe`): popover → _Delete event_ → chip
removed immediately, **no confirm dialog**, a live region announces
`Event deleted` (aria-live text also: `Loading...`, `Loaded`). Delete of
recurring instances / guest events [X].

**4. The live view signal is `<body data-viewkey>` / `data-viewfamily`, NOT
`<html data-prefetch-view-key>`** (correction of an earlier draft;
`audit-in-spa-view-key.mjs`). `<html data-prefetch-view-key>` is written **at
page load and never updated by in-app navigation**: after `m`, `d`, `y`, `a`,
`x`, the editor and settings it stayed `WEEK` while the URL,
`<body data-viewkey>` and `[role=main][data-period-type]` all changed. (My
earlier route table came from full page loads only, where the two agree.) Body
values: `WEEK`/`MONTH`/`DAY`/`YEAR`/`AGENDA`/`CUSTOM_DAYS` with family `EVENT`;
`EVENTEDIT` with family `EVENT_EDIT`; `SEARCH` with family `SEARCH`; settings
pages `GENERALSETTINGS`/`CREATECALENDAR`/`CALENDARSETTINGS` (and
`ADD_CALENDAR_BY_URL`) with family `SETTINGS`. Load-time `html` values for
settings are `GENERAL_SETTINGS`, `CREATE_CALENDAR`, `ADD_CALENDAR_BY_URL`
(underscored, and stale after in-SPA moves between settings pages).

**5. Drag-ghost discriminator (resolved)** [V
`audit-drag-ghost-discriminator.mjs`]: during a drag two `[data-eventchip]`
elements share the id. The **source** chip stays in `[role=main]` with
`pointer-events:none; opacity:0.5`; the **ghost** is `opacity:1`, has an extra
attribute `ssk`, and lives **outside `[role=main]`** (different container
subtree, not under any `[data-datekey]` row of the grid's own container chain:
ancestors `div.uEzZIb > div.wbilU`). Both have
`jsaction`/`data-keyboardactiontype`, so the _draft-chip_ rule (§1.7) does not
apply. **Rule: an `EventView` chip must be inside `[role=main]`** (excludes
ghosts); optionally also skip chips with `pointer-events:none` (source during
drag). **6. `#xUserInfo` structure** [V `audit-settings-routes-xuserinfo.mjs`]:
hidden div with five children by id: `#xUserEmail` (email), `#xUserName` (empty
for this account), `#xTimezone` (IANA, e.g. `Europe/Warsaw`), `#xGmtOffset` (ms,
`7200000`), `#xUserLocale` (`en`). These back
`User.getEmailAddress/getTimeZone/getLanguage` directly (grade A ids).
`#xTimezone` reflects the calendar's tz as observed after load; whether it
tracks the primary-tz setting live is [X]. **7. Settings routes** [V]:
`/r/settings`, `/r/settings/createcalendar`, `/r/settings/addbyurl`,
`/r/settings/calendar/<base64url(calendarId)>` are distinct routes with
`body[data-viewfamily=SETTINGS]`; the token is the base64url of the _full
calendar id_ (`Z21jYXJl…` decodes to the owner's email). `RouteType.SETTINGS` is
therefore verifiable and included in V1. **8. Search/Schedule chip text encodes
the segment**: a 3-day event's three search chips read
`[CALSDK] MultiDay (Day 1/3)`, `(Day 2/3)`, `(Day 3/3)` (locale-dependent text)
— a text-based cross-check for `EventView.getSegment()` in those views only.
**9. Popover cycle**: chip elements persist while their injected children are
stripped (§4). **10. Containers** (`an.mjs`): `div#yDmH0d` is an _empty overlay
host_ under `<body>` holding popovers/dialogs only while open; `[role=main]` and
all chips are under `div#YPCqFe` (generated id). **`#yDmH0d` does not contain
`[role=main]`** (an earlier draft said it did; the compat runner caught it). One
observer on `document.body` covers both.

## 2. DOM lifecycle [V: `life.mjs`, `stale.mjs`, `stale2.mjs`]

| Behaviour                          | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node reuse                         | **RETRACTED (earlier draft claimed in-place reuse).** `reuse.mjs` (records `oldValue` and element identity): on Next-week 19 events, 2 `data-eventid` mutations, **0 on pre-existing chip elements**, all `oldValue == null`, all on newly created elements (new element ids); Prev-week 14 mutations, again **0 on pre-existing elements, 0 non-null oldValue, 0 pre-existing elements re-added**. Calendar creates _new_ chip elements and sets `data-eventid` after insertion (attribute-set on a fresh node), and removes old ones. **No in-place reuse was observed in week navigation** [V]. Reuse in other flows (drag, popover re-render, month↔week) is untested [X]. |
| Consequence                        | Elements are recreated on navigation, so `WeakMap<Element, EventView>` fits what was observed. **Defensive rule kept as [H]**: still bind a view to _(element, eventId)_ and treat any later `data-eventid` change on a live element as end-of-view + new view, because Google can change rendering strategy and because the attribute is set _after_ insertion (the observer must not read the id at `addedNodes` time — it may be absent; wait for the attribute mutation or read on the next frame).                                                                                                                                                                         |
| View switch (week↔month↔day)     | Whole chip set removed and re-added (14/14) — full rebuild.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Foreign DOM inside the grid        | Injected `<span>` appended **into** chips and as chip **siblings**: survived hover and window resize (14/14) but **all 28 nodes were removed when a popover opened**, while the chip count stayed 14. Calendar (incremental-DOM) re-renders the grid subtree and strips unknown nodes. Injected chrome must be _self-healing_ (reconcile per render) or rendered in an SDK-owned overlay layer. Chip _elements_ are **not** replaced on popover open — only their children are stripped (§4).                                                                                                                                                                                   |
| Injected DOM after navigation      | After Next/Prev all 14 injected badges were gone (`badged: 0`) — consistent with elements being _replaced_ (see Node reuse row), not with wiping in place. Nothing was left on the wrong event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Virtualisation                     | Timed grid is scrollable but all 14 chips in the week were present; not enough events to say [X].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Multiple copies during transitions | Not observed in 1.8 s samples; no finer-grained sampling yet [X].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| URL vs DOM ordering on navigation  | URL/title change first (`navigate` event at t≈3017 ms, `currententrychange` +2 ms); chip DOM rewrite follows [V, ordering from `pop.mjs`; DOM timestamps not captured — [X]].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 3. Routing [V: `views.mjs`, `life2.mjs`, `iso.mjs`]

Path-based, no hash: `/calendar/u/<n>/r/<view>[/<y>/<m>/<d>]`. **Important
correction:** `<html data-prefetch-view-key>` in the table below is the value
_at page load_; it is **not** updated by in-app navigation. The live view signal
is `<body data-viewkey>` (+ `data-viewfamily`), see §1.18 item 4.

| Path                                                   | `<html data-prefetch-view-key>`       | `[role=main][data-period-type]`                                               |
| ------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------- |
| `/r/day`                                               | `DAY`                                 | _(absent)_                                                                    |
| `/r/week`                                              | `WEEK`                                | `week`                                                                        |
| `/r/month`                                             | `MONTH`                               | `month`                                                                       |
| `/r/year`                                              | `YEAR`                                | absent                                                                        |
| `/r/agenda`                                            | `AGENDA`                              | absent                                                                        |
| `/r/customweek` → rewritten to `/r/customday`          | `CUSTOM_DAYS`                         | absent                                                                        |
| `/r/4day`                                              | `DAY` (grid empty: not a valid route) | absent                                                                        |
| `/r/search?q=…`                                        | `SEARCH`                              | absent                                                                        |
| `/r/eventedit/<eid>` and `/r/eventedit?text=…&dates=…` | _(not re-checked)_                    | `role=main` re-created with a different `jscontroller`, no `data-period-type` |

- `<html>` also carries `data-ui-kind="10"` and `data-base-title` → **candidate
  variant fingerprint** [H until seen differ].
- "Today" navigates to a **dateless** `/r/week` (`Today` button, key `t`) — the
  date must come from the DOM/title, not the URL.
- Navigation uses `history.pushState`: Navigation API `navigate` events
  (`navigationType:"push"`, `userInitiated:false`) fired for Next/Prev and
  back/forward gave `popstate`. A `pushState`/`replaceState` monkeypatch
  installed _after_ page load saw **nothing** for Next/Prev (cause unproven —
  Calendar may hold pre-bound references or call from another context), whereas
  `page.addInitScript` patching at document start did catch `replaceState` on
  load. **Therefore:** hooking History from an isolated-world content script is
  unreliable; use the **Navigation API**
  (`navigation.addEventListener('navigate' | 'currententrychange')`).
- **Navigation API works in an isolated world** [V: `iso.mjs`, via
  `Page.createIsolatedWorld`]: an isolated-world listener received the `push`
  events. So **routing needs no MAIN-world code** in Chromium. Not available in
  Firefox/Safari of the day [H] → fallback = MutationObserver on
  `<body data-viewkey>`/`data-viewfamily` + `<title>` + `popstate`.
- Title updates in the same tick as URL (`currententrychange` handler saw the
  new title).
- Popover open/close does **not** change the URL [V].
- Editor Cancel returns to the previous grid route [V].

Proposed `RouteType` (verified names in bold):
`DAY, WEEK, MONTH, YEAR, AGENDA (=Schedule), CUSTOM_DAYS, SEARCH, EVENT_EDIT, UNKNOWN`
plus **`SETTINGS`** (family `SETTINGS`, §1.18 item 7). Classify via
**`body[data-viewkey]`/`data-viewfamily`** first and URL second (they can
disagree for a frame during transitions [X]); never via the `<html>` attribute
after load.

## 4. Popover and editor

- **Popover** [V `pop.mjs`, `audit-popover-cycle-shell.mjs`]:
  `div[role=dialog][data-chips-dialog=true][aria-modal=true][data-layout-mode=bubble]`
  with `jscontroller`. **Ancestry** (measured): `[role=dialog]` → `div.QSj8ac` →
  `div.I2Yrs` → **`div#yDmH0d`** → `body`. Popovers are therefore _inside_
  `#yDmH0d`, an **overlay host**: a direct child of `<body>` with **0 children
  when no dialog is open**, not the app root — the grid (`[role=main]`, all
  chips) sits in a different subtree under `div#YPCqFe` (generated id, grade C);
  the two wrapper class names are generated and must not be used. Contains
  `button[jsname=DyVDA]` (edit), `button[jsname=VkLyEc]` (delete),
  `button[jsname=HTRTyd]` (email details) (`jsname`s locale-independent on `de`
  [V]; aria-labels are not). Contains the chip's `data-eventid`. Closes on
  Escape. Opens with **no URL change**, by mouse click or Space on a focused
  chip.
- **Popover open re-renders the grid but does not replace chip elements** [V
  `audit-popover-cycle-shell.mjs`]: 23/23 chip elements were the same objects
  before/after open and after close, yet all 23 injected marker children were
  removed on open. So Calendar strips foreign _children_ of persisting elements
  — an injected node can vanish from a live chip without any chip mutation.
  (Resolves the earlier "replaced vs cleaned" question: **cleaned**.)
- **Other dialogs share the overlay layer** and are _not_ popovers: notification
  permission prompt ("Want to get better notifications?"), Meet coach-mark ("Got
  it"), "Change time zone to …?" (§1.17), recurring-edit scope dialog (§1.8),
  guest-update confirm (§1.8), create-invite confirm, calendar removal confirm.
  The event-popover discriminator is in §1.7 (`data-chips-dialog` + no form
  controls + `data-allow-wheel-scroll=false`); presence of `[data-eventid]` is
  **not** sufficient (quick-create has one).
- **Editor**: full-page route, not a modal. `input[aria-label=Title]`
  (`jsname=YPqjbf`), Save `[jsname=x8hlje]`, Cancel `[jsname=gQ2Xie]`, plus
  Start/End date/time, All day, Guests, guest-permission toggles. _Save_ on an
  event with guests raises "send invitation emails?" (Back to editing / Don't
  send / Send) [V §1.8, second-account section]; on a recurring instance the
  scope dialog (§1.8).
- **Event-creation URL template works**:
  `/r/eventedit?text=…&dates=YYYYMMDDTHHMMSS/…&recur=RRULE:…&add=<email>&src=<calendarId>`
  → editor prefilled (used by `seed.mjs`).
- **Delete** (§1.18): popover _Delete event_ removes a plain event's chip
  immediately, with no confirm dialog, and announces "Event deleted" in an
  aria-live region.

## 5. Grid structure hints [V]

`[role=main]` → `[role=grid]` (2 in week/month) → elements carrying
`data-datekey`. **The carrier element type differs per view** [V `dk.mjs`]: week
= `div[role=gridcell]` + `li` + `button` (7 each); month = `div` + `h2` (35
each); agenda = `div[role=rowgroup]` (28). Only the bare `[data-datekey]`
selector is view-independent (an earlier draft of this doc said
`[role=rowgroup][data-datekey]`; the compat runner caught that as wrong — see
`compat.mjs`). `data-datekey` = `((year-1970)<<9) | (month<<5) | day` — [V] on 6
consecutive week cells (28987 = 2026-09-27 … 28994 = 2026-10-02; 29025 =
2026-11-01). Month/year-boundary and negative cases: [X].
`chip.closest('[data-datekey]')` yields a **locale-independent date** for 9/14
week chips, 39/39 agenda chips and **0/14 month chips** (month chips are not
descendants of the datekey nodes) [V]; all-day/multi-day chips have none in week
view. So a chip's date is _not_ uniformly derivable from DOM ancestry → use the
popover/route/`dataProvider` for dates, and treat `getDate()` as a LATER API.

## 6. Page-world state [V: `iso.mjs`, `init.mjs`]

Readable from an **isolated world** (no MAIN needed):

- `document.getElementById('initialdata')` — ~18 KB JSON-ish bootstrap
  containing the user's email, calendar list and event IDs; `#xUserInfo` (hidden
  node with children `#xUserEmail`, `#xUserName`, `#xTimezone`, `#xGmtOffset`,
  `#xUserLocale`, §1.18); `#timezonedata`; `<html lang>`.
- `navigation` (Navigation API), DOM, `location`, `document.title`, all DOM
  events.

Present **only in MAIN**: `window.WIZ_global_data` (keys
`CTox0e,K1cgmc,TSDtV,nQyAE,wd3Loc`), `window.gapi`, `window.google`,
`window._F_toggles`. Values not inspected/needed. **Conclusion: nothing required
for V1 needs MAIN-world execution** — user email/locale come from the DOM;
identity from `data-eventid`; routing from Navigation API. MAIN would only be
needed for `fetch`/XHR interception (see §7), and only as an optional
accuracy/cross-check feature.

## 7. Network [V: `net.mjs`, initial `probe.mjs`]

- Bootstrap/sync endpoints on `calendar.google.com`:
  `POST /calendar/u/0/sync.prefetcheventrange` (per calendar, per **day-number
  range** — `[null,null,20751,20757]` = epoch-day bounds),
  `POST /calendar/u/0/sync.sync`, `POST /calendar/u/0/secondarycalendars`.
- Transport: **XHR** for all 18 observed `sync.*` calls (Playwright
  `resourceType: xhr`) [V] — so InboxSDK's `xhr-proxy-factory` is directly
  reusable if a tap is ever added; `$rpc` (clients6) calls not classified [X].
- Request: `application/x-www-form-urlencoded`, body
  `f.req=<url-encoded JSON array>` containing the calendar ID and build id
  (`calendar.web_20260923.07_p0`).
- Response: `application/json` with XSSI prefix `)]}'` then positional arrays
  (`["prefetcheventrangeaction.perr",0,[…]]`).
- Other Google services:
  `calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.*`
  (gRPC-web-JSON style), `peoplestack-pa`, `play.google.com/log` (telemetry).
- Navigating to already-cached ranges issues **no** requests (Next/Prev week
  fired none) — network interception cannot be the primary signal for "what is
  on screen".
- The prefetch response for the account calendar contained the fixture title
  string (`hasTitle:true`) — so event data does travel this way; whether the
  response carries the event ID in a stable position was **not established**
  (the sampled ranges excluded the fixture day) [X].
- Assessment: **fallback/diagnostic only**. Positional, undocumented, versioned
  by build string. DOM already yields identity, so network parsing is
  _unnecessary for V1_; keep it as an optional MAIN-world verifier and as a
  **structure-change canary** (shape hash of `f.req`/response).

## 8. Confirmed selector inventory (candidate registry keys)

Ranking: A = attribute that is semantic/functional and observed
locale-independent; B = `jsname`/`jscontroller` (locale-independent on `de` [V],
stability across builds [H]); C = ARIA label text (locale-dependent); D =
generated class (never use).

| Proposed key                        | Candidate selectors (best first)                                                                                                   | Grade               | Verified                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------- |
| `overlayHost`                       | `#yDmH0d` (empty until a popover/dialog opens; does **not** contain `[role=main]`)                                                 | B                   | [V]                                      |
| `contentRoot`                       | `[role=main]` (avoid `#YPCqFe`, generated)                                                                                         | A                   | [V]                                      |
| `viewKey`                           | `body[data-viewkey]` (live) with `body[data-viewfamily]`; `html[data-prefetch-view-key]` is **load-time only** (§1.18)             | A                   | [V]                                      |
| `mainRegion`                        | `[role=main]`                                                                                                                      | A                   | [V]                                      |
| `mainPeriodType`                    | `[role=main][data-period-type]`                                                                                                    | A (week/month only) | [V]                                      |
| `eventChip`                         | `[data-eventchip]`                                                                                                                 | A                   | [V] every view except Year (no chips)    |
| `eventChipId`                       | `[data-eventchip][data-eventid]` (attribute value)                                                                                 | A                   | [V]                                      |
| `chipDragClass`                     | `[data-eventchip][data-dragsource-type]` (`2` timed, `6` all-day, `9` read-only, absent in Schedule)                               | B                   | [V] (§1.15)                              |
| `dateCell`                          | `[data-datekey]` (carrier element varies by view)                                                                                  | A                   | [V]                                      |
| `eventPopover`                      | `[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]` with no `input`/`textarea` descendant (§1.7)                     | A/B                 | [V] 12/12 dialogs                        |
| `popoverEditButton`                 | `[role=dialog] button[jsname=DyVDA]`, then `button[aria-label="Edit event"]` — **absent on read-only shared events and birthdays** | B, C                | [V]                                      |
| `popoverDeleteButton`               | `button[jsname=VkLyEc]`, `button[aria-label="Delete event"]`                                                                       | B, C                | [V] (absent on read-only shared)         |
| `popoverRsvpYes/No/Maybe`           | `button[jsname=lezaG]` / `TtJ8Me` / `EVpSp` (invitee only)                                                                         | B                   | [V]                                      |
| `taskMarkDone`                      | `button[jsname=xFuBUb]` in a task popover                                                                                          | B                   | [V]                                      |
| `editorTitle`                       | `input#xTiIn`, `input[aria-label=Title]` — **`jsname=YPqjbf` is shared by every text input on the page, do not use it**            | C, B                | [V] en                                   |
| `editorSave` / `editorCancel`       | `#xSaveBu` / `#xCancelBu`, then `button[jsname=x8hlje]` / `button[jsname=gQ2Xie]`                                                  | B                   | [V]                                      |
| `editorAllDay`                      | `input[aria-label="All day"]`                                                                                                      | C                   | [V] en only                              |
| `appHeader`                         | `header#gb[role=banner]`                                                                                                           | A/B                 | [V]                                      |
| `todayButton`                       | `header button[jsname=P6mm8]`                                                                                                      | B                   | [V] (label `Today, <date>` locale)       |
| `prevButton` / `nextButton`         | `header button[jsname=VfNHU]` / `[jsname=OCpkoe]` (labels `Previous/Next <period>`)                                                | B                   | [V]                                      |
| `searchButton`                      | `header button[jsname=KzBUhd]`                                                                                                     | B                   | [V]                                      |
| `viewSwitcher`                      | `header button[jsname=jnPWCc]` (label `<View> arrow_drop_down`), also `[jscontroller=ClYlbc]` day/week buttons                     | B                   | [V]                                      |
| `filterViewButton`, `supportButton` | `header button[jsname=JZwYh]`, `[jsname=M842Cd]`                                                                                   | B                   | [V]                                      |
| `settingsMenuButton`                | `header button[aria-label="Settings menu"]` (only `jscontroller=PIVayb`, no `jsname`)                                              | C                   | [V] en                                   |
| `miniCalendar`                      | `table[role=grid][aria-label="<Month YYYY>"]` in the left column                                                                   | C (label)           | [V]; structural selector [X]             |
| `sidebarRight` (side panel)         | `[role=complementary]` (e.g. "Booking pages")                                                                                      | A                   | [V]                                      |
| `calendarList`                      | left column checkboxes (`input[type=checkbox]` labelled with calendar name)                                                        | C                   | [V] listing only; container selector [X] |
| `createButton`                      | `button[jsname=s8lWfb]` (menu label `Create appointment`; the header _Create_ dropdown differs)                                    | B                   | [V]                                      |

Uncatalogued: the exact structural selector for the mini-calendar and left
sidebar containers, tasks side panel, and search-suggestion popups — required
only for `Sidebar`/`Toolbar` LATER APIs.

## 9. Open experiments (state at end of Phase 0 investigation)

Resolved during this investigation: second account, moved recurring instance,
series split, all-day instance move, calendar-ID abbreviations (four suffixes),
drag/resize (same-day, cross-day, month, all-day, recurring, guest, Day,
Schedule), keyboard move (does not exist), quick-create, Tasks/Birthdays, locale
(`de`), theme/density/timezone, popover element persistence, Trusted Types,
delete flow, shell selectors.

Still open, in priority order:

1. **Workspace account** (custom-domain ids `user@company.com`, resource
   calendars, Workspace-managed defaults, possibly different `data-ui-kind`).
2. **Real extension content-script run**: everything so far used CDP isolated
   worlds and Playwright main-world scripts. Confirm in a real MV3 extension
   that (a) Navigation API events, (b) `#xUserInfo`/`#initialdata` reads, (c)
   DOM injection, (d) a `MutationObserver` on `document.body` all behave the
   same (Phase 2 exit criterion).
3. **Timed → all-day drag with real pointer input** (synthetic mouse never
   triggered the all-day drop target, §1.12).
4. **Scale/virtualisation**: fixtures have ≤ 40 chips; behaviour with hundreds
   of events (virtualised rows? "+N more" in month) untested. Create a 300-event
   synthetic day/week or use a busy Workspace calendar.
5. **Grid-slot click quick-create**, and **rapid navigation** (holding `n`,
   double-clicking Next) for transient duplicate/leaked chips.
6. Other locales incl. RTL and CJK (`ja`, `ar`, `he`), non-Gregorian calendars;
   12/24-hour clock; week-start day; high-contrast.
7. Forced OS dark (`prefers-color-scheme`), narrow windows (< 768 px, mobile
   layout: are `[data-eventchip]` and popovers the same?).
8. Delete of a recurring instance / guest event; undo ("Event deleted" → Undo)
   effects on ids; restore-from-trash.
9. `data-keyboardactiontype` values, `data-ui-kind` values on other accounts.
10. Network: event id position in `sync.*` responses (canary only); `$rpc`
    transport type.
11. Firefox/Safari support (Navigation API absent) — only if a non-Chromium
    target is wanted.

### 1.19 Popover DOM structure [V: `extension-popovers.mjs`]

`[role=dialog][data-chips-dialog]` > `span[jsname=bN97Pc]` > holder `div` that
carries `data-eventid` > header row + body `div[jsname=sV9x3c]` (tasks add a
footer). The holder is the identity source and the injection parent. Calendar
strips injected children when it re-renders the popover; the holder persists.
Escape does not close a Space-opened popover and rapid click/Escape can desync
Calendar's popover state — both happen without any SDK.

### 1.20 Editor page [V: `extension-editor.mjs`]

- Title `input#xTiIn` (`aria-label=Title`), Save `button#xSaveBu`, Cancel
  `button#xCancelBu`. `jsname=YPqjbf` matches **13 inputs** on the editor and
  the sidebar's people search on the grid — never use it as the title key.
- Save on an edited recurring instance opens the scope dialog; on an event with
  guests, the "send invitation emails?" dialog. The editor route and
  `body[data-viewkey=EVENTEDIT]` stay throughout. Cancel on an edited (or
  prefilled) editor opens `role=alertdialog` "Discard unsaved changes?" with
  Cancel / Discard.
- Save with no dialog returns to the grid (`/r`, WEEK) and ends the route.
- A task popover's "Edit" does not navigate to `/r/eventedit` (URL unchanged);
  birthdays have no Edit.

### 1.21 Locales, narrow windows, browser time zone [V: `extension-locales.mjs`, `extension-coverage.mjs`, `extension-timezone.mjs`]

- `?hl=de|pl|ja|zh-CN|ar|he` localizes the UI (`html[lang]`, `dir=rtl` for `ar`
  and `he`); `body[data-viewkey]`, `[role=main]`, chip attributes, popover
  discriminator and the editor ids (`#xTiIn`, `#xSaveBu`, `#xCancelBu`) are
  identical, so none of the aria-label fallback rungs was needed.
- Windows of 700 px and 420 px keep the same structure (23 chips, `[role=main]`,
  header); popovers are the same dialogs.
- Changing the **browser** zone under a running page (CDP override) does not
  move the grid: Calendar renders in the account's zone (`#xTimezone`). Identity
  (`data-eventid`, instance suffix = original UTC start) is unaffected.
- Month view with the fixtures shows 15 events, 1 task, 1 birthday; the task and
  birthday chips are ordinary `[data-eventchip]` elements with `ttb_`/`bday_`
  ids and get badges like events.
