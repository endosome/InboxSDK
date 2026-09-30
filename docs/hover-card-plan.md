# Hover card — plan

Status: **built** in the order of §9 (positioning → service → wiring → example
and live test → docs); live results are recorded in §10. Related: plan §7.4.1
(overlay layer), RE §1.25 (hover facts), `docs/api.md`.

## 1. Goal and scope

An extension can show an arbitrary card next to an event chip while the user
hovers it (or focuses it with the keyboard) in any grid view — the motivating
case is week view. The extension supplies the content; the SDK owns positioning,
timing, stacking, lifetime and getting out of the way of Calendar's own UI.

**In scope:** `EventView.addHoverCard`, an SDK-owned overlay layer, all grid
views that have `[data-eventchip]` chips (week, day, N-days, month, schedule),
mouse/pen hover and keyboard focus, light/dark, RTL, narrow windows.

**Non-goals:** touch devices (no hover; not shown), a card that replaces or
edits Calendar's popover, dragging the card, cards for anything but chips (day
cells, header, sidebar), cards that persist after the pointer left.

## 2. What we verified (RE §1.25)

- Chips have no native hover UI; Calendar listens to `mouseenter`/`mouseleave`
  on them itself → our listeners are passive (never `stopPropagation`).
- Pointer events reach a capture listener on `document`.
- Ancestors of a chip clip (`overflow: hidden`), and the grid scrolls in its own
  container → the card must live **outside** the grid.
- A `position: fixed` layer on `body` with z-index < 5004 paints above the grid,
  survives Calendar's re-renders and sits below every popover/dialog (`#yDmH0d`
  is z-index 5004).
- The drag ghost is outside `[role=main]`; chip eligibility already excludes it.
- **Unverified (live checks in §8):** overlapping chips, month "+N more", drag
  timing, keyboard focusability of every chip (17/23 have `tabindex`).

## 3. Public API

```ts
interface EventView {
  addHoverCard(descriptor: HoverCardDescriptor): HoverCardHandle;
}
interface HoverCardDescriptor {
  /**
   * Fill `container` (a fresh element, created for this showing). May be async and may
   * return a cleanup function. `signal` aborts when the card hides or the pointer
   * moves to another chip: stop work and don't touch `container` after that.
   */
  render(
    container: HTMLElement,
    eventView: EventView,
    context: { signal: AbortSignal },
  ): void | (() => void) | Promise<void | (() => void)>;
  /** Hover time before showing, ms. Default 350, clamped to 0–2000. */
  delayMs?: number;
  /** Let the pointer move from the chip onto the card (links, buttons). Default false. */
  interactive?: boolean;
  /** Accessible name of the card (the card is `role=tooltip`, or `role=dialog` when interactive). */
  label?: string;
}
interface HoverCardHandle {
  update(changes: Partial<HoverCardDescriptor>): void;
  remove(): void;
}
```

Rules:

- **Content:** `render` is called on **every showing** into a **new** container,
  so the card never shows stale content. The app builds DOM (`textContent`,
  elements); the SDK never accepts HTML strings. Errors and rejections go to
  `reportError`; a card whose `render` throws is not shown. While a promise is
  pending the card is not shown (an app that wants a spinner renders one
  synchronously first).
- **Abort:** `signal` fires on hide, on pointer-to-another-chip, on view destroy
  and on `remove()`. A late `Data.getEvent()` must check `signal.aborted` before
  painting.
- **Multiplicity:** several `addHoverCard` calls on one view (or several apps on
  one chip) each get their own card; they are shown **stacked in a single
  column** in the order of registration (own SDK instance first, other `appId`s
  after, ordered by appId) — one layer per `appId`, laid out by the first
  instance that shows (see §5.3). Documented limit: two apps' cards are
  independent (no coordination beyond stacking).
- **Lifetime:** removed with the view (`destroy`) and by `remove()`;
  `sdk.destroy()` and the same-`appId` takeover remove the layer and every
  listener.

## 4. Behaviour (decisions)

| #   | Topic             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trigger           | `pointerenter` of a chip with `pointerType` `mouse`/`pen` → show after `delayMs`; keyboard: `focusin` on a chip (immediately, no delay). Delegated capture listeners on `document`, mapped chip → view by the registry (`getDriverForElement`); no per-chip listeners.                                                                                                                                                                                                                                                |
| 2   | Hide              | `pointerleave` of the chip (after a 120 ms grace so the pointer can cross to an interactive card), `pointerdown` anywhere (a click or a drag start), `pointerup`/`click` on the chip, scroll (capture on `document` — the grid scrolls in its own container), `wheel`, Escape, route change, an event popover or any `role=dialog` opening, view destroy, `blur` of the chip (when shown by focus), window `blur` / `visibilitychange`, `sdk.destroy()`.                                                              |
| 3   | Never show        | while the pointer button is down (drag/resize), for `pointerType === 'touch'`, while an event popover or dialog is open, while a card of another chip is still within its hide grace (it is replaced instead), when the chip is not connected/eligible any more.                                                                                                                                                                                                                                                      |
| 4   | Bridge            | For `interactive: true`, `pointerenter` on the card cancels the pending hide and `pointerleave` of the card restarts it; the card stays while the pointer is on the chip **or** the card. Non-interactive cards have `pointer-events: none`, so they can never trap or block the pointer.                                                                                                                                                                                                                             |
| 5   | Switching chips   | Moving from chip A to chip B (or leaving A within the grace and entering B): A's card is hidden immediately (its `signal` aborts) and B's delay starts fresh — no queue of stale cards.                                                                                                                                                                                                                                                                                                                               |
| 6   | Placement         | Beside the chip, never over it (the chip's own click must still work): prefer right, then left, then below, then above; clamp to the viewport with an 8 px margin; max width `min(360px, viewport − 16px)`, max height `viewport − 16px` with internal scroll; flip for RTL (`dir=rtl` on `html`/body → prefer left first). Positioned from `chip.getBoundingClientRect()` (pure function, §6.1); re-positioned once after `render` resolves and on window resize. A chip that is off-screen or 0×0 shows nothing.    |
| 7   | Stacking          | One `position: fixed` layer per `appId` on `document.body`, `z-index: 4000` (< Calendar's overlay host 5004, so every popover/dialog covers it), `pointer-events: none` on the layer itself.                                                                                                                                                                                                                                                                                                                          |
| 8   | Theme             | Calendar's dark theme is its own setting, not `prefers-color-scheme`: the card derives light/dark from the computed background colour of `[role=main]` (luminance) at each showing, and uses neutral colours (`Canvas`-like surface, subtle border/shadow) for both. Content styling is the app's; it can read `container.dataset.calsdkTheme` (`light`/`dark`).                                                                                                                                                      |
| 9   | Style isolation   | The container is **not** in a shadow root (apps want normal CSS/frameworks and Calendar's page CSS is obfuscated, class-based, and does not restyle plain `div`s). The SDK's own CSS is prefixed `calsdk-` and inserted once; the card sets `all: initial`-free, explicit `font`, `color`, `line-height` so Calendar's inherited body styles don't leak in unpredictably. Revisit (shadow root) if a real conflict shows up.                                                                                          |
| 10  | Accessibility     | Non-interactive: `role=tooltip`, `aria-label` = `label` (if given). Interactive: `role=dialog`, `aria-label` = `label` (required, else "Event details"), not modal, no focus trap; focus stays on the chip (shown by hover) or the chip (shown by focus). We do **not** write `aria-describedby` onto Calendar's chips (re-rendered). Escape hides without `stopPropagation` (Calendar's Escape still works). Keyboard users get the card on `focusin`; hover-only chips (no `tabindex`) are hover-only — documented. |
| 11  | Event containment | Interactive cards stop `pointerdown`/`mousedown`/`pointerup`/`dblclick`/`contextmenu`/`click` propagation to Calendar (like badges and popover buttons) and single-key `keydown`/`keyup`/`keypress` except Escape and Tab. Clicks inside the card must never count as "click outside" for Calendar. Interactive controls the app puts in the card should be native `<button>`/`<a>` (Calendar ignores shortcuts from buttons, RE §1.24 — but not from other elements, hence the key containment).                     |
| 12  | Selectors         | None new. The chip is `eventChip` (already in the registry and compat specs); the grid background probe uses `mainRegion`. If one is ever added it needs a `SELECTOR_SPECS` entry (enforced by a test).                                                                                                                                                                                                                                                                                                               |
| 13  | Failure policy    | If the chip has no view (not eligible) → no card. If positioning fails (0×0) → no card. Never throw into Calendar's event dispatch; every listener body is `try/catch` → `reportError`.                                                                                                                                                                                                                                                                                                                               |

## 5. Architecture

### 5.1 Modules

```
dom-driver/google-calendar/
  hover-position.ts                 pure: (anchor rect, card size, viewport, dir) → {left, top, placement}
  services/hover-card-service.ts    per-appId layer + delegated listeners + state machine + registry of cards
  services/hover-card-style.ts      CSS (calsdk- prefixed)
driver-interfaces/event-view-driver.ts   + addHoverCard(descriptor): HoverCardHandle
views/event-view.ts                       + addHoverCard (passes the view to render)
```

### 5.2 State machine (per SDK instance; one card visible at a time per appId)

```
idle ──pointerenter chip (eligible, mouse/pen, no button, no dialog)──▶ pending(chip, timer)
pending ──delay elapsed──▶ rendering(chip, controller)      [render(...) called, signal live]
rendering ──render resolved & chip still hovered──▶ shown(chip)
rendering/pending/shown ──any hide trigger (§4.2)──▶ idle   [abort signal, run cleanup, remove container]
shown ──pointerleave chip──▶ leaving(grace 120 ms) ──pointerenter card (interactive)──▶ shown
leaving ──grace elapsed──▶ idle
any ──pointerenter another chip──▶ (hide current) pending(new chip)
```

A generation counter guards every async step (a resolved `render` from an
aborted showing is ignored, its container never attached).

### 5.3 Layer ownership

Each SDK instance (`appId`) owns one layer element (`data-calsdk-owned=<appId>`,
`data-calsdk-hover-layer`). Cards of several cards-on-one-chip are stacked
inside that instance's single card frame; cards of different apps are separate
layers at the same z-index and are offset vertically by the placement code if
their rectangles overlap (documented as best-effort).

## 6. Tests

### 6.1 Unit (jsdom, fake timers)

- `hover-position.ts`: all placements, flip at each edge, clamping, RTL, card
  larger than the viewport, anchor partially off-screen, zero-size anchor
  (returns null).
- `hover-card-service`: delay; `delayMs` clamping; leaving before the delay
  cancels; grace + bridge for interactive cards; every hide trigger in §4.2; no
  card while pointer down / touch / dialog open; switch A→B aborts A's signal;
  late `render` after abort never attaches; sync throw and async rejection are
  reported and show nothing; several cards on one view; `update`/`remove`; view
  destroy; focus trigger; `stop()` leaves no layer, listeners, timers or styles;
  same-`appId` takeover leaves one layer; non-interactive card has
  `pointer-events: none`; interactive containment (keys/pointer, Escape/Tab
  pass); theme detection.
- One test against the real-markup `week` fixture (chips found, view mapped, a
  card placed with stubbed rects).

### 6.2 Live (`extension-hover-card.mjs`, real Chrome, `examples/calendar-hover-card`)

Hover shows after the delay with the right event; leave hides; card is beside
not over the chip and inside the viewport; an opened popover covers the card
(`elementFromPoint`); hides on drag start, scroll, wheel, route change, Escape;
keyboard focus shows it; interactive card can be entered and a button inside
works without opening Calendar's popover; overlapping chips → one card for the
chip actually under the pointer; month view; dark theme; 420 px window; `ar`
(RTL); per-frame meter: a card never remains visible ≥ 3 frames after the
pointer left its chip and grace; badges and popover-button live suites still
pass with the hover listeners installed.

## 7. Risks and known limits

| Risk                                                    | Mitigation / documented limit                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document-level listeners slow chip-heavy pages          | all handlers early-out on `closest` + registry lookup; `pointermove` is not used; scroll/wheel listeners are passive and only act while a card exists |
| A card covering something Calendar needs                | placed beside the chip, `pointer-events: none` unless interactive, hides on pointerdown                                                               |
| Calendar changes hover behaviour (adds its own tooltip) | live test asserts "no native tooltip"; the compat runner can add a check; the card is opt-in per app                                                  |
| Overlapping chips (hover target ambiguity)              | the browser's hit-test decides (`pointerenter` on the top chip); verified live                                                                        |
| Chips without `tabindex` are not keyboard-reachable     | documented: hover-only for those                                                                                                                      |
| Month "+N more" popups                                  | not chips; no card; verified live that nothing breaks                                                                                                 |
| Touch                                                   | not shown; documented                                                                                                                                 |
| Very tall content                                       | max-height with internal scroll                                                                                                                       |

## 8. Exit criteria

1. All unit tests in §6.1 pass; typecheck/lint/gulp/check-packages green.
2. Every live check in §6.2 passes, including the per-frame meter and the
   regression run of the badge/popover/toolbar/goto/editor suites.
3. Docs: `api.md` (API + behaviour + limits), `getting-started.md` (a short
   section), `CHANGELOG.md`, `calendarsdk.d.ts`, plan §4/§7.4.1/§12 updated.
4. Nothing leaks: after `sdk.destroy()` no layer, listener or style remains
   (test + live).

## 9. Build order

1. `hover-position.ts` + tests. 2. `hover-card-service` + tests. 3. Wiring:
   driver interface, `EventView.addHoverCard`, `CalendarDriver`, public types.
2. Example + live test; fix what it finds. 5. Docs. 6. Regression of all suites
   and package check. Each step is its own commit.

## 10. Result (live, real Chrome)

`extension-hover-card.mjs` (with `examples/calendar-hover-card`): **33 of 33
checks pass** — no card before the delay, shown after it beside the chip (never
over it) and inside the viewport, `role=tooltip` / `role=dialog` for interactive
cards, layer on `body` with z-index below Calendar's overlay host (5004) and
ignoring the pointer, hidden at once on leave with `signal` aborted and cleanup
run, hidden on pointer down, wheel, Escape and route change, keyboard focus
shows it without delay and Escape hides it, no card while a popover is open, the
pointer can cross onto an interactive card and use its button without Calendar
opening a popover or navigating, exactly one card for overlapping chips (the one
under the pointer), month view, dark and light theme from the real grid
background, a 420 px window (≤ 404 px wide, chip uncovered), Arabic/RTL (card on
the left), and the per-frame meter shows no card lingering after the pointer
left.

Bugs the live test found and fixed (each has a unit test now):

1. **The grace timer closed an interactive card while the pointer was still
   inside it.** `pointerleave` fires for every element the pointer leaves,
   including children of the card; only the frame itself (or the chip) means
   "gone" (`extension-hover-card.mjs`, "pointer can cross onto the card").
2. Using an interactive card (click, pointerdown, scroll, Enter on its own
   button) must not close it: those document-level triggers now ignore events
   from inside the frame; Escape still closes it.

Harness lessons (not SDK bugs): Chrome replays the last pointer position after a
page load as a hover — park the mouse before a scenario; a popover left open
(correctly) blocks cards, so hide-trigger scenarios start from a fresh page.

Known limits (also in `api.md`): touch devices get no card; chips without
`tabindex` are hover-only; two apps' cards on one chip are independent layers
(best-effort, not coordinated).
