# CalendarSDK

CalendarSDK is a JavaScript library for building **Chrome (Manifest V3)
extensions that add features to Google Calendar** without having to understand
Calendar's private DOM, routing or lifecycle. It turns Calendar's unstable page
into a small, stable API: routes, event chips, popovers, the event editor, the
top bar, and the identity of every event you see.

It started as a fork of [InboxSDK](https://github.com/InboxSDK/InboxSDK)
(Gmail), keeping its generic infrastructure (handler registries, selector
chains, lifetimes) and replacing the Gmail integration.

```ts
import CalendarSDK from '@calendarsdk/core';

const sdk = await CalendarSDK.load(1, { appId: 'my-extension' });

// a "CRM" badge on every event, and a button in every event popover
sdk.Events.registerEventViewHandler((eventView) => {
  eventView.addBadge({ text: 'CRM', title: 'Open in CRM' });
});
sdk.Events.registerEventPopoverHandler((popover) => {
  popover.addButton({
    title: 'Open in CRM',
    onClick: () => console.log('open', popover.getEventRef().eventId),
  });
});
```

## What you get

| You want to…                                         | API                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| know which page the user is on (day/week/…/editor)   | `sdk.Router.registerRouteViewHandler`, `getCurrentRouteView()`          |
| move the user around without a reload                | `sdk.Router.goto({ type: 'WEEK', date: '2026-09-30' })`                 |
| react to every event chip, and mark it               | `sdk.Events.registerEventViewHandler` → `eventView.addBadge()`          |
| add actions to an event's popover                    | `sdk.Events.registerEventPopoverHandler` → `popover.addButton()`        |
| react to the full-page editor (which event, title)   | `sdk.Events.registerEventEditorHandler`                                 |
| put a button in Calendar's top bar                   | `sdk.Toolbar.addButton()`                                               |
| know which event a chip/popover is (stable identity) | `getEventRef()` → `{ eventId, instanceId, calendarId, kind, rawId, … }` |
| get attendees, description, … (needs the API)        | `sdk.Data.getEvent(ref)` with `@calendarsdk/google-api`                 |
| find out early when Google changed something         | `sdk.Compat.getReport()` / `onIssue()`                                  |

Start with **[`docs/getting-started.md`](./docs/getting-started.md)**; every
call is documented in **[`docs/api.md`](./docs/api.md)**.

## Design in one paragraph

Calendar re-renders aggressively and its markup is obfuscated, so the SDK never
trusts a single selector or a single moment. Selectors are ordered chains with
locale-independent rungs first; injected nodes (badges, buttons) are _desired
state_ that is put back the moment Calendar strips them (before the next paint);
event identity comes from the `data-eventid` token Calendar itself uses in its
URLs; every view has an explicit lifetime (`destroy` event); and a built-in
compatibility check (`sdk.Compat`) plus a live runner detect breakage before
your users do. Nothing is sent anywhere: no telemetry, no remote code.

## Requirements and limits

- Chromium, Manifest V3 **content script** on `https://calendar.google.com/*`
  (no page-world script; the SDK is bundled into your extension — no remote
  code). `CalendarSDK.load()` rejects on any other origin.
- Verified live on consumer accounts in `en`, `de`, `pl`, `ja`, `zh-CN`, `ar`,
  `he` (RTL included), light/dark theme, all densities, windows down to 420 px.
  **Not yet verified:** Google Workspace accounts (custom-domain calendar ids)
  and the Calendar API correlation of recurring-instance ids — see
  [`docs/calendar-sdk-plan.md`](./docs/calendar-sdk-plan.md) (Phase 4, §10).
- Calendar has no public UI-extension API. This library depends on undocumented
  markup, so it can break when Google ships changes; that risk is managed, not
  removed (see `sdk.Compat` and the compatibility docs).

## Packages

| Package                                            | What it is                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`@calendarsdk/core`](./packages/core)             | The SDK (UI, routing, identity). No OAuth, no network.                                |
| [`@calendarsdk/google-api`](./packages/google-api) | Optional `CalendarDataProvider` backed by the Calendar API; **you** supply the token. |

The scope `@calendarsdk` is a placeholder until the project owner picks a final
name.

## Examples

`examples/` has ready-to-load extensions, each a few lines: `calendar-hello`
(load + routes), `calendar-events` (chip lifecycle), `calendar-badges`,
`calendar-popover-button`, `calendar-editor`, `calendar-toolbar`,
`calendar-goto`, `calendar-compat`, `calendar-smoke`. `yarn gulp` builds them
all; load one from `chrome://extensions` (Developer mode → Load unpacked).

## Development

Requires Node (see `.nvmrc`) and Yarn 4.

```sh
yarn install
yarn gulp       # build packages/core/calendarsdk.js, generate types, build examples/*/dist
yarn workspace @calendarsdk/google-api build   # the optional API package (dist/)
yarn test       # Jest (jsdom)
yarn typecheck  # tsc (run `yarn gulp` first so packages/core types exist)
yarn lint       # ESLint + Prettier
```

`tools/calendar-probe/` drives a real, **human-signed-in** Chrome over CDP: the
investigation scripts, the live tests (`experiments/extension-*.mjs`) and the
compat runner (`compat-runner.mjs`). It only ever uses dedicated test accounts,
never handles credentials, and its output is git-ignored. See its README.

## Documentation

- [`docs/getting-started.md`](./docs/getting-started.md) — first extension, step
  by step
- [`docs/api.md`](./docs/api.md) — API reference
- [`docs/releasing.md`](./docs/releasing.md) — release checklist;
  [`CHANGELOG.md`](./CHANGELOG.md)
- [`docs/calendar-sdk-plan.md`](./docs/calendar-sdk-plan.md) — architecture,
  decisions, phase status
- [`docs/calendar-reverse-engineering.md`](./docs/calendar-reverse-engineering.md)
  — verified Calendar behaviour (start at §0.1)
- [`docs/calendar-compatibility-testing.md`](./docs/calendar-compatibility-testing.md)
  — compatibility strategy and the runner
- [`docs/inboxsdk-architecture-analysis.md`](./docs/inboxsdk-architecture-analysis.md)
  — what was kept from InboxSDK and why

## License and attribution

Derived from InboxSDK, Copyright (c) 2014 - present Streak, licensed under
either the Apache License 2.0 or the MIT license, at your option. See
[LICENSE-APACHE.txt](LICENSE-APACHE.txt), [LICENSE-MIT.txt](LICENSE-MIT.txt) and
[COPYRIGHT.txt](COPYRIGHT.txt).
