# CalendarSDK

CalendarSDK is a JavaScript library for building browser extensions that
integrate with **Google Calendar**, without having to understand Calendar's
private DOM, routing or lifecycle behaviour. It is a fork of
[InboxSDK](https://github.com/InboxSDK/InboxSDK) (Gmail) that keeps the generic
infrastructure and replaces the Gmail integration.

**Status: early development.** Only the bootstrap exists: `CalendarSDK.load()`
runs on `https://calendar.google.com`, resolves a minimal SDK object and rejects
everywhere else. The investigation and the implementation plan live in
[`docs/`](./docs):

- [`docs/calendar-sdk-plan.md`](./docs/calendar-sdk-plan.md) — architecture, V1
  API, phases, decisions still open
- [`docs/calendar-reverse-engineering.md`](./docs/calendar-reverse-engineering.md)
  — verified Google Calendar behaviour (start at §0.1)
- [`docs/calendar-compatibility-testing.md`](./docs/calendar-compatibility-testing.md)
  — live compatibility checks and test strategy
- [`docs/inboxsdk-architecture-analysis.md`](./docs/inboxsdk-architecture-analysis.md)
  — what was kept from InboxSDK and why

## Usage (bootstrap)

```ts
import CalendarSDK from '@calendarsdk/core';

const sdk = await CalendarSDK.load(1, { appId: 'my-extension' });
```

The package targets Manifest V3 content scripts matching
`https://calendar.google.com/*`. There is no page-world script and no remote
code loading.

## Development

Requires Node (see `.nvmrc`) and Yarn 4.

```sh
yarn install
yarn gulp       # build packages/core/calendarsdk.js and examples/*/dist
yarn test       # Jest (jsdom)
yarn typecheck  # tsc (run `yarn gulp` first so packages/core types exist)
yarn lint       # ESLint + Prettier
```

`tools/calendar-probe/` contains experimental scripts that drive a real,
human-signed-in Chrome over CDP to investigate Calendar; see its README.

## License and attribution

Derived from InboxSDK, Copyright (c) 2014 - present Streak, licensed under
either the Apache License 2.0 or the MIT license, at your option. See
[LICENSE-APACHE.txt](LICENSE-APACHE.txt), [LICENSE-MIT.txt](LICENSE-MIT.txt) and
[COPYRIGHT.txt](COPYRIGHT.txt).
