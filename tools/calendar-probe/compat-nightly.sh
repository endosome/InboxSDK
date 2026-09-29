#!/usr/bin/env bash
# Nightly wrapper for compat-runner.mjs (run it from cron / a systemd timer on the machine that
# has the signed-in test Chrome on :9222). Keeps a dated copy of each report in out/history/ and
# writes the issue text (out/compat-issue.md) on problems. It files nothing and sends nothing;
# whoever owns the schedule decides what to do with the report. Exit status = the runner's.
set -u
cd "$(dirname "$0")"
mkdir -p out/history
stamp=$(date -u +%Y%m%dT%H%M%SZ)
node compat-runner.mjs --issue-dry-run
status=$?
cp out/compat-report.json "out/history/$stamp.json"
cp out/compat-report.md "out/history/$stamp.md"
exit $status
