# Changelog

All notable changes to `@calendarsdk/core` and `@calendarsdk/google-api`. The
project follows semantic versioning; `CalendarSDK.load(1, …)` gates the API
version, and Google UI drift is handled in patch releases (see
`docs/calendar-sdk-plan.md` §16).

## Unreleased (0.1.0, not yet published)

First functional version, derived from InboxSDK with the Gmail integration
removed.

### Added

- `CalendarSDK.load(1, { appId, … })` for Manifest V3 content scripts on
  `https://calendar.google.com`; one live SDK per `appId`.
- `Router` (`registerRouteViewHandler`, `getCurrentRouteView`, `goto`) and
  `RouteView` (`getType`, `getAnchorDate`, `getSearchQuery`, `getEventRef`).
- `Events.registerEventViewHandler` → `EventView` (`getEventRef`, `getSegment`,
  `isAllDay`, `addBadge`); `registerEventPopoverHandler` → `EventPopoverView`
  (`addButton`); `registerEventEditorHandler` → `EventEditorView`.
- `Toolbar.addButton`; `User`; `Data` (`getEvent`, `listCalendars`) with an
  optional `dataProvider`; `Compat` (`getReport`, `onIssue`, `onCompatIssue`).
- `EventRef` identity (base id, instance id, calendar id when known, kind, raw
  token).
- `@calendarsdk/google-api`: Calendar API data provider (you supply the token).
- Docs: README, getting started, API reference; compatibility runner and
  real-markup fixtures for detecting Google changes.

### Known limits

Workspace accounts and the Calendar API instance-id correlation are unverified;
see the README and the plan's phase audit.
