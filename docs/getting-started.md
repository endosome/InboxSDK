# Getting started

A first CalendarSDK extension in about ten minutes. Everything below is taken
from the working extensions in [`examples/`](../examples).

## 1. Project layout

```
my-extension/
  manifest.json
  content.ts        ← your code, bundled to dist/content.js
  icon.png          ← optional
```

Install the SDK and a bundler (any works; the examples use esbuild):

```sh
npm i @calendarsdk/core
npm i -D esbuild
npx esbuild content.ts --bundle --outfile=dist/content.js
```

> The scope `@calendarsdk` is a placeholder. Until the package is published, use
> this repository as a Yarn workspace (as `examples/` does) or run `yarn gulp`
> and reference `packages/core`.

## 2. The manifest

CalendarSDK runs as a **content script** — never as remote code and never in the
page's own JavaScript context.

```json
{
  "manifest_version": 3,
  "name": "My Calendar extension",
  "version": "0.0.1",
  "content_scripts": [
    {
      "matches": ["https://calendar.google.com/*"],
      "js": ["dist/content.js"],
      "run_at": "document_end"
    }
  ],
  "web_accessible_resources": [
    { "resources": ["icon.png"], "matches": ["https://calendar.google.com/*"] }
  ]
}
```

`web_accessible_resources` is only needed if you show your own icons in badges,
buttons or the toolbar (`chrome.runtime.getURL('icon.png')`). `data:` URLs work
without it.

## 3. Load the SDK

```ts
import CalendarSDK from '@calendarsdk/core';

CalendarSDK.load(1, { appId: 'my-extension' }).then((sdk) => {
  console.log('signed in as', sdk.User.getEmailAddress());
  sdk.Router.registerRouteViewHandler((route) => {
    console.log('route', route.getType(), route.getAnchorDate());
    route.on('destroy', () => console.log('left', route.getType()));
  });
});
```

- `1` is the API version. `appId` is any string that identifies your extension;
  it namespaces what you inject, so several extensions (or two copies of the
  SDK) can coexist.
- `load()` resolves once Calendar has rendered its user info and rejects after
  15 s (`readyTimeoutMs`) or on any other origin.
- Load it in Chrome via `chrome://extensions` → Developer mode → **Load
  unpacked**, open Calendar, and look at the page console. **After rebuilding,
  reload the extension _and_ the tab.**

## 4. Everything has a lifetime

Every view (route, event chip, popover, editor) is an object that emits
`destroy` when its thing goes away, and has `destroyed: boolean`. Register
handlers, not one-off queries: handlers are called for what is on the page now
and for everything that appears later, and they return an unregister function.

```ts
const stop = sdk.Events.registerEventViewHandler((eventView) => {
  eventView.on('destroy', () => {
    /* clean up anything you keep per event */
  });
});
// later: stop();
```

## 5. Know which event it is

Every chip and popover has a stable identity:

```ts
const ref = eventView.getEventRef();
ref.eventId; // base id (the series id for a recurring event)
ref.instanceId; // recurring instances only: '20260929T110000Z' or '20260930'
ref.kind; // 'event' | 'task' | 'birthday' | 'unknown'
ref.calendarId; // full calendar id, or null if only the hint is known
ref.rawId; // Calendar's own token; /r/eventedit/<rawId> opens the editor
```

Chips for tasks and birthdays exist too but are only delivered if you ask:
`registerEventViewHandler(handler, { kinds: ['event', 'task', 'birthday'] })`. A
multi-day event has one view per chip (`getSegment()` says which). When Calendar
replaces a chip (e.g. after a drag to another day) the old view is destroyed and
a new one is created, so your handler runs again — keep your state keyed by
`eventId`/`instanceId`, not by the view.

## 6. Add a badge to every event

```ts
sdk.Events.registerEventViewHandler((eventView) => {
  const handle = eventView.addBadge({
    text: 'CRM',
    iconUrl: chrome.runtime.getURL('icon.png'), // optional
    title: 'Open in CRM',
    onClick: (view) => console.log('badge', view.getEventRef().eventId),
  });
  // handle.update({ text: 'CRM ✓' }); handle.remove();
});
```

Calendar strips foreign nodes when it re-renders a chip (for instance whenever a
popover opens); the SDK puts your badge back before the next paint. Clicking a
badge does not open Calendar's popover. In narrow chips the badge shrinks to a
dot (the tooltip keeps the text).

## 7. Add a button to every popover

```ts
sdk.Events.registerEventPopoverHandler(
  (popover) => {
    popover.addButton({
      title: 'Open in CRM',
      onClick: (p) => console.log('crm', p.getEventRef().eventId),
    });
  },
  { kinds: ['event', 'task', 'birthday'] },
);
```

The button lives in the popover's content, is removed when the popover closes,
and the popover stays open when it is clicked. The quick-create dialog is never
treated as an event popover.

## 8. React to the editor

```ts
sdk.Events.registerEventEditorHandler((editor) => {
  console.log(editor.isNewEvent() ? 'new event' : editor.getEventRef());
  editor.on('titleChange', (title) => console.log('typing', title));
  editor.on('saveClicked', () =>
    console.log('Save clicked', editor.getTitle()),
  );
  editor.on('destroy', () => console.log('editor closed'));
});
```

The editor view lives exactly as long as the editor page; dialogs on top of it
(guest confirmation, recurring scope) do not end it. **`saveClicked` means the
button was clicked, not that the event was saved** — Calendar may still ask
questions and the user can back out.

## 9. The top bar and navigation

```ts
sdk.Toolbar.addButton({
  title: 'Open CRM',
  iconUrl: chrome.runtime.getURL('icon.png'),
  onClick: () => sdk.Router.goto({ type: 'MONTH', date: '2026-10-15' }),
});
```

`Router.goto` navigates inside Calendar without reloading the page and resolves
when the route has changed. Targets: a view (`DAY`, `WEEK`, `MONTH`, `YEAR`,
`AGENDA`, `CUSTOM_DAYS`, `date` optional = today), `{ type: 'SEARCH', query }`,
or the `EventRef` of an event (opens its editor). It rejects on a bad target or
if Calendar does not navigate within 5 s.

## 10. Event details from the Calendar API (optional)

The page shows a title and a time, not attendees or descriptions. For those,
give the SDK a data provider. The SDK never sees tokens: your extension owns
OAuth and hands `@calendarsdk/google-api` a function that returns an access
token.

```ts
import { createGoogleCalendarProvider } from '@calendarsdk/google-api';

const provider = createGoogleCalendarProvider({
  getAccessToken: async ({ forceRefresh } = {}) => myOAuthToken(forceRefresh),
});
const sdk = await CalendarSDK.load(1, {
  appId: 'my-extension',
  dataProvider: provider,
});

const details = await sdk.Data.getEvent(popover.getEventRef()); // CalendarEvent | null
```

Only real events with a known calendar are looked up (never guessed); a
recurring instance is fetched by its instance id and is `null` if the API does
not know it. See
[`packages/google-api/README.md`](../packages/google-api/README.md). The
instance-id correlation has not yet been verified against the live API.

## 11. Know when Google changed something

```ts
const sdk = await CalendarSDK.load(1, {
  appId: 'my-extension',
  onCompatIssue: (issue) => console.warn('CalendarSDK compat', issue),
});
console.log(sdk.Compat.getReport()); // selector health of the page you are on, right now
```

`hard` issues mean a part of the SDK cannot find what it needs on this page
(`selector-miss`); `warning` means a fallback selector was needed
(`selector-fallback`) or the markup's shape drifted. Reports contain no titles,
ids or emails, and nothing is sent anywhere. If you need to react to a change
before a new SDK release, `selectorOverrides` prepends your own candidate
selectors to any key (never replaces the bundled ones).

## 12. Good habits

- **Don't depend on Calendar's markup yourself.** Use `EventRef`, views and
  handles; if you must query the page, prefer `data-*` and `role` attributes
  over class names (which are obfuscated and change).
- **Keep handlers cheap.** They run for every chip; with hundreds of chips a
  handler that does a network call per event will hurt. Batch, cache by
  `eventId`.
- **Never assume a chip's text.** It is localized user content (and locale
  dependent for the time); use the ref and the data provider.
- **Handle `null`.** `calendarId` can be `null`, `getTitle()` can be `null`
  before the editor renders, `getAnchorDate()` can be `null` right after
  "Today".

## Troubleshooting

| Symptom                                                       | Cause / fix                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CalendarSDK only runs on https://calendar.google.com`        | wrong `matches` / running on another site                                                             |
| `load()` rejects with "user info (#xUserInfo) did not appear" | not signed in, or a consent/interstitial page; raise `readyTimeoutMs`                                 |
| Nothing changed after a rebuild                               | reload the extension in `chrome://extensions` **and** the Calendar tab                                |
| Badge/button missing on tasks or birthdays                    | they are opt-in: pass `{ kinds: ['event', 'task', 'birthday'] }`                                      |
| Icon does not show                                            | add it to `web_accessible_resources` for `https://calendar.google.com/*`, or use a `data:` URL        |
| Something worked yesterday, not today                         | Google changed Calendar: check `sdk.Compat.getReport()`; see `docs/calendar-compatibility-testing.md` |
