# API reference

Types are in [`src/calendarsdk.d.ts`](../src/calendarsdk.d.ts) (shipped with the
package); this page explains the behaviour. All handles and views are safe to
call after they end: `update`/`remove` on a finished handle do nothing.

## `CalendarSDK.load(version, options)`

```ts
CalendarSDK.load(1, options): Promise<CalendarSDK>
```

Resolves once Calendar has rendered its user info (`#xUserInfo`) and routing has
started. Rejects on another origin, an unsupported `version`, an empty `appId`,
or after `readyTimeoutMs`.

| Option              | Type                               | Meaning                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`             | `string` (required)                | Namespace for everything you inject. **One live SDK per `appId`**: a newer `load()` with the same `appId` (a re-injected or reloaded extension) destroys the older one, so the page never gets duplicates; different `appId`s coexist. Make it unique to your extension |
| `dataProvider`      | `CalendarDataProvider`             | Source of event details (see `Data`); owned by your extension                                                                                                                                                                                                           |
| `selectorOverrides` | `{ [key]: string[] }`              | Candidate selectors **prepended** to the bundled chain of a key (never replaces it)                                                                                                                                                                                     |
| `onInvalidSelector` | `(key, selector) => void`          | An override selector was invalid CSS in this browser and dropped                                                                                                                                                                                                        |
| `onCompatIssue`     | `(issue: CompatIssue) => void`     | Local self-check found a problem (see `Compat`)                                                                                                                                                                                                                         |
| `reporter`          | `{ error(err, d?), event(n, d?) }` | Receives diagnostics (default: errors to the console, events dropped). Nothing is ever sent by the SDK                                                                                                                                                                  |
| `readyTimeoutMs`    | `number`                           | Default 15000                                                                                                                                                                                                                                                           |

The returned `CalendarSDK` has `Events`, `Router`, `User`, `Toolbar`, `Data`,
`Compat`, `Logger` (`error(err, details?)`, `event(name, details?)` → your
reporter), `LOADER_VERSION`, `IMPL_VERSION`, `destroyed`, `destroy()` (removes
everything the SDK injected, ends all views) and `on('destroy', fn)`.

## Views and lifetimes

`RouteView`, `EventView`, `EventPopoverView` and `EventEditorView` share the
pattern: `destroyed: boolean`, `on('destroy', fn)`. `destroy` is emitted once,
listeners are then removed. A handler registered with `register…Handler` is
called for what exists now and for everything later, and returns a function that
unregisters it.

## `Router`

| Member                              | Description                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `RouteTypes`                        | `{ DAY, WEEK, MONTH, YEAR, AGENDA, CUSTOM_DAYS, SEARCH, EVENT_EDIT, SETTINGS, UNKNOWN }` |
| `getCurrentRouteView()`             | The route right now                                                                      |
| `registerRouteViewHandler(handler)` | Called for the current route and every later one                                         |
| `goto(target): Promise<void>`       | Navigate without a reload; see below                                                     |

**`RouteView`**: `getType()`; `getAnchorDate()` — `YYYY-MM-DD` from the URL or
`null` (the URL has no date right after "Today"); `getSearchQuery()` — for
`SEARCH`; `getEventRef()` — for `EVENT_EDIT` of an existing event, else `null`.
A new `RouteView` is created when the type, date, query or edited event changes;
the previous one is destroyed first. The route is derived from
`body[data-viewkey]`, with the URL supplying dates.

**`goto(target)`**:

```ts
{ type: 'DAY'|'WEEK'|'MONTH'|'YEAR'|'AGENDA'|'CUSTOM_DAYS', date?: 'YYYY-MM-DD' }
{ type: 'SEARCH', query: string }
EventRef                       // kind 'event' only: opens its editor
```

Resolves when a route of that kind has been emitted (immediately if you are
already exactly there), rejects on an invalid date, an unsupported target
(`SETTINGS`, tasks, birthdays) or if Calendar does not navigate within 5 s.
Implemented with `history.pushState` plus a `popstate` event — no reload.

## `Events`

```ts
registerEventViewHandler(handler, { kinds? })    // default kinds: ['event']
registerEventPopoverHandler(handler, { kinds? }) // default kinds: ['event']
registerEventEditorHandler(handler)
```

`kinds` is any of `'event' | 'task' | 'birthday' | 'unknown'`.

### `EventRef`

| Field            | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `eventId`        | Base id. For a recurring event this is the **series** id                                          |
| `instanceId`     | Recurring instances only: original UTC start (`20260929T110000Z`) or all-day date (`20260930`)    |
| `calendarId`     | Full id of the calendar this copy lives on, or `null` when only the hint is known (never guessed) |
| `calendarIdHint` | The abbreviation Calendar uses in its DOM (`owner@m`)                                             |
| `kind`           | `event`, `task`, `birthday`, `unknown`                                                            |
| `rawId`          | Calendar's own token (`data-eventid`); `/r/eventedit/<rawId>` opens the editor                    |
| `confidence`     | `exact` = decoded from the DOM                                                                    |

The instance suffix is the **original** start: moving one occurrence keeps its
`instanceId`. "This and following" splits a series, giving the later part a new
`eventId`. Ids are per-copy: the same event on two attendees' calendars has
different `calendarId`s.

### `EventView` (one per chip)

`getEventRef()` (never changes for a view), `getSegment()`
(`{ index, count, isPrimary }`: a multi-day event has one chip per day/week
row), `isAllDay()`, `addBadge(descriptor): BadgeHandle`,
`addHoverCard(descriptor): HoverCardHandle`.

- A view is destroyed when its chip goes away or stops showing that item.
  Calendar replaces the chip element after a cross-day drag, so your handler
  runs again for the new element.
- The drag ghost and quick-create drafts are not views.

**`addBadge({ text?, iconUrl?, title?, onClick? })`** — at least `text` or
`iconUrl`. Built with `textContent`/`createElement` (never HTML). `onClick`
receives the view and does not open the popover. A badge with `onClick` is a
native `<button>` (focusable, Enter/Space activate it, `aria-label` = `title` or
`text`, and Calendar's single-key shortcuts such as `e`/`m` do not fire from
it); one without is a plain span outside the tab order. `BadgeHandle`:
`update(changes)` (keeps its position among your badges), `remove()`. In chips
narrower than 72 px the badge is shown as a dot.

**`addHoverCard({ render, delayMs?, interactive?, label? })`** — a card beside
the chip while the user hovers it (mouse or pen) or focuses it with the
keyboard. Design and rationale: [`hover-card-plan.md`](./hover-card-plan.md).

- `render(container, eventView, { signal })` is called for **every showing**
  with a **new** `container`; fill it with DOM (no HTML strings). It may be
  `async` — nothing is shown until it resolves, so a slow `Data.getEvent()`
  never paints late — and may return a **cleanup** function, run when the card
  hides. `signal` aborts when the card hides or the pointer moves to another
  chip: stop work and do not touch the container. A throwing/rejecting `render`
  is reported (`Logger`) and shows nothing.
- `delayMs` (default 350, clamped to 0–2000) is the hover time before showing;
  keyboard focus of a chip shows the card at once (only chips Calendar makes
  focusable — 17 of 23 in a typical week; the rest are hover-only).
- `interactive: true` lets the pointer move from the chip onto the card (120 ms
  grace) so it can hold buttons and links; the card is then `role=dialog` (name:
  `label`, default "Event details"), and pointer/keys inside it are kept away
  from Calendar's handlers (Escape and Tab pass). The default card is
  `role=tooltip` and ignores the pointer completely.
- Several `addHoverCard` calls on one view are stacked in one frame in
  registration order. `HoverCardHandle`: `update(changes)` (applies from the
  next showing), `remove()`. The card is removed with the view.
- **Hides on:** the pointer leaving the chip, pointer down (click or drag
  start), click, scroll or wheel outside the card, Escape, Enter/Space (which
  open Calendar's popover), a route change, an event popover or any dialog
  opening, window blur, the chip going away, `sdk.destroy()`. **Never shown**
  for touch, while a button is held (dragging) or while a popover/dialog is
  open.
- **Placement:** beside the chip — right (left in RTL), then the other side,
  then below, then above — inside the viewport with an 8 px margin, at most 360
  px wide (shrunk on narrow windows), never over the chip so the chip's own
  click still works. It lives in an SDK-owned layer on `body` with
  `z-index: 4000`, below Calendar's overlay host (5004), so every Calendar
  popover covers it. Light/dark is taken from the real background of the grid
  (`container` is inside a frame with `data-calsdk-theme`).
- Not offered: cards for anything but event chips, touch, persistent cards.

### `EventPopoverView`

`getEventRef()`,
`addButton({ title, iconUrl?, onClick(popover) }): PopoverButtonHandle`
(`update`, `remove`). Buttons are appended in registration order in the
popover's content, survive Calendar re-rendering it, are removed on close, and
clicking one leaves the popover open. Escape and Tab still reach Calendar from a
focused button; other keys do not (so single-key shortcuts don't fire). The
quick-create dialog is not an event popover. A popover that switches to another
event is destroyed and recreated.

### `EventEditorView`

`getEventRef()` (`null` for a new event), `isNewEvent()`, `getTitle()` (live
read, `null` before the field renders). Events: `titleChange(title)`,
`saveClicked`, `destroy`. Lifetime = the `EVENT_EDIT` route. Tasks do not use
the editor route. **`saveClicked` is not "saved".**

## `Toolbar`

`addButton({ title, iconUrl, onClick }): ToolbarButtonHandle` — a 40 px icon
button just left of Calendar's Search button; `title` is the tooltip and
accessible name. Kept in place across re-renders. Not visible on settings/search
pages (Calendar hides the Search button there).

## `User`

`getEmailAddress()`, `getLanguage()` (UI language, e.g. `en`), `getTimeZone()`
(IANA zone of the account **as of load**, or `null`; Calendar renders in the
account's zone, not the browser's).

## `Data`

`getEvent(ref): Promise<CalendarEvent | null>` and
`listCalendars(): Promise< CalendarInfo[]>`, delegating to the `dataProvider`
you passed to `load()`; they reject if there is none (or it cannot list
calendars). With `@calendarsdk/google-api`: only `kind: 'event'` with a known
`calendarId`; recurring instances by instance id. `CalendarEvent` has `id`,
`calendarId`, `iCalUID?`, `status?`, `title?`, `description?`, `location?`,
`allDay`, `start`, `end` (ISO date-time, or `YYYY-MM-DD` when `allDay`),
`timeZone?`, `recurringEventId?`, `attendees?`, `conferenceUrl?`, `htmlLink?`.

## `Compat`

`getReport(): CompatReport` checks the page you are on right now;
`onIssue(handler)` (and `load({ onCompatIssue })`) reports each problem once,
shortly after load and after route changes, and again if it went away and came
back.

```ts
CompatIssue  = { severity: 'hard'|'warning'|'info', check, selectorKey?, rungIndex?, count? }
CompatReport = { variant, checkedAt, issues, selectors, structure }
```

Checks: `selector-miss` (hard: nothing matches although the element must be
there), `selector-fallback` (warning: a later candidate was needed),
`identity-decode-failed` (chips whose id cannot be read; hard if all),
`structure-drift:<landmark>` (only the CDP runner, against a baseline).
Selectors are only checked in the page state where they must exist (grid,
popover, editor). Reports never contain titles, ids or emails.

## `selectorKey`s

`mainRegion`, `eventChip`, `dateCell`, `overlayHost`, `eventPopover`,
`chipsDialog`, `popoverEventIdNode`, `popoverEditButton`, `popoverDeleteButton`,
`editorTitle`, `editorSave`, `editorCancel`, `searchButton`, `appHeader`. Each
is an ordered list of candidates tried one at a time (most semantic and
locale-independent first); `selectorOverrides` prepends to it.
