# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

CalendarSDK is a Yarn 4 monorepo for building Google Calendar browser
extensions. There is no standalone web app or backend — development centers on
building the `@calendarsdk/core` SDK (`packages/core`) and testing via example
Chrome MV3 extensions under `examples/`. It is derived from InboxSDK (Gmail);
the Gmail integration was deleted in Phase 1. Read `docs/calendar-sdk-plan.md`
before changing architecture and `docs/calendar-reverse-engineering.md` §0.1 for
verified Calendar behaviour. The public API is documented in `docs/api.md` and
`docs/getting-started.md`; update them together with `src/calendarsdk.d.ts`.

### Commands

| Purpose    | Command               | Notes                                                                       |
| ---------- | --------------------- | --------------------------------------------------------------------------- |
| Build      | `yarn gulp`           | Builds `packages/core/calendarsdk.js`, generates types, builds `examples/*` |
| Watch      | `yarn start`          | `gulp default -w --reloader`                                                |
| Unit tests | `yarn test`           | Jest in jsdom                                                               |
| Typecheck  | `yarn typecheck`      | `tsc`; run `yarn gulp` first (examples import `@calendarsdk/core` types)    |
| Lint       | `yarn lint`           | ESLint + Prettier                                                           |
| CSS lint   | `yarn lint:stylelint` | Stylelint (currently no CSS files)                                          |

### Verification after changes

Whenever you make code or style changes, run the relevant checks before handing
off: `yarn test`, `yarn lint`, `yarn typecheck` (after `yarn gulp`), and
`yarn lint:stylelint` for CSS changes. After `yarn gulp`, verify
`packages/core/calendarsdk.js` and `examples/*/dist/content.js` exist.

### Rules that come from Google Calendar

- **HTML-string DOM sinks** (`innerHTML`, `insertAdjacentHTML`, …) are fine in
  content-script code (Trusted Types do not apply to real content scripts) but
  **forbidden in MAIN-world code** (`src/injected-js/`, ESLint-enforced), where
  Calendar's `require-trusted-types-for 'script'` makes them throw.
- Never send data anywhere from core; diagnostics go through `lib/reporter.ts`.
- Do not rely on `<html data-prefetch-view-key>` for routing (load-time only);
  see the plan §8.

### Node version

`.nvmrc` selects the latest Node LTS release. CI (CircleCI) uses **Node
24.20.0**.

### Manual E2E testing (requires local Chrome + a Google account)

1. Run `yarn start` (or `yarn gulp` once).
2. Load `examples/calendar-hello/` as an unpacked extension via
   `chrome://extensions`.
3. Open https://calendar.google.com while signed in and check the console for
   `CalendarSDK loaded`.

To load an example into a CDP-driven Chrome start it with
`--enable-unsafe-extension-debugging` (branded Chrome ignores
`--load-extension`); see `tools/calendar-probe/README.md`. For automated live
investigation see `tools/calendar-probe/README.md` (uses a human-signed-in
Chrome over CDP; use a dedicated test account).

### Gotchas

- Peer dependency warnings from Yarn on install are expected and non-blocking.
- Browserslist "caniuse-lite is outdated" warnings during build are harmless.
- The SDK throws on any origin other than `https://calendar.google.com`.
