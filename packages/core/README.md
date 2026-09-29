# @calendarsdk/core

Library for building Chrome (Manifest V3) extensions that add features to Google
Calendar: routes, event chips and badges, popover buttons, the event editor, the
top bar and stable event identity — no OAuth, no network, no telemetry, no
remote code.

```ts
import CalendarSDK from '@calendarsdk/core';

const sdk = await CalendarSDK.load(1, { appId: 'my-extension' });
sdk.Events.registerEventViewHandler((v) => v.addBadge({ text: 'CRM' }));
```

Run it as a content script on `https://calendar.google.com/*`. See the
repository's [README](../../README.md),
[getting started](../../docs/getting-started.md) and
[API reference](../../docs/api.md). Optional companion:
[`@calendarsdk/google-api`](../google-api).

The `@calendarsdk` scope is a placeholder until the final package name is
chosen.
