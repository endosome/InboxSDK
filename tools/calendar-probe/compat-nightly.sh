#!/usr/bin/env bash
# Nightly wrapper for compat-runner.mjs (run it from cron / a systemd timer on the machine that
# has the signed-in test Chrome on :9222). Keeps a dated copy of each report in out/history/ and
# writes the issue text (out/compat-issue.md) on problems. It files nothing and sends nothing;
# whoever owns the schedule decides what to do with the report. Exit status = the runner's.
set -u
cd "$(dirname "$0")"
# Scheduled runs are OFF by owner decision: the timer/cron entry must opt in explicitly.
# (Running `node compat-runner.mjs` by hand is always fine.)
if [ "${CALSDK_SCHEDULE_ENABLED:-0}" != "1" ]; then
  echo "compat-nightly: scheduled runs are disabled (set CALSDK_SCHEDULE_ENABLED=1 to enable); nothing was run." >&2
  exit 0
fi
mkdir -p out/history
stamp=$(date -u +%Y%m%dT%H%M%SZ)
node compat-runner.mjs --issue-dry-run
status=$?
cp out/compat-report.json "out/history/$stamp.json"
cp out/compat-report.md "out/history/$stamp.md"
exit $status
