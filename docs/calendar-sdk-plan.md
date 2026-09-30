# Calendar SDK — technical implementation plan

Companion docs:
[`inboxsdk-architecture-analysis.md`](./inboxsdk-architecture-analysis.md) (what
to reuse/delete),
[`calendar-reverse-engineering.md`](./calendar-reverse-engineering.md) (verified
Calendar behaviour),
[`calendar-compatibility-testing.md`](./calendar-compatibility-testing.md)
(repeatable investigation + change detection). Evidence tags used here: **[V]**
verified in the reverse-engineering log, **[H]** hypothesis, **[X]** experiment
pending.

## 0. Coverage map: brief → documents

| Brief item                                                           | Where                                              |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| 1 InboxSDK architecture, KEEP/REPLACE classification, dependency map | `inboxsdk-architecture-analysis.md` §2–§4          |
| 2–3 Calendar investigation, DOM lifecycle                            | RE log §1–§4 (incl. §1.4–§1.18), §2                |
| 4 Selectors                                                          | RE log §8; plan §6                                 |
| 5 Routing                                                            | RE log §3; plan §8                                 |
| 6 Event identity                                                     | RE log §1; plan §5                                 |
| 7 Network                                                            | RE log §7                                          |
| 8 Page-world state                                                   | RE log §6, §1.18; plan §9                          |
| 9 Calendar API / data provider                                       | plan §10                                           |
| 10 V1 public API                                                     | plan §4                                            |
| 11–12 Architecture, `CalendarDriver`                                 | plan §3                                            |
| 13 Performance / observation                                         | plan §7 (scale test still open)                    |
| 14–16 Investigation system, change detection, UI experiments         | `calendar-compatibility-testing.md` §1–§3          |
| 17 Test strategy                                                     | `calendar-compatibility-testing.md` §4             |
| 18 Milestones                                                        | plan §12, §14                                      |
| 19 Unknowns                                                          | plan §15, RE log §9                                |
| 13a Project setup, support matrix, versioning                        | plan §16                                           |
| — Decisions still needed from the owner                              | plan §17                                           |
| 20 Docs in repo                                                      | this directory; harness in `tools/calendar-probe/` |

## 1. Feasibility summary

**Feasible, with one design constraint that differs from Gmail.** Calendar
exposes far better identity than Gmail: each event chip carries `data-eventid`
(base64url of `eventId[_instance] calendarAbbrev`), so _DOM → event identity
needs no network interception and no MAIN-world code_ [V]. Routing is observable
through the Navigation API from the isolated world [V]. The hard parts are (a)
**DOM churn and self-cleaning re-renders** (chips are recreated on navigation
and their `data-eventid` is set _after_ insertion; Calendar strips foreign DOM
from its grid on re-render) [V], and (b) **detecting Google UI changes early** —
everything is `jsname`/generated markup with no public contract. Both are
addressed by design below rather than by cleverness.

Verified since the first draft (see the RE log): identity for own/invited/
shared/task/birthday/holiday chips, moved and split recurring series, RSVP
states, drag/resize in every view, timezone/theme/density invariance, German
locale, popover-vs-quick-create discrimination, Trusted Types constraints.
**Still unverified and relevant to V1:** Workspace accounts (custom-domain
calendar ids), a real MV3 content-script run (all tests used CDP), behaviour at
hundreds of events, delete of recurring/guest events, RTL/CJK locales, narrow
windows. These are listed as Phase 0/2 exit criteria in §12 and in the RE log
§9.

**Trusted Types (resolved in Phase 2):** Calendar serves
`require-trusted-types-for 'script'`. It throws for page/MAIN-world code and for
CDP-created isolated worlds, but **not for a real MV3 content script** —
verified with `examples/calendar-smoke` (RE §1.18). So V1 code (content script
only) may use HTML strings; the HTML-sink lint ban applies only to a future
MAIN-world shim (`src/injected-js/**`).

## 2. Design principles (from the brief's priority list)

1. **Stable abstraction over unstable UI**: public API speaks `EventRef`,
   `RouteType`, view objects — never selectors or class names.
2. **Lifecycle first**: a public view lives exactly as long as the Calendar
   object it represents; if a live element's identity attribute ever changes,
   that ends one view and starts another (defensive [H]; not observed in week
   navigation).
3. **Identity from the cheapest robust source**: decode DOM attribute →
   cross-check (`jslog`/`#initialdata`) → optional network verifier.
4. **No undocumented internals as API**: MAIN world is optional/diagnostic in V1
   (nothing requires it [V]).
5. **Change detection is a product feature**: compat probes ship in-repo and run
   in CI (see compat doc).
6. **Maintainability**: small modules, declarative selector data, typed bridges,
   no god-object driver.

## 3. Target architecture

```
src/
  calendarsdk-js/                      loader/entry: CalendarSDK.load(1, opts)   (from inboxsdk-js/inboxsdk.ts)
  common/                              shared, no Gmail/Calendar knowledge (ajax→removed?, censor*, assert, …)
  platform-implementation-js/
    platform-implementation.ts         generic shell: (driver, namespaceFactory) — replaces Gmail wiring
    lib/                               KEEP: Membrane, HandlerRegistry, SafeEventEmitter, stopper-pool, wait-for*
    lib/dom/                           KEEP: ElementWithLifetime streams; selectorRegistry generalised (§6)
    lib/reporting/                     NEW: Reporter interface replaces logger.ts telemetry (§11)
    driver-interfaces/                 NEW real interfaces: Driver, EventViewDriver, EventPopoverViewDriver, RouteViewDriver…
    namespaces/                        events.ts, router.ts, toolbar.ts, user.ts, calendar.ts
    views/                             event-view.ts, event-popover-view.ts, event-editor-view.ts, route-view.ts
    dom-driver/google-calendar/
      calendar-driver.ts               thin composition root (≈200 lines), owns stopper + services
      selectors.ts                     CALENDAR_SELECTORS (ordered candidate chains, keyed)
      variants.ts                      variant fingerprints + capability flags
      services/
        route-service.ts               Navigation API + body[data-viewkey]/[data-viewfamily] classifier
        root-observer.ts               single root MutationObserver → typed change batches
        event-registry.ts              (element,eventId) → EventViewDriver lifetimes
        identity.ts                    decode data-eventid, jslog cross-check, CalendarId map
        popover-watcher.ts, editor-watcher.ts
        injection-reconciler.ts        self-healing injected DOM (§7)
        user-info.ts                   email/locale from #xUserInfo/#initialdata
      views/                           google-calendar-event-view.ts, …-popover-view.ts, …-editor-view.ts, …-route-view.ts
  injected-js/                         OPTIONAL page-world shim, off by default in V1 (§9)
  compat/                              compatibility probes (shared by CI + dev, §compat doc)
tools/calendar-probe/                  EXPERIMENTAL exploration scripts (exists)
packages/core → packages/calendar-core (@calendarsdk/core), packages/google-api (@calendarsdk/google-api)
```

`CalendarDriver` composes services; it must **not** contain: DOM parsing of
specific views, identity decoding, route classification, network code, Calendar
API code, or styling — those are services/views (see
`inboxsdk-architecture-analysis.md` §2 row 6 for why `GmailDriver`'s 1098 lines
is the anti-pattern).

## 4. V1 public API (smallest useful surface)

```ts
// entry
CalendarSDK.load(version: 1, opts: { appId: string; dataProvider?: CalendarDataProvider;
                 selectorOverrides?: SelectorOverrides; onCompatIssue?: (i: CompatIssue) => void }): Promise<CalendarSDK>;

interface CalendarSDK { readonly Events: Events; readonly Router: Router; readonly Toolbar: Toolbar;
                        readonly User: User; readonly Compat: Compat; destroy(): void }

// ---- identity
type EventRef = {
  eventId: string;                 // base id, no instance suffix
  instanceId?: string;             // present for recurring instances: "20260929T110000Z" or "20260930"
  calendarId: string | null;       // FULL id of the calendar THIS COPY lives on (per-viewer [V]); null if only the abbreviation is known
  calendarIdHint: string;          // raw abbreviation from data-eventid ("<owner>@m")
  kind: 'event' | 'task' | 'birthday' | 'unknown';  // from id prefix (""/ttb_/bday_) [V]
  rawId: string;                   // the data-eventid token — always usable for deep links (/r/eventedit/<rawId>)
  confidence: 'exact' | 'derived'; // exact = decoded from DOM; derived = calendarId expanded heuristically
};

// ---- Events
interface Events {
  registerEventViewHandler(h: (v: EventView) => void, opts?: { kinds?: EventKind[] }): () => void;  // per visible chip segment; default kinds: ['event']
  registerEventPopoverHandler(h: (v: EventPopoverView) => void): () => void;
  registerEventEditorHandler(h: (v: EventEditorView) => void): () => void; // V1 NICE-TO-HAVE
}
interface EventView extends Emitter<{ destroy: void }> {
  getEventRef(): EventRef;               // current ref; NEVER changes for a view — a change destroys the view
  getSegment(): { index: number; count: number; isPrimary: boolean };  // multi-day events render N chips [V]
  isAllDay(): boolean;
  addBadge(d: { text?: string; iconUrl?: string; title?: string; onClick?(e: EventView): void }): BadgeHandle;
  readonly destroyed: boolean;
}
interface EventPopoverView extends Emitter<{ destroy: void }> {
  getEventRef(): EventRef;
  addButton(d: { title: string; iconUrl?: string; onClick(): void }): ButtonHandle;
  addSection(d: { title: string; el: HTMLElement }): SectionHandle;       // LATER
}
// ---- Router
enum RouteType { DAY='DAY', WEEK='WEEK', MONTH='MONTH', YEAR='YEAR', AGENDA='AGENDA',
                 CUSTOM_DAYS='CUSTOM_DAYS', SEARCH='SEARCH', EVENT_EDIT='EVENT_EDIT', SETTINGS='SETTINGS', UNKNOWN='UNKNOWN' }
interface RouteView extends Emitter<{ destroy: void }> {
  getType(): RouteType;
  getAnchorDate(): string | null;     // YYYY-MM-DD from the URL; null when dateless (e.g. after "Today"). The full range depends on week-start, so no getDateRange in V1
  getSearchQuery(): string | null;
  getEventRef(): EventRef | null;     // EVENT_EDIT; added with identity.ts in Phase 3
}
interface Router { getCurrentRouteView(): RouteView; registerRouteViewHandler(h): () => void;
                   goto(target: { type: 'DAY'|'WEEK'|'MONTH'|'YEAR'|'AGENDA'|'CUSTOM_DAYS'; date?: string }
                            | { type: 'SEARCH'; query: string } | EventRef): Promise<void> }   // DONE: pushState + popstate, no reload
// ---- Toolbar / User / Compat
interface Toolbar { addButton(d: { title: string; iconUrl: string; onClick(): void }): ButtonHandle }  // DONE (Phase 9 coverage pass)
interface User { getEmailAddress(): string; getLanguage(): string; getTimeZone(): string | null }
interface Compat { getReport(): CompatReport; onIssue(h: (i: CompatIssue) => void): () => void }
```

Supporting types (sketch, to be finalised in Phase 2/3):

```ts
type BadgeHandle = {
  update(d: Partial<BadgeDescriptor>): void;
  remove(): void;
}; // ButtonHandle/SectionHandle alike
type CompatIssue = {
  severity: 'hard' | 'warning' | 'info';
  check: string; // e.g. 'identity-decode-failed'
  selectorKey?: string;
  rungIndex?: number;
  count?: number;
}; // never titles/ids/emails
type CompatReport = {
  variant: string;
  issues: CompatIssue[];
  checkedAt: string;
};
interface CalendarDataProvider {
  getEvent(ref: EventRef): Promise<CalendarEvent | null>;
  listCalendars?(): Promise<CalendarInfo[]>;
} // owned by the extension; core never sees tokens
type SelectorOverrides = Partial<Record<SelectorKey, readonly string[]>>; // prepended to bundled chains (existing mechanism)
```

| API                                                              | Backing behaviour                                                                                                                                         | Difficulty                          | Reliability | Needs MAIN | Needs Calendar API/OAuth | Tier                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------- | ---------- | ------------------------ | ------------------------------------ |
| `Router.registerRouteViewHandler`, `RouteView.getType`           | Navigation API + `body[data-viewkey]`/`data-viewfamily` (live; the `<html>` key is load-time only) [V]                                                    | Low                                 | High        | No         | No                       | **MUST**                             |
| `Events.registerEventViewHandler` + `EventView.getEventRef`      | `[data-eventchip]` + `data-eventid` decode [V]                                                                                                            | Medium (attribute set after insert) | High        | No         | No                       | **MUST**                             |
| `EventView.addBadge`                                             | injected DOM + reconciler (§7) [V that grid strips foreign DOM]                                                                                           | Medium-High                         | Medium      | No         | No                       | **MUST**                             |
| `Events.registerEventPopoverHandler` + `addButton`               | `[role=dialog][data-chips-dialog][data-allow-wheel-scroll=false]` with no `input`/`textarea` (RE §1.7; the `data-eventid` rule was disproven) [V]         | Medium                              | Medium-High | No         | No                       | **MUST**                             |
| `User.getEmailAddress`                                           | `#xUserInfo` children `#xUserEmail` / `#xTimezone` / `#xUserLocale` [V]                                                                                   | Low                                 | High        | No         | No                       | **MUST**                             |
| `EventEditorView`                                                | `/r/eventedit/<eid>` route + `input[aria-label=Title]` [V routes; X title selector locale]                                                                | Medium                              | Medium      | No         | No                       | NICE                                 |
| `Toolbar.addButton`                                              | `header#gb` and header buttons catalogued (RE §8) [V]; insertion point/behaviour not prototyped [X]                                                       | Medium                              | Unknown     | No         | No                       | NICE                                 |
| `EventView.getTitleText/isAllDay`                                | `data-dragsource-type` (2 timed / 6 all-day / 9 read-only), `role`, `[data-datekey]` [V]; **title text** is locale text (`getTitleText` only)             | Medium                              | Low-Med     | No         | No                       | NICE (prefer dataProvider)           |
| `Router.goto`                                                    | `history.pushState` + synthetic `popstate` [X: does Calendar honour it?]                                                                                  | Medium                              | Unknown     | Maybe      | No                       | LATER                                |
| `EventRef.calendarId` full                                       | `jslog` field 1 [V for plain events; absent for tasks/birthdays]; `#initialdata` map [X]                                                                  | Medium                              | Medium      | No         | No                       | NICE (hint always available)         |
| Event details (attendees, description)                           | `dataProvider` → Google Calendar API                                                                                                                      | —                                   | High        | No         | **Yes (provider-owned)** | LATER, via `@calendarsdk/google-api` |
| `DayCellView`, `TimeSlotView`, `MiniCalendarView`, `SidebarView` | drag/resize lifecycle investigated (RE §1.4–§1.15); these _view classes_ have no structural selectors yet (mini-calendar/sidebar containers uncatalogued) | —                                   | —           | —          | —                        | LATER / EXPERIMENTAL                 |

Concepts from the brief evaluated: **`EventView` = per chip segment**, not per
event (multi-day events render several chips with one ID [V]);
`CalendarView`/`DayCellView`/`TimeSlotView` → LATER (`data-datekey` gives a
locale-independent day anchor but its carrier element differs per view and month
chips aren't descendants of it [V], so `DayCellView` needs per-view work);
`RouteType.YEAR` renders no `[data-eventchip]` (RE §3), so no `EventView`s fire
there; `RouteType.SETTINGS` is verified (`body[data-viewfamily=SETTINGS]`, RE
§1.18) and included in V1; settings sub-pages are not exposed in V1.

## 5. Event identity strategy

Order of resolution inside `identity.ts` (all synchronous except step 4):

0. **Kind**: strip an optional prefix `ttb_` (task) / `bday_` (birthday) →
   `EventRef.kind: 'event'|'task'|'birthday'` [V]. Unknown `^[a-z]+_` prefix ⇒
   `kind:'unknown'`, still emit rawId.
1. **Decode** the remainder (base64url → `"<id>[_<inst>] <calAbbrev>"`). Split
   on the first space. Set `rawId`. **exact**.
2. **Classify** `_suffix`: `/^\d{8}T\d{6}Z$/` timed instance (original UTC
   start), `/^\d{8}$/` all-day instance; else none. Never assume; unknown suffix
   ⇒ keep in `instanceId` verbatim.
3. **Calendar ID**: (a) `CalendarIdMap` learned at runtime from pairs seen in
   `jslog` field `1:[<fullId>,…]`/`#initialdata`, keyed by abbreviation
   (**never** a hard-coded `@m`→`@gmail.com` table); (b) if abbreviation has no
   full form yet, `calendarId = null`, `calendarIdHint = abbrev`.
4. Optional (dataProvider): `provider.getEvent(rawId)`; API `events.get` accepts
   `eventId` (+ instance id form) — correlation is by ID, not by title/time
   heuristics.

Hard cases from the brief and current status:

| Case                                   | Status                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same title/start/end                   | distinct IDs [V]                                                                                                                                                                        |
| Recurring instances                    | `_UTC-start` suffix [V unmodified]                                                                                                                                                      |
| Edited/moved single instance           | [V] suffix = ORIGINAL start (moved 13:00→16:30, id unchanged); "this and following" split [V]: NEW base id + new-start suffix, old ids vanish (no forward link)                         |
| All-day recurring                      | `_YYYYMMDD` [V]                                                                                                                                                                         |
| Multi-day                              | N chips, one ID → `EventView.getSegment()` [V]                                                                                                                                          |
| Same title/time on different calendars | [V] distinct ids (`…@m` vs `…@g`)                                                                                                                                                       |
| Timezone-crossing                      | [V] ids identical in Warsaw and Los Angeles primary time zones (RE §1.17)                                                                                                               |
| Other-owner / shared                   | invited events [V]: eventId same for all attendees, calendar part per-viewer, RSVP state not in id; shared calendars [V]: same id for owner/viewer; read-only popover lacks Edit/Delete |

Series split ("this and following") ends the old refs and creates new ones; the
SDK cannot link them — expose no `renamedFrom`. Drag ghosts create transient
chips sharing an id [V].

`addButton` must not depend on Edit/Delete existing: read-only shared events
omit them [V].

`registerEventViewHandler` default filter: `kind === 'event'`; tasks/birthdays
are opt-in (`{ kinds: [...] }`) because their popovers lack Edit (birthday) and
use different labels [V]. **Popover vs quick-create** [V]: both are
`data-chips-dialog` and both contain a `data-eventid` (quick-create's is a draft
id) — classify by **no `input`/`textarea` inside** and
`data-allow-wheel-scroll="false"` (12/12 dialogs, [V]); matching the id against
rendered chips does NOT work (draft chips appear after ~200 ms). Also skip chips
lacking `jsaction`/`data-keyboardactiontype` — they are quick-create draft chips
[V for 1 form].

**Series-level edits** ("All events") change every instance's `instanceId` but
not `eventId`; "This and following" creates a new `eventId` [V]. Expose
`EventRef.eventId` as the durable series key and document `instanceId` as valid
only until the series changes; views for old instance ids are destroyed by DOM
removal, no linking.

**Appearance/timezone [V]:** theme, density and tz changes alter only styling,
chip height and label text, plus a second gutter with a secondary tz; selectors
and ids are unaffected, so no per-variant selector set is needed for them.
Derive dates from UTC (instance suffix / dataProvider), not label text; never
hard-code pixel geometry.

Failure policy: if decode fails (not base64url, no space, empty) → **no
`EventView` is emitted** for that chip and a `warning: identity-decode-failed`
is reported to Compat; the SDK never falls back to title/time guessing for
identity (unlike Gmail thread rows, which had to — see
`thread-identifier/index.ts` `AMBIGUOUS`). Keep that _AMBIGUOUS_ idea only for
the optional network verifier.

## 6. Selector strategy

Reuse `SelectorRegistry` (generalised to `SelectorRegistry<K>`), with these
additions:

- **Ordered candidate chains per key**, never a comma-joined selector (as in
  `GMAIL_SELECTORS` header comment).
- **Grades A–D** recorded next to each candidate (`{ css, grade, since }`), used
  by the compat report and for prioritising work.
- **Match-count telemetry** on every resolution: `matches: 0 | 1 | n` and _which
  rung matched_; a rung other than the first ⇒ `warning` (drift), 0 ⇒
  `hard failure` for keys marked required.
- **Variant selection**: `variants.ts` fingerprints `<html data-ui-kind>`,
  `body[data-viewkey]`/`data-viewfamily` presence, presence of
  `[data-eventchip]`, and picks a selector set; unknown fingerprint ⇒ run all
  rungs and report `info: unknown-variant`.
- `selectorOverrides`/`onInvalidSelector` from `PiOpts` retained (declarative
  compat data; no remote JS).
- Public API never exposes selectors. Locale-dependent (grade C) candidates are
  always _last_ rungs.

## 7. DOM observation, lifecycle and injection

### 7.1 Observer and registry

One `MutationObserver` on **`document.body`** (`childList` + `subtree`, plus
`attributes` limited to `attributeFilter:['data-eventid']` with
`attributeOldValue`). Chips live under `[role=main]`; popovers and dialogs live
in the separate overlay host `#yDmH0d`, which is empty until something opens (RE
§1.18/§4), so no narrower single root covers both. The handler is O(changed
nodes):

1. Batch records in a microtask, then coalesce per animation frame into a
   **`ChangeSet`**: `addedChips`, `removedChips`, `idSet(el, old, new)`,
   `dialogAdded/Removed`, `mainRegionChanged`. Never `querySelectorAll` the
   whole document per mutation; one initial scan per `mainRegionChanged`.
2. `event-registry` keeps `WeakMap<Element, {ref, view}>` and creates a view
   when a chip becomes **eligible**.
3. A `RouteService` change of `body[data-viewkey]` resets the registry (full
   rebuild [V]); same-view navigation (e.g. week→week) is handled by 2, not
   reset.
4. **No chips at load is normal**: chips first appear 2.2–3.1 s after navigation
   commit (RE §1.18); do not time out on it.

### 7.2 Chip eligibility (all must hold; each [V] in the RE log)

- matches `[data-eventchip]` **and is inside `[role=main]`** — excludes the drag
  ghost (RE §1.18 item 5);
- has a decodable `data-eventid` (set _after_ insertion, so read on the first
  attribute mutation or next frame — never at `addedNodes` time);
- has `jsaction` and `data-keyboardactiontype` — excludes quick-create **draft**
  chips (RE §1.7);
- kind passes the handler's `kinds` filter (default `event`).

Popovers: a `[role=dialog][data-chips-dialog]` with **no `input`/`textarea`**
and `data-allow-wheel-scroll="false"` (RE §1.7); classify as soon as it is
added.

### 7.3 Lifecycle cases (what Calendar does → what the registry does)

| Situation                           | Observed DOM behaviour                                                              | Registry behaviour                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next/previous period, view switch   | old chips removed, new elements created, `data-eventid` set after insertion (RE §2) | destroy on removal; create on first id                                                                                                                            |
| Same-day drag/resize (Week, Day)    | same element, same id, geometry updates in place (RE §1.4, §1.13)                   | no change; segment/date recomputed lazily                                                                                                                         |
| Cross-day / cross-week / Month drag | same id, **new element** per drop (RE §1.9)                                         | grace period of one frame: if the same `(eventId, instanceId)` reappears, treat as a move; V1 = destroy + recreate the `EventView` (handlers re-run — documented) |
| Multi-day drag                      | some chips reused, some removed, count changes (RE §1.10)                           | any add/remove/reuse mix; `getSegment()` recomputed each render                                                                                                   |
| Drag in progress                    | ghost chip outside `[role=main]`; source chip `pointer-events:none`                 | ghost ineligible; source keeps its view                                                                                                                           |
| All-day ↔ timed                    | same id, new element (RE §1.11–§1.12)                                               | `isAllDay()` derived per call from `data-dragsource-type` (2 timed, 6 all-day, 9 read-only) + `role`/`[data-datekey]` presence                                    |
| Series "This and following" split   | old instance ids vanish, new base id (RE §1.4)                                      | destroy old, create new; no linking                                                                                                                               |
| "All events" edit                   | every instance suffix changes, base id kept (RE §1.8)                               | same as above                                                                                                                                                     |
| Popover opens/closes                | chip **elements persist** but injected children are stripped (§4)                   | reconciler re-inserts                                                                                                                                             |
| Delete (plain event)                | chip removed, "Event deleted" live region (RE §1.18)                                | destroy on removal                                                                                                                                                |
| Id changes on a live element        | not observed in any flow [H]                                                        | defensive: destroy old, create new; never mutate a view's ref                                                                                                     |

### 7.4 Injection reconciler (`injection-reconciler.ts`)

Calendar strips foreign nodes from grid subtrees on re-render (a popover open
removed every injected node while the chip elements persisted [V RE §4]), so an
injected node can vanish from a _live_ chip with no chip mutation. `addBadge`
therefore registers a _desired-state entry_ `(view → badge spec)`; a per-frame
pass ensures the node exists under the chip (idempotent, marked
`data-calsdk-*`), re-inserting after wipes and removing it when the view dies;
it watches for removal of its own nodes via the same body observer. Injected DOM
may use HTML strings in the content script (Trusted Types do not apply there, RE
§1.18); MAIN-world code must not. Alternative for V2: an absolutely-positioned
overlay layer over the grid (immune to re-render but must track layout, scroll
and drag) — spike before choosing.

### 7.5 Performance

Hundreds of chips → O(added) per frame. The observer does not observe `style`
attributes (chips restyle continuously while dragging). Popover/dialog changes
arrive through the same observer (overlay host is inside `body`). Never
hard-code pixel geometry: density changes chip height 38/46/58 px (RE §1.17).
Live scale test at 320 chips passed (§12 coverage note).

## 8. Routing

`RouteService`: primary signal = the Navigation API (`navigate` /
`currententrychange`; works in an isolated world [V]). Classification
(`route-service.ts`) reads **`body[data-viewkey]` and `body[data-viewfamily]`**:

| `body[data-viewkey]`                                                           | `data-viewfamily` | `RouteType`                  |
| ------------------------------------------------------------------------------ | ----------------- | ---------------------------- |
| `DAY` `WEEK` `MONTH` `YEAR` `AGENDA` `CUSTOM_DAYS`                             | `EVENT`           | same-named type              |
| `SEARCH`                                                                       | `SEARCH`          | `SEARCH`                     |
| `EVENTEDIT`                                                                    | `EVENT_EDIT`      | `EVENT_EDIT`                 |
| `GENERALSETTINGS`, `CREATECALENDAR`, `CALENDARSETTINGS`, `ADD_CALENDAR_BY_URL` | `SETTINGS`        | `SETTINGS`                   |
| anything else                                                                  | —                 | `UNKNOWN` (report to Compat) |

**Do not use `<html data-prefetch-view-key>`**: it is written at page load and
is _not_ updated by in-app navigation (RE log §1.18 item 4). An earlier draft of
this plan relied on it and would have mis-routed every in-app view change.
Fallback without the Navigation API: `popstate` + a `MutationObserver` on
`<body>` attributes (`data-viewkey`, `data-viewfamily`) and `<title>`. Emit a
new `RouteView` on each _classified change_ (type change, or date/query change)
and destroy the previous one. Date range from the URL `/y/m/d` when present,
else from `data-datekey`s (Today is dateless [V]). Tolerate URL/DOM disagreement
during transitions (debounce one frame; record disagreements in Compat).

## 9. MAIN world vs isolated world

| Capability                                                                                                        | World        | Status            |
| ----------------------------------------------------------------------------------------------------------------- | ------------ | ----------------- |
| Discovery, identity decode, routing (Navigation API), user email/locale (`#xUserInfo`, `#initialdata`), injection | **Isolated** | [V]               |
| `fetch`/XHR interception, `WIZ_global_data`, `gapi`                                                               | MAIN only    | not needed for V1 |

V1 ships **without** `pageWorld.js`. If later needed: a ≤200-line shim (XHR tap
— `sync.*` is XHR [V] — reusing `xhr-proxy-factory`; add fetch only if needed →
typed `postMessage` with a per-page nonce, `__CalendarSDKInjected` idempotence
guard, reuse `background.js`
`scripting.executeScript(world:'MAIN', documentIds)` from InboxSDK) used only
for the network verifier/canary. Bridge protocol must be typed + versioned; do
not repeat Gmail's `<head>` attribute signalling as readiness
(`inject-script.ts`).

## 10. Calendar API integration

Two packages: `@calendarsdk/core` (UI, no OAuth, no network) and
`@calendarsdk/google-api` (optional). `CalendarDataProvider` interface injected
via `load()`: `getEvent(ref): Promise<CalendarEvent>`, `listCalendars()`. The
core SDK never holds tokens/scopes; the extension owns OAuth (or its backend).
Works with **no API at all**: route observation, badges (text/icon), popover
buttons, `EventRef`, user email. Needs API: attendees, description,
conferencing, guaranteed full `calendarId` (when hint unresolved), `iCalUID`.
Correlation is by `eventId`(+instance), which the public API documents as the
event/instance id — **[H] from API documentation only: no Calendar API call was
made in this investigation** (needs an OAuth token); see §15. Recurring-instance
ids of the form `<id>_<UTC start>` match the API's instance-id convention [H].

## 11. Reporting, config, versioning

Replace `lib/logger.ts` (which posts to `api.inboxsdk.com` and a Streak Pub/Sub
topic, elects a page-wide "logger master") with a `Reporter` interface
`{ error(err, ctx), event(name, data), compat(issue) }`; default = no-op +
`console` in dev. Keep `censorHTMLtree/JSONTree` for any sanitised report
payload. Drop `isValidAppId`/Streak checks; `appId` is an opaque namespace. Keep
`REQUESTED_API_VERSION` gating and the loader/implementation version split;
start at API v1. No remote-loaded code (delete REMOTE build variants). Origin
gate: `https://calendar.google.com` — and _reject loudly_ (throw) elsewhere
instead of `new Promise(() => {})`.

## 12. Phased plan

Every phase lists: **goal · code · experiments · deliverables · tests · risks ·
exit**. Phase 8 (compat) runs in parallel from Phase 2.

**Phase 0 — Investigation (substantially complete).** _Goal:_ verified model of
Calendar. _Code:_ `tools/calendar-probe/` (69 experiment scripts, `compat.mjs`,
`seed.mjs`), `docs/`. _Experiments:_ done — see RE log; open — §15.
_Deliverables:_ the four docs, the live compat runner (39 checks + 1 info,
green). _Tests:_ every claim tagged [V] names its script. _Risks:_ only 2
consumer accounts, `en`/`de`. _Exit:_ real-content-script smoke (first task of
Phase 2), Workspace pass, ≥300-chip scale test — none of them blocks Phase 1.

**Phase 1 — Genericize (no Calendar code). DONE on branch
`calendar-sdk-phase1`.** _Goal:_ infrastructure free of Gmail and Streak.
_Done:_ keep-set computed with an import-closure script (only `lib/logger.ts`
and `selectors.ts` tied the kept modules to Gmail/Streak); `lib/reporter.ts`
(console default, never sends data) and `SelectorRegistry<K>` cut those seams;
Gmail/Inbox drivers, views, widgets, namespaces, page-world scripts, remote
loading, Gmail CSS/fixtures/examples, `lib/logger.ts`, `common/log-error.ts`,
`isStreakAppId`, telemetry and `mail.google.com` gates deleted; real `Driver`
interface, `CalendarDriver` skeleton, `CALENDAR_SELECTORS` (live-verified keys,
validity-tested), `PlatformImplementation` shell with API-version gating that
**throws** on any origin but `https://calendar.google.com`,
`CalendarSDK.load(1, { appId })`, handwritten public types; single
`calendarsdk.js` bundle (no pageWorld/background/remote),
`examples/calendar-hello`, trimmed CI; ESLint ban on HTML-string sinks
(initially SDK-wide; **narrowed in Phase 2 to
`src/injected-js/**`after the real-content-script check showed Trusted Types do not apply to content scripts**); rebrand to`@calendarsdk/\*`(placeholder scope, plan §17) with attribution kept. _Exit met:_`yarn
gulp`(bundle + example),`yarn typecheck`0 errors,`yarn
test`187 tests / 22 suites (420 → 187: 238 tests left with the deleted Gmail code, 5 added),`yarn
lint`, `yarn
lint:stylelint` (`--allow-empty-input`), grep gate for `GmailDriver|dom-driver/gmail|mail.google.com|inboxsdk.com|pubsub|mailfoogae|
isStreakAppId|data-inboxsdk-`empty; the built bundle was also loaded in jsdom (resolves on calendar origin, rejects elsewhere). _Deferred then, done in the audit after Phase 8:_ 24 unreachable modules and their tests (kefir stream helpers, `stopper-pool`, `toLiveSet`, `ErrorCollector`, `attemptWithRetries`, `waitForAsync`, `censorJSONTree`, …; `xhr-proxy-factory`and`censorHTMLtree`are kept for the reserved MAIN-world canary and fixture sanitising) were deleted and 43 unused runtime dependencies (react, ud, sha.js, page-parser-tree, order-manager, bignumber, transducers, …) were dropped from`package.json`. The bundle was already lean (only lodash `remove`/`uniq`, kefir, kefir-stopper, asap, events); this only shrinks install size and maintenance surface. _Still deferred:_ the `platform-implementation-js`
directory name.

**Phase 2 — Calendar bootstrap. DONE on branch `calendar-sdk-phase2`.** _Goal:_
SDK loads on Calendar; route, root and user info work from a real content
script. _Done:_ **first, the real-content-script smoke test**
(`examples/calendar-smoke` +
`tools/calendar-probe/experiments/extension-smoke.mjs`; branded Chrome ignores
`--load-extension`, so the extension is loaded over CDP
`Extensions.loadUnpacked`, which needs `--enable-unsafe-extension-debugging`).
Results [V]: Navigation API `navigate` events, `#xUserInfo` reads,
`body[data-viewkey]` tracking, MutationObserver, `<style>` and extension-URL
images all work in a real content script; **Trusted Types do NOT apply to
content scripts** (they do to page code and CDP-created worlds), so an earlier
"critical" constraint was retracted and the ESLint HTML-sink ban narrowed to
`src/injected-js/**`. Then: `RouteType`; pure `classifyRoute` (body key/family
authoritative, URL supplies date/query and detects the URL-leads-DOM window);
`RouteService` (Navigation API + popstate + body/title observers, waits up to
`settleMs` while URL and DOM disagree, reports disagreements, works without the
Navigation API); `readUserInfo`; `CalendarDriver` composing them (`onready`
waits for `#xUserInfo`, rejects with a clear error after `readyTimeoutMs`);
public `RouteView`, `Router` (`getCurrentRouteView`, `registerRouteViewHandler`,
`RouteTypes`) and `User` (`getEmailAddress/getLanguage/getTimeZone`), built on
`Membrane` + `HandlerRegistry`; `examples/calendar-hello` logs `RouteType` and
user info. `RouteView.getDateRange` was replaced by `getAnchorDate` (the range
depends on week-start). _Tests:_ 230 (187 → +43): classifier table incl.
transition cases, `RouteService` with fake timers and a fake Navigation API,
user-info, Router semantics (replay, destroy, unregister, throwing handlers),
load smoke incl. timeout. _Live [V]_ (`extension-routes.mjs`, built SDK in real
Chrome): correct sequence for next/prev week, `m d y a x w`, editor open/cancel,
settings, `history.back`; a popover open emits no route; "Today" from the
current week navigates nowhere and view-switch keys then yield **dateless** URLs
(Calendar drops today's date), so `anchorDate === null` means "today/current".
_Exit met:_ correct `RouteType` for all verified views incl.
back/forward/settings/editor, from a real content script. _Not covered:_ Today
navigating to a _different_ week is covered in `today.mjs` scratch only; Firefox
fallback path is unit-tested only.

**Phase 3 — `EventView` lifecycle. DONE on branch `calendar-sdk-phase3`.**
_Goal:_ lifetime-bound `EventView` per eligible chip. _Done:_ `identity.ts`
(pure decode of `data-eventid`: kind prefix, instance suffix, calendar hint;
unknown shapes → `null`, never a guess; full calendar id from `jslog` field 1
for plain events); `EventRegistry` — one `MutationObserver` on `document.body`
with state-based reconciliation, chip eligibility (inside `[role=main]`, has
`jsaction` + `data-keyboardactiontype`, decodable id set after insertion) and
per-batch reconcile so remove+re-add of the same element keeps its view while a
replaced element or a changed id destroys the old view and creates a new one;
`CalendarEventViewDriver` (`getEventRef`, per-call `getSegment` in document
order, per-call `isAllDay` from `data-dragsource-type`/`role`/`[data-datekey]`);
public `EventView`; `Events` namespace with
`registerEventViewHandler(handler, { kinds })` (default `['event']`, tasks and
birthdays opt-in) on `HandlerRegistry` + `Membrane`; `CalendarDriver` reconciles
on route change; `EventRef`/`EventView`/`Events` in the public types;
`examples/calendar-events`. `getTitleText()` was **dropped from V1** (locale
text, NICE tier). _Tests:_ 187 → 282 across identity (20), registry (25: every
row of plan §7.3 that jsdom can express, ghost, draft chip, multi-day segments,
all-day flip, decode-failure reporting, 100-navigation leak test, 500-chip
batch), `Events` (7) and the load smoke. _Live [V]_ (`extension-events.mjs`,
built SDK in real Chrome): views == eligible DOM chips after load, next/previous
week, `m d y a x w`, popover open/close (no views created), quick-create (draft
chip ignored), 24 rapid navigations (`created − destroyed == live`), and
**mid-drag: the ghost chip exists in the DOM (2 chips with the id, 1 inside
`[role=main]`) yet exactly one `EventView` existed at every sample**; 23 chips:
20 events, 2 tasks, 1 birthday; multi-day event = segments 1/3, 2/3, 3/3;
recurring instances carry `instanceId`. _Not covered:_ a live cross-day drag
(replacement semantics are unit-tested from the observed DOM behaviour, live
drag would edit fixtures), ≥300 chips live (jsdom 500-chip test only), Workspace
accounts. _Exit met:_ 100 % of chips on the fixture weeks get the correct
`EventRef` (views == eligible chips in every state tested); no leaked views;
decode failure reports a `identity-decode-failed` event and emits no view.

**Phase 4 — Identity hardening. PARTLY DONE (calendar-id map); the Workspace
pass and the API correlation are still open.** _Goal:_ trustworthy
`calendarId`/kind across accounts. _Done:_ `services/calendar-id-map` learns
`<owner>@m` ↔ full id **at runtime** from plain-event chips (their `jslog` has
the full id; no hard-coded suffix table); an abbreviation ever seen with two
full ids is ambiguous and never resolves (`calendar-id-conflict` reported, no
ids in it). It fills `calendarId` (marked `confidence: 'derived'`) for **plain
events** whose element has none: popovers without a same-event chip, and the
editor route's ref (looked up per call, so it improves once chips are seen).
Tasks and birthdays are deliberately left `null` (their abbreviation names the
account, not a calendar — live: both are `<owner>@m`, with no full id in their
`jslog`). Live (`extension-editor.mjs`): editor opened from a popover →
`derived` + known; opened by direct URL (no chips seen) → `null`, never guessed.
_Open (needs the owner):_ a Workspace account (custom-domain / resource calendar
ids, `@` suffixes other than the consumer ones), and one authenticated
`events.get` / `api-correlate.mjs` run for the instance-id convention. _Exit:_
Workspace pass + one API correlation check, or an explicit "unverified" note in
the public docs (README and getting-started already say so).

**Phase 5 — Event UI (badges). DONE on branch `calendar-sdk-phase5`.** _Goal:_
`EventView.addBadge`. _Done:_ `InjectionReconciler` (desired-state badges; a
single `childList` observer on `document.body`; a chip whose subtree changed —
including our own node being stripped — is re-reconciled synchronously in the
observer microtask, i.e. before the next paint; idempotent, own nodes ignored,
per-`appId` ownership so several SDK instances coexist), badge DOM built with
`createElement`/`textContent` (no HTML from the app), one shared `<style>` (dark
translucent pill + white text: readable on light and dark themes, fixed 14 px so
it ignores density), corner placement for absolutely positioned chips and inline
placement for static schedule rows, click/mousedown/pointerdown/dblclick/
contextmenu kept away from Calendar's delegated handlers (a badge click runs the
app handler and does **not** open the popover), `BadgeHandle.update/remove`,
cleanup on view destroy and `stop()`; `EventView.addBadge` (with
`onClick(eventView)`), public types, `examples/calendar-badges`. _Decision:_
**in-tree injection with the reconciler; the overlay-layer alternative is not
needed for V1** — it is retained only as a fallback if Calendar ever strips
faster than a microtask. _Bug found by the tests:_ keeping our container "last
child" made two SDK instances re-order each other forever (infinite loop);
removed. _Tests:_ 282 → 299 (repair after strip ×20, own-node removal, order of
several badges, update/remove without stale text, cleanup, replaced chip, click
isolation and error reporting, positioning, single style element, two apps, "DOM
is quiet after settling" (no self-feeding), **50 navigations × 30 chips with
exactly one fresh badge per chip every time**). _Live [V]_
(`extension-badges.mjs`, real Chrome, plain-event chips only since the example
uses the default kind): one badge per chip, none missing/duplicated/stray in the
initial week, after **5 popover open/close cycles**, all view keys, **50
navigations**, mid-drag and after a returned drag, **dark theme**, **compact
density**, restored settings, month and schedule views; **per-frame meter: 0 of
2841 frames had a chip (≥3 frames old) without its badge**; extension-URL icons
load under the page CSP; badge click gave the right event and no popover.
_Cosmetics (fixed in the coverage pass):_ in narrow chips (< 72 px border box)
the badge becomes a 10 px dot (`data-calsdk-compact`, driven by a per-reconciler
`ResizeObserver`; text stays in the tooltip), verified live 1300 → 600 → 1300
px: compact exactly for chips narrower than 72 px. On wide chips the pill can
still overlap the end of a long title (accepted). _Not covered:_ badges on
task/birthday views (mechanism identical), timezone change, Workspace. _Exit
met:_ badge survives 50 navigations + popover open/close + drag +
resize-independent density/theme changes without duplicates or stale text.

**Phase 6 — Popovers. DONE on branch `calendar-sdk-phase6`.** _Goal:_
`registerEventPopoverHandler` + `addButton`. _Code:_ `services/popover-registry`
(discovery + repair), `popover-style`,
`views/calendar-event-popover-view-driver`, `EventPopoverView`;
`registerEventPopoverHandler(handler, { kinds })` (default `['event']`). A
popover is `[role=dialog][data-chips-dialog]` with
`data-allow-wheel-scroll=false` and no `input`/`textarea` (the quick-create
dialog has the same shape but contains inputs). Its `EventRef` comes from the
outermost `[data-eventid]` node inside it, which is also where the button row is
appended; the calendar id is borrowed from a chip with the same raw id. Buttons
are re-inserted in the observer microtask when Calendar strips them; own
insertions are ignored, own removals trigger repair; Escape and Tab still reach
Calendar from a focused button. _Live test_ (`extension-popovers.mjs`, real
Chrome, 66 checks, 0 fail): one button in the popover, right `EventRef` and
kind, click runs the handler and leaves the popover open, removed on close, for
event, recurring, multi-day, all-day, task, birthday, Space-opened, popover
switching, 10 open/close cycles, month/schedule/day/custom-days views, dark
theme, shared read-only and invited events (second account); none on
quick-create (event or task); **per-frame meter: 0 of 3971 frames had a popover
(≥3 frames old) without its button**. _Notes:_ Calendar itself does not close a
Space-opened popover on Escape and desyncs on rapid click/Escape (also without
the SDK); after the quick-create checks the view keys were swallowed until a
reload (harness workaround). _Exit met:_ button on every popover kind, removed
on close, click gets the right `EventRef`.

**Phase 7 — Editor. DONE on branch `calendar-sdk-phase7`.** _Goal:_ `EVENT_EDIT`
route + `EventEditorView`. _Code:_ `RouteView.getEventRef()` (token parsed from
`/r/eventedit/<token>`, `null` for a new event and other routes; `routeKey`
includes it so editor A → editor B is a new route), `services/editor-service`,
`views/calendar-event-editor-view-driver`, `EventEditorView`,
`Events.registerEventEditorHandler`. **The editor view is derived from the
route, not from editor DOM:** created when an `EVENT_EDIT` route starts, its
stopper _is_ the route's, so dialogs over the editor cannot create or end it.
Observed: `getTitle()` (live lookup), `titleChange`, `saveClicked` — named for
what is observable: it does NOT mean the event was saved (guest / recurring
dialogs follow; the user can back out), and Save via keyboard is not observed.
_Selector correction:_ `jsname=YPqjbf` is shared by all text inputs; title is
`input#xTiIn`, save `#xSaveBu`, cancel `#xCancelBu`. _Live test_
(`extension-editor.mjs`, 19 checks, 0 fail, fixtures unchanged): from popover
Edit, direct URL, back/forward (fresh editor on forward), new event (null ref),
recurring scope dialog and guest "send invitations?" dialog (editor survives,
same instance after "Back to editing"), "Discard unsaved changes?"
(`role=alertdialog`) on Cancel. _Task and birthday:_ a task popover's Edit does
not navigate to `/r/eventedit` (no editor view); birthdays have no Edit. _Not
covered:_ Workspace calendars, non-English locales, editor for a shared-calendar
event without write access. _Exit met:_ view created/destroyed with the route.

**Phase 8 — Compatibility infrastructure. IMPLEMENTED on branch
`calendar-sdk-phase8`; the exit criterion "nightly job green for a week" is
still pending (needs the schedule to run for a week).** _Goal:_ detect Google
changes before users do. _Code:_ `src/platform-implementation-js/compat/`
(`checks.ts` — selector-registry checks with contexts, canaries and optional
keys; `structure.ts` — structural fingerprints), `services/compat-service`,
`sdk.Compat` (`getReport()`, `onIssue()`, `load({ onCompatIssue })`; local only,
nothing is sent), and `tools/calendar-probe/compat-runner.mjs`, which bundles
the **same** `checks.ts` with esbuild and injects it over CDP into week, month,
day, agenda, an open popover, the editor and settings. _How a check decides:_ a
key is checked only in the page state where it must exist (route type from
`body[data-viewkey]`; popovers are detected by evidence, not by the registry
that may be broken). Preferred rung matches = ok; a later rung =
`selector-fallback` (warning); no rung matches while independent evidence says
the element is there (e.g. `[role=main] [data-eventid]` for chips) or the key
has no canary = `selector-miss` (**hard**); an empty week is "unverified", not a
failure; optional keys (Edit/Delete on read-only events) never fail. Also
`identity-decode-failed` (chips whose `data-eventid` does not decode; hard if
all) and `structure-drift:<landmark>` (warning) against
`tools/calendar-probe/baselines/structure.json` — fingerprints hold tag and
attribute _names_ only (no text, no values), so nothing user-owned is in a
report or the baseline. _Deliverables:_ `out/compat-report.{json,md}`,
`--issue-dry-run` writes the issue text (**nothing is filed or sent**),
`compat-nightly.sh` (dated copies in `out/history/`; scheduling it is the
owner's call). _Tests:_ 19 jest tests incl. the **broken-selector drill** in
jsdom, and live `--drill` (the runner replaces the `eventChip` chain — selector
_overrides_ only prepend, so they cannot break a check — and requires a hard
failure: passes, 5 scenarios flagged); `extension-compat.mjs` (18 checks): the
in-page `sdk.Compat` on week/popover/editor gives no issues, emits nothing on a
healthy page, and its fingerprints equal the baseline the CDP runner wrote (same
code, same result). Two consecutive live runs: 0 hard, 0 warning, no drift.
_Risks / open:_ ToS for automation and upkeep of the signed-in profile (owner);
baseline covers `en`, ui-kind 10, one account — other variants need their own
baselines; issue filing and the scheduled job are deliberately not wired up.
_Exit:_ drill passes (met); nightly green for a week (pending).

**`@calendarsdk/google-api` (built, unverified live).** `packages/google-api`
implements `CalendarDataProvider` over `events.get` / `calendarList`. The
extension supplies `getAccessToken` (the package never asks for credentials and
never puts the token in errors). Rules: only `kind: 'event'` with a known
`calendarId` (never guessed; optional `resolveCalendarId`); recurring instances
by instance id, 404 → `null` (never the series); 401 → one refresh, 429/5xx →
retries. The core exposes it as `sdk.Data.getEvent/listCalendars` and
`load({ dataProvider })`. The live API check is
`tools/calendar-probe/api-correlate.mjs`, which the owner runs with
`CALSDK_TEST_TOKEN` (prints booleans and id shapes only). Until it has run,
"instance ids of the form `<id>_<UTC start>` match the API" stays **[H]**.

**Coverage pass (after Phase 8).** Live, real Chrome, several SDK instances
loaded side by side (`extension-coverage.mjs`, `extension-locales.mjs`,
`extension-timezone.mjs`): _scale_ — 320 synthetic chip clones in the live month
view are all badged within one frame (358 ms incl. insertion, no long task),
remove/re-add churn leaves exactly one badge per chip, removing the clones
leaves the real chips as before, popovers still work; _narrow windows_ (700 px
and 420 px) keep the same DOM (`[role=main]`, header, 23 chips), badges, popover
button and compat report unchanged; _task and birthday chips_ are badged when
the app registers those kinds; _locales_ `de pl ja zh-CN ar he` (RTL `ar`/`he`):
UI really localized, route WEEK, one badge per chip, popover button with the
right ref, editor by URL with `#xTiIn` found, compat report clean (no locale
fallback rung needed); _time zone changed while running_ (CDP override, no
reload): chips, badges, popover and compat unaffected and the recurring
instance's `EventRef` is identical (UTC-based) — Calendar renders in the
_account's_ zone, so grid labels do not move with the browser zone;
`User.getTimeZone()` is the load-time account zone by design. _Still not
covered:_ hundreds of _real_ events, Workspace, other input methods.

**`Router.goto` (done).** `history.pushState({}, …)` + a `popstate` event
switches view **without a reload**, verified live for all view types, search and
the editor (`extension-goto.mjs`, 15 checks). Two traps found: re-using
Calendar's own `history.state` makes its router restore the old URL (use a fresh
`{}`), and `navigation.navigate()` / link clicks reload the page. The promise
resolves when the route of the requested kind is emitted (rejects after 5 s),
bad targets (impossible date, SETTINGS, task/birthday refs — tasks do not use
the editor) reject without navigating.

**`Toolbar.addButton` (done).** `services/toolbar-service`: a
`div.calsdk-toolbar` container placed as the previous sibling of the wrapper of
Calendar's Search button (`header button[jsname=KzBUhd]`), buttons in
registration order, desired state re-applied from a mutation-observer microtask
(also if the header is rebuilt), repair back-off if Calendar and the SDK ever
fight. Round 40 px icon buttons (`vertical-align: top` matches Search's row —
`middle` sat 4 px low), hover/focus styles neutral to light/dark. Pointer events
contained; Enter activates, single-key shortcuts do not leak to Calendar,
Escape/Tab pass. Live (`extension-toolbar.mjs`, 24 checks): one button just left
of Search without overlap in week/month/day/schedule/N-days/year, after 50
navigations and popover cycles, after settings, dark theme, 900/700/420 px; **0
of 4149 grid frames** without it. On settings/search routes Calendar hides the
Search wrapper, so the button is not visible there (present in the DOM). Compat:
new key `searchButton`; SDK-injected nodes are ignored by the structure
fingerprint.

**Phase audit (after the coverage pass).** Every phase re-read against its exit
criterion:

| Phase           | Exit criterion                                                                                                            | Status          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 0 Investigation | real-content-script smoke ✔, ≥300-chip scale ✔ (synthetic, live), **Workspace pass ✘ (owner)**                          | open: Workspace |
| 1 Genericize    | build/typecheck/tests/lint/grep gate ✔; deferred pruning ✔ (audit)                                                      | done            |
| 2 Bootstrap     | correct route for every view, back/forward, settings, editor ✔                                                           | done            |
| 3 EventView     | views == chips in every tested state, no leaks ✔; delete/undo ✔                                                         | done            |
| 4 Identity      | calendar-id map ✔ (unit + live); **Workspace pass ✘, API correlation ✘ (owner)**                                         | partly done     |
| 5 Badges        | survives navigations/popovers/drag/theme/density ✔; task/birthday ✔; narrow ✔                                          | done            |
| 6 Popovers      | button on every kind, removed on close, right ref ✔                                                                      | done            |
| 7 Editor        | lifetime = route, dialogs don't matter ✔                                                                                 | done            |
| 8 Compat        | drill ✔, runner + baseline ✔, in-page report ✔; **nightly green for a week ✘ (not scheduled, by decision)**            | implemented     |
| extras          | google-api ✔ (mocked; live check owner-run), Router.goto ✔, Toolbar ✔, docs ✔, CI covers all examples + google-api ✔ | done            |

Known limits, all documented: Workspace accounts, API instance-id correlation,
guest-event delete, non-Gregorian calendars, real (not synthetic) hundreds of
events, timed→all-day drag with real input, Firefox/Safari (unit-tested fallback
only), a compat baseline for `en` only.

## 13. Risks

| Risk                                                                                                | Mitigation                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Google changes `data-eventid` encoding / `jslog`                                                    | compat check "identity decode 14/14" is a hard failure; network verifier canary; `rawId` always exposed so deep links still work |
| Grid re-render strips injected DOM                                                                  | reconciler + overlay spike; test pins behaviour                                                                                  |
| Id-after-insert / possible reuse ⇒ wrong-event UI                                                   | view = (element,id) created on first id; id-change ⇒ new view; tested by attribute-mutation fixtures                             |
| Google UI experiments per account                                                                   | variant fingerprints + multi-account CI matrix (needs ≥2 account types)                                                          |
| Test-account lockouts / captcha on automation                                                       | human-signed-in persistent profile over CDP; never store credentials; low-frequency runs                                         |
| Chrome Web Store policy re remote code                                                              | none loaded; declarative overrides only                                                                                          |
| Navigation API absent in Firefox/Safari                                                             | fallback path; Chromium-first support statement                                                                                  |
| Terms of service for automating Calendar                                                            | dedicated test accounts, read-mostly, low frequency; review before scheduled CI                                                  |
| Verified only on 2 consumer accounts; UI languages `en`, `de`, `pl`, `ja`, `zh-CN`, `ar`, `he` pass | Workspace pass + RTL/CJK locales are Phase 0/2 exit criteria; per-feature graceful failure limits blast radius                   |

## 14. First engineering tasks (recommended order)

1. Commit this docs set + `tools/calendar-probe/` (nothing is committed yet; raw
   `out/` and `node_modules` are git-ignored; scrub any account identifiers
   before committing — docs already redact them).
2. Throwaway MV3 extension proving the isolated-world assumptions (Phase 2 first
   step, above) — de-risks everything else.
3. (**done**, hardening pass: `capture-fixtures.mjs` +
   `__tests__/calendar-fixtures.test.ts`) Build **sanitised HTML fixtures** for
   week/month/agenda/popover/quick-create/ editor using `common/censorHTMLtree`
   (extend to preserve `data-eventid`, `data-*`, `jslog` structure with fake
   ids) → `__tests__/calendar-fixtures/`.
4. Write `identity.ts` + unit tests (decoder, suffix classifier, failure policy)
   — pure functions, no DOM.
5. (done in Phase 1, later scoped to MAIN-world code) extract generic core:
   `Membrane`, `HandlerRegistry`, `SafeEventEmitter`, selector registry
   (generic), stopper/stream helpers into `src/common-core` or keep in place;
   delete Gmail wholesale (Phase 1).
6. `RouteService` + Router namespace + example extension (Phase 2).
7. `root-observer` + `event-registry` with fixture-driven tests (Phase 3).
8. Compat runner v0: reuse `experiments/*.mjs` logic as `compat/checks/*.ts`
   running through Playwright-over-CDP; emit the PASS/FAIL report (compat doc).
9. `addBadge` + reconciler + overlay spike; decide overlay vs in-tree.
10. Popover watcher + `addButton`; consumer example extension + browser-level
    test.

## 15. Unknowns / experiments (summary; detail in RE log §9)

| Unknown                                                                                                                                                                                                                                                                  | Experiment                                                                                                          | Blocks                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| ~~Do isolated-world findings hold in a real MV3 content script?~~ **Answered (Phase 2)**: Navigation API, `#xUserInfo`, `body[data-viewkey]`, observers, extension-URL images hold; Trusted Types do **not** apply to content scripts                                    | `extension-smoke.mjs`                                                                                               | —                                    |
| Workspace custom-domain / resource calendar ids; other `data-ui-kind`                                                                                                                                                                                                    | Workspace test account                                                                                              | `calendarId` expansion, variants.ts  |
| Behaviour at hundreds of chips (virtualisation, "+N more", observer cost) — **320 synthetic chips in the live month view: all badged in one frame, no long tasks, churn OK; real Calendar virtualisation with hundreds of real events still unobserved**                 | 300 real events would need seeding                                                                                  | done (synthetic)                     |
| ~~Rapid navigation leaks/duplicates~~ **Answered (Phase 3)**: 24 rapid Next/Previous clicks in real Chrome, `created − destroyed == live` and views == DOM chips                                                                                                         | `extension-events.mjs`                                                                                              | —                                    |
| Timed → all-day drag gesture with real input                                                                                                                                                                                                                             | manual/headed run with real pointer                                                                                 | none (identity known via editor)     |
| ~~Delete of recurring instance; undo~~ **Answered**: deleting one instance leaves the others' ids unchanged, EventViews == chips throughout, undo restores the same instance ids, series delete leaves 0 (`extension-delete.mjs`, 16 checks). Guest-event delete not run | `extension-delete.mjs`                                                                                              |
| ~~Narrow window, RTL & CJK locales~~ **Answered** (420/700 px; `ar he ja zh-CN de pl`); non-Gregorian calendars not run                                                                                                                                                  | `extension-locales.mjs`, `extension-coverage.mjs`                                                                   |
| ~~Extension-URL images under page CSP~~ **Answered**: load fine (real content script)                                                                                                                                                                                    | `extension-smoke.mjs`, `extension-badges.mjs`                                                                       | —                                    |
| ~~`Router.goto` feasibility~~ **Answered**: `pushState({}, …)` + `popstate` from the content script switches views without a reload                                                                                                                                      | `extension-goto.mjs`                                                                                                |
| Event id position in network responses                                                                                                                                                                                                                                   | capture range containing fixtures                                                                                   | canary only                          |
| Firefox/Safari fallback path (no Navigation API)                                                                                                                                                                                                                         | smoke                                                                                                               | support matrix                       |
| Calendar API leg of identity: does `events.get` accept `<id>_<UTC start>` instance ids and the `data-eventid` base id? **No API call has been made**                                                                                                                     | one authenticated `events.get`/`instances` call against the test account (requires an OAuth token — owner decision) | `dataProvider` correlation (Phase 4) |
| Does `#xTimezone` track the primary-tz setting live or only at load?                                                                                                                                                                                                     | change primary tz in-app, re-read `#xTimezone` without reload                                                       | `User.getTimeZone()`                 |

## 16. Project setup, packaging and support policy

- **Fork hygiene.** Source is Apache-2.0 OR MIT (Streak). Keep `LICENSE-*`,
  `COPYRIGHT.txt` and attribution; remove Streak branding, `inboxsdk.com` URLs
  and telemetry endpoints (§11); rename packages (`@calendarsdk/*` is a
  placeholder — owner decision, §17).
- **Layout.** `packages/calendar-core` (bundle + `background.js` for MV3
  injection only if the optional shim is used) and `packages/google-api`
  (optional); handwritten public `.d.ts` like `src/inboxsdk.d.ts`; `examples/`
  reduced to a few Calendar extensions (route logger, badges, popover button).
- **Support matrix (V1).** Chromium-based browsers, MV3 content scripts, Google
  Calendar web at `https://calendar.google.com/calendar/u/<n>/…`, desktop
  layout. Unsupported/untested: Firefox/Safari (no Navigation API),
  Workspace-specific UI, mobile layout, RTL/CJK (until tested).
- **Versioning.** SDK semver; `REQUESTED_API_VERSION` gates API changes (start
  at 1); Google UI drift is handled by patch releases + declarative
  `selectorOverrides` and is reported through `Compat`, never as an API break.
- **Release.** `docs/releasing.md` (checklist), `CHANGELOG.md`, and
  `tools/check-packages.mjs` (what `npm pack` would ship: entry points,
  licenses, no tests/internals, bundle exports match the types; run in CI). The
  published `core` package holds the self-contained bundle, one hand-written
  `.d.ts` and the license files only — no runtime dependencies.
- **Privacy.** No network calls from core; compat reports contain counts and key
  names only (never titles, ids or emails).

## 17. Decisions needed from the project owner

| Decision                                                             | Options / recommendation                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Package name/scope and repo name                                     | **DECIDED: keep `@calendarsdk/*` for now**; revisit before publishing                                           |
| Delete Gmail in-place (this fork) vs new clean repo                  | recommended: delete wholesale in this fork to keep git history and tooling                                      |
| V1 `EventView` on move: destroy+recreate vs `onElementChange`        | recommended: destroy+recreate (simpler; documented)                                                             |
| Calendar API leg: build `@calendarsdk/google-api` in V1?             | **DECIDED: yes, in V1** (`packages/google-api`, built; live correlation still unverified)                       |
| Supply a Workspace test account and an OAuth token for the API check | needed for Phase 4 exit                                                                                         |
| Scheduled live compat runs (ToS/automation)                          | **DECIDED: manual for now; scheduling infrastructure is ready but disabled** (`tools/calendar-probe/schedule/`) |
| Browser support beyond Chromium                                      | recommended: Chromium-first, revisit after V1                                                                   |
