// Verifies what `npm pack` would publish for the two packages (run after `yarn gulp` and the google-api build):
// entry points and types exist, licenses are included, no tests / internal type files / build scripts leak in,
// and the tarball stays small. Exits 1 on any violation. Used by CI and by docs/releasing.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const problems = [];
const checks = {
  'packages/core': {
    must: [
      'calendarsdk.js',
      'calendarsdk.js.map',
      'src/calendarsdk.d.ts',
      'README.md',
      'LICENSE-MIT.txt',
      'LICENSE-APACHE.txt',
      'COPYRIGHT.txt',
      'package.json',
    ],
    maxKB: 800,
    noDeps: true,
  },
  'packages/google-api': {
    must: [
      'dist/index.js',
      'dist/index.d.ts',
      'README.md',
      'LICENSE-MIT.txt',
      'LICENSE-APACHE.txt',
      'COPYRIGHT.txt',
      'package.json',
    ],
    maxKB: 60,
    noDeps: false,
  },
};
for (const [dir, rule] of Object.entries(checks)) {
  const cwd = path.join(root, dir);
  execFileSync('node', [path.join(root, 'tools/copy-licenses.mjs')], { cwd });
  const out = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd,
      encoding: 'utf8',
    }),
  );
  const files = out[0].files.map((f) => f.path);
  for (const m of rule.must)
    if (!files.includes(m)) problems.push(`${dir}: missing ${m}`);
  for (const f of files) {
    if (/\.test\.[jt]s$/.test(f))
      problems.push(`${dir}: test file shipped: ${f}`);
    if (/^src\/(?!calendarsdk\.d\.ts$)/.test(f) && dir === 'packages/core')
      problems.push(`${dir}: internal file shipped: ${f}`);
    if (/tsconfig|\.mjs$|gulp/.test(f))
      problems.push(`${dir}: build file shipped: ${f}`);
  }
  const kb = out[0].size / 1024;
  if (kb > rule.maxKB)
    problems.push(`${dir}: tarball ${kb.toFixed(0)} KB > ${rule.maxKB} KB`);
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
  );
  if (rule.noDeps && Object.keys(pkg.dependencies ?? {}).length)
    problems.push(
      `${dir}: the bundle is self-contained, but package.json lists dependencies`,
    );
  for (const key of ['main', 'types']) {
    if (pkg[key] && !fs.existsSync(path.join(cwd, pkg[key])))
      problems.push(`${dir}: ${key} → ${pkg[key]} does not exist`);
  }
  console.log(`${dir}: ${files.length} files, ${kb.toFixed(0)} KB`);
}
// the built bundle must expose what the published types promise
const require = createRequire(import.meta.url);
const sdk = require(path.join(root, 'packages/core/calendarsdk.js'));
for (const [what, ok] of [
  ['default.load', typeof sdk.default?.load === 'function'],
  ['load', typeof sdk.load === 'function'],
  ['CalendarSDK.load', typeof sdk.CalendarSDK?.load === 'function'],
  ['LOADER_VERSION', typeof sdk.LOADER_VERSION === 'string'],
]) {
  if (!ok) problems.push(`packages/core bundle: missing export ${what}`);
}
if (problems.length) {
  console.error('\n' + problems.join('\n'));
  process.exit(1);
}
console.log('packages OK');
