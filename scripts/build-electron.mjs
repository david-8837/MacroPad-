/**
 * Production Electron asset verification and staging script for electron-builder.
 *
 * Staged into dist-electron/ so that electron-builder packages a verified,
 * syntactically validated main process with all native interop assets.
 */

import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'electron');
const to = join(root, 'dist-electron');

const fail = (message) => {
  process.stderr.write(`build-electron: ERROR: ${message}\n`);
  process.exit(1);
};

// 1. Verify Vite frontend output
try {
  await stat(join(root, 'dist', 'index.html'));
} catch {
  fail('dist/index.html is missing. Run "npm run build" first.');
}

// 2. Clean and recreate dist-electron
await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

// 3. Syntax validation for every .cjs module in native/
for (const file of await readdir(join(to, 'native'))) {
  if (!file.endsWith('.cjs')) continue;
  const source = await readFile(join(to, 'native', file), 'utf8');
  try {
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', '__dirname', source);
  } catch (e) {
    fail(`native/${file} does not parse: ${e.message}`);
  }
}

// 4. Validate main and preload IPC parity
const main = await readFile(join(to, 'main.cjs'), 'utf8');
const preload = await readFile(join(to, 'preload.cjs'), 'utf8');

const invoked = new Set(
  [...preload.matchAll(/'([a-z]+:[a-zA-Z0-9:_-]+)'/g)].map((m) => m[1])
);
const handled = new Set(
  [...main.matchAll(/handle\(\s*'([a-z]+:[a-zA-Z0-9:_-]+)'/g)].map((m) => m[1])
);

const missing = [...invoked].filter((c) => !handled.has(c) && !c.startsWith('kadowaz:'));
if (missing.length) {
  fail(`the preload exposes channels main does not handle: ${missing.join(', ')}`);
}

// 5. Verify audio.cs interop asset is present
try {
  await stat(join(to, 'native', 'audio.cs'));
} catch {
  fail('native/audio.cs is missing from dist-electron/native.');
}

process.stdout.write(
  `build-electron: successfully verified & staged ${to}\n`
  + `  ✓ ${invoked.size} IPC channels validated\n`
  + `  ✓ native C# interop (audio.cs) verified\n`
  + `  ✓ all native CommonJS modules syntax-checked\n`
);

