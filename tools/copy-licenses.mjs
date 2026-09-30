// prepack helper: npm only ships license files that sit inside the package directory.
// Usage (from a package dir): node ../../tools/copy-licenses.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['LICENSE-MIT.txt', 'LICENSE-APACHE.txt', 'COPYRIGHT.txt']) {
  fs.copyFileSync(path.join(root, f), path.join(process.cwd(), f));
}
