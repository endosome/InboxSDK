# calendar-probe (EXPERIMENTAL)

Read-only exploratory probe for Google Calendar. Not part of the SDK build.
Attaches to a Chrome you started and signed in yourself; it never handles
credentials.

    google-chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.calsdk-profile https://calendar.google.com
    npm i   # run from this directory (installs playwright-core)
    node probe.mjs [outDir]

Outputs (default `./out/`, git-ignored; contains YOUR calendar data — sanitize
before committing):

- `chip-attributes.json`: every attribute on candidate event chips + ancestors,
  per view
- `network.json`: request METHOD + URL path + content-type + size (no bodies, no
  headers)
- `routes.json`: URL / history / title after each navigation
- `globals.json`: MAIN-world global names (keys only, no values) The probe only
  navigates and opens popovers (clicks a chip); it never edits or deletes.
