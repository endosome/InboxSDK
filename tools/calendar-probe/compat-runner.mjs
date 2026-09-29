// Compat runner — read-only against Calendar. Drives a signed-in Chrome over CDP through the main
// views, an open popover and the editor, and runs the SDK's own compat checks (src/.../compat/checks.ts,
// bundled with esbuild and injected — the same code `sdk.Compat` runs) in each.
//
//   node compat-runner.mjs                     run, print a report, write out/compat-report.{json,md}
//   node compat-runner.mjs --update-baseline   also (re)write baselines/structure.json from this run
//   node compat-runner.mjs --drill             BROKEN-SELECTOR DRILL: replace the eventChip chain and
//                                              require that the run reports a hard failure
//   node compat-runner.mjs --issue-dry-run     also write out/compat-issue.md (what an issue would say);
//                                              NOTHING is filed or sent anywhere
//
// Exit code 1 when any hard issue (or a scenario that did not reach its state) is found; 0 otherwise.
// Needs the [CALSDK] fixtures (seed.mjs) and Chrome on :9222 (see README). Never saves or edits events.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const outDir = path.join(here, 'out');
const baselinePath = path.join(here, 'baselines', 'structure.json');
const args = new Set(process.argv.slice(2));
fs.mkdirSync(outDir, { recursive: true });

// ---- bundle the shared checks
const bundlePath = path.join(os.tmpdir(), 'calsdk-compat-bundle.js');
execFileSync(
  path.join(repo, 'node_modules/.bin/esbuild'),
  [
    path.join(repo, 'src/platform-implementation-js/compat/runner-entry.ts'),
    '--bundle',
    '--format=iife',
    '--global-name=CalsdkCompat',
    '--target=es2022',
    `--outfile=${bundlePath}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const bundle = fs.readFileSync(bundlePath, 'utf8');

const drill = args.has('--drill');
const patch = drill ? { eventChip: ['[data-calsdk-drill-nothing]'] } : {};

const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const p = await ctx.newPage();
await p.setViewportSize({ width: 1300, height: 950 });

const dismiss = async () => {
  for (const name of ['Dismiss', 'Got it', 'No']) {
    const btn = p
      .locator('[role=dialog] button', { hasText: new RegExp(`^${name}$`) })
      .first();
    if (await btn.count()) await btn.click({ timeout: 1500 }).catch(() => {});
  }
};
const go = async (route) => {
  await p.goto(`https://calendar.google.com/calendar/u/0/r/${route}?hl=en`, {
    waitUntil: 'load',
  });
  await p.waitForTimeout(2500);
  await dismiss();
};
const chip = (text) =>
  p.locator('[role=main] [data-eventchip]').filter({ hasText: text }).first();
const inPage = async () => {
  // a string is evaluated by CDP directly (not subject to the page's CSP / Trusted Types)
  await p.evaluate(`${bundle}\n;globalThis.CalsdkCompat = CalsdkCompat;`);
  return p.evaluate((patch) => globalThis.CalsdkCompat.run(patch), patch);
};

// name, how to get there, keys that must NOT be inactive (proves the scenario reached its state)
const scenarios = [
  ['week', () => go('week/2026/9/30'), ['eventChip', 'dateCell', 'mainRegion']],
  ['month', () => go('month/2026/9/30'), ['eventChip', 'dateCell']],
  ['day', () => go('day/2026/9/30'), ['eventChip', 'dateCell']],
  ['agenda', () => go('agenda/2026/9/30'), ['eventChip']],
  [
    'popover',
    async () => {
      await go('week/2026/9/30');
      await chip('Timed A').click();
      await p.waitForTimeout(1500);
    },
    ['eventPopover', 'popoverEventIdNode'],
  ],
  [
    'editor',
    async () => {
      await go('week/2026/9/30');
      await chip('Timed A').click();
      await p.waitForTimeout(1200);
      await p.getByRole('button', { name: 'Edit event' }).first().click();
      await p.locator('input#xTiIn').first().waitFor({ timeout: 10000 });
      await p.waitForTimeout(800);
    },
    ['editorTitle', 'editorSave', 'editorCancel'],
  ],
  ['settings', () => go('settings'), ['overlayHost']],
];

const report = { generatedAt: new Date().toISOString(), drill, scenarios: {} };
const problems = [];
for (const [name, enter, mustBeActive] of scenarios) {
  try {
    await enter();
    const r = await inPage();
    report.scenarios[name] = r;
    for (const key of mustBeActive) {
      const s = r.selectors.find((x) => x.key === key);
      if (!s || s.status === 'inactive') {
        problems.push({
          severity: 'hard',
          scenario: name,
          check: 'scenario-not-reached',
          selectorKey: key,
        });
      }
    }
    for (const i of r.issues) problems.push({ ...i, scenario: name });
  } catch (e) {
    report.scenarios[name] = { error: String(e.message).split('\n')[0] };
    problems.push({
      severity: 'hard',
      scenario: name,
      check: 'scenario-threw',
      detail: String(e.message).split('\n')[0].slice(0, 160),
    });
  }
}

// ---- structure drift against the committed baseline
const structures = Object.fromEntries(
  Object.entries(report.scenarios)
    .filter(([, r]) => r.structure)
    .map(([n, r]) => [n, r.structure]),
);
if (args.has('--update-baseline') && !drill) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  const variants = Object.fromEntries(
    Object.entries(report.scenarios)
      .filter(([, r]) => r.variant)
      .map(([n, r]) => [n, r.variant]),
  );
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ variants, structures }, null, 2) + '\n',
  );
  console.log(`baseline written: ${path.relative(repo, baselinePath)}`);
} else if (fs.existsSync(baselinePath) && !drill) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  for (const [scenario, landmarks] of Object.entries(structures)) {
    for (const [landmark, hash] of Object.entries(landmarks)) {
      const was = baseline.structures?.[scenario]?.[landmark];
      if (was !== undefined && was !== hash) {
        problems.push({
          severity: 'warning',
          scenario,
          check: `structure-drift:${landmark}`,
        });
      }
    }
  }
} else if (!drill) {
  problems.push({
    severity: 'info',
    scenario: '-',
    check: 'no-structure-baseline',
  });
}

report.problems = problems;
fs.writeFileSync(
  path.join(outDir, 'compat-report.json'),
  JSON.stringify(report, null, 2),
);
const hard = problems.filter((x) => x.severity === 'hard');
const warn = problems.filter((x) => x.severity === 'warning');
const line = (x) =>
  `- **${x.severity}** \`${x.check}\`${
    x.selectorKey ? ` \`${x.selectorKey}\`` : ''
  }` +
  `${x.rungIndex !== undefined ? ` (rung ${x.rungIndex})` : ''}` +
  `${x.count !== undefined ? ` ×${x.count}` : ''} — ${x.scenario}${
    x.detail ? `: ${x.detail}` : ''
  }`;
const md = [
  `# Calendar compat report ${report.generatedAt}${drill ? ' (DRILL)' : ''}`,
  '',
  `${Object.keys(report.scenarios).length} scenarios, ${hard.length} hard, ${
    warn.length
  } warning.`,
  '',
  ...(problems.length ? problems.map(line) : ['No issues.']),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'compat-report.md'), md);
if (args.has('--issue-dry-run') && (hard.length || warn.length)) {
  fs.writeFileSync(
    path.join(outDir, 'compat-issue.md'),
    `Title: Google Calendar compat: ${hard.length} hard / ${
      warn.length
    } warning (${report.generatedAt.slice(0, 10)})\n\n${md}`,
  );
  console.log('issue text written to out/compat-issue.md (nothing was filed)');
}
console.log(md);

await p.close();
await b.close();

if (drill) {
  const caught = hard.some(
    (x) => x.check === 'selector-miss' && x.selectorKey === 'eventChip',
  );
  console.log(
    caught
      ? 'DRILL PASS: the broken eventChip chain was reported as a hard failure'
      : 'DRILL FAIL: the broken selector was NOT detected',
  );
  process.exit(caught ? 0 : 1);
}
process.exit(hard.length ? 1 : 0);
