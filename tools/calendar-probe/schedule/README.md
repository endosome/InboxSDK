# Scheduled compat runs — infrastructure, NOT enabled

Decision (owner): runs are **manual for now** (`node compat-runner.mjs`); the
files here exist so switching to a schedule later is a copy-and-enable, not a
project. Nothing in this directory is installed or run by the repository, and
`compat-nightly.sh` does nothing unless `CALSDK_SCHEDULE_ENABLED=1` is set (the
service file and the cron example set it — that is the deliberate opt-in).

Before enabling, the owner should be happy with: the automation-vs-Google-terms
question (one dedicated, read-only test account; no scripted sign-in — the
profile is signed in by a human and kept alive), and where the always-on Chrome
lives.

## What runs

`../compat-nightly.sh` → `compat-runner.mjs --issue-dry-run`, then copies the
report to `out/history/<UTC stamp>.{json,md}`. It sends and files nothing; a
non-zero exit means a hard issue.

## Enable (Linux, systemd user timer)

1. Start the test Chrome persistently (signed in,
   `--remote-debugging-port=9222 --enable-unsafe-extension-debugging`, its own
   `--user-data-dir`).
2. Copy `calsdk-compat.service` and `calsdk-compat.timer` to
   `~/.config/systemd/user/`, edit `WorkingDirectory`, then
   `systemctl --user daemon-reload && systemctl --user enable --now calsdk-compat.timer`.
3. Look at `tools/calendar-probe/out/history/` (or
   `journalctl --user -u calsdk-compat`).

Cron alternative: see the commented line in `crontab.example`.

## Disable

`systemctl --user disable --now calsdk-compat.timer`.
