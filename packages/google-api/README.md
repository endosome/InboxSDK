# @calendarsdk/google-api

A `CalendarDataProvider` for `@calendarsdk/core` backed by the Google Calendar
API. It never asks for credentials: **your extension owns OAuth** and hands this
package a function that returns an access token (scope
`https://www.googleapis.com/auth/calendar.events.readonly`, plus
`calendar.calendarlist.readonly` for `listCalendars`).

```ts
import CalendarSDK from '@calendarsdk/core';
import { createGoogleCalendarProvider } from '@calendarsdk/google-api';

const provider = createGoogleCalendarProvider({
  // e.g. chrome.identity.getAuthToken; called again with forceRefresh after a 401
  getAccessToken: async ({ forceRefresh } = {}) => myToken(forceRefresh),
});
const sdk = await CalendarSDK.load(1, {
  appId: 'my-ext',
  dataProvider: provider,
});
sdk.Events.registerEventPopoverHandler(async (popover) => {
  const event = await sdk.Data.getEvent(popover.getEventRef());
  console.log(event?.attendees?.length);
});
```

Rules it follows:

- Only events (`ref.kind === 'event'`) with a known `calendarId` are looked up —
  it never guesses which calendar a chip belongs to (tasks and birthdays are not
  events of the Calendar API; a chip whose full calendar id is unknown resolves
  to `null` unless you give `resolveCalendarId`).
- A recurring instance is looked up by its instance id (`<id>_<UTC start>` or
  `<id>_<date>`); if that is not found it resolves to `null` — it never silently
  returns the series.
- 404/410 → `null`; 401/403 and other failures → `CalendarApiError` (status and
  Google's reason, never the token); 429/5xx are retried twice with backoff.

Status: **the instance-id correlation is unverified against the live API** (see
the repository's `docs/calendar-sdk-plan.md`, §10 and Phase 4).
