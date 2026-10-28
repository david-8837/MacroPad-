#!/usr/bin/env node
// Make sure the host test suite has the C struct layout and factory config it
// checks the JavaScript protocol against. Both files are build output, so they
// are not committed: this regenerates them when they are missing.
//
//   node scripts/host-artifacts.mjs

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const needed = ['layout.json', 'defaults.bin'].map((f) => join(root, 'firmware', 'build-host', f));

if (needed.every((f) => existsSync(f))) process.exit(0);

console.log(`host artifacts missing (${needed.map((f) => f.split(/[\\/]/).pop()).join(', ')}) — building them`);
const r = spawnSync('make', ['-C', 'firmware', '-f', 'Makefile.host', 'hostartifacts'], {
  cwd: root,
  stdio: 'inherit',
});

if (r.error || r.status !== 0) {
  console.error('Could not build the host artifacts. Install make + gcc, then run:');
  console.error('  make -C firmware -f Makefile.host hostartifacts');
  process.exit(1);
}
