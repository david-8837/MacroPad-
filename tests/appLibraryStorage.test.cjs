const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { buildSync } = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'app-library-'));
try {
  const out = join(dir, 'library.cjs');
  buildSync({ entryPoints: [resolve('src/utils/appLibrary.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const library = require(out);
  const data = new Map();
  global.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const key = library.APP_LIBRARY_KEY;
  const legacy = { id: 'id', name: 'Manual', exePath: 'C:\\Manual.exe', category: 'utility', source: 'custom' };
  data.set(key, JSON.stringify([legacy]));
  assert.equal(library.loadAppLibrary()[0].iconDataUrl, '');
  assert.equal(library.readAppLibrary().error, null);
  for (const bad of ['not json', '{}', '[null]', '[{"id": "x"}]', JSON.stringify([{ ...legacy, category: null }])]) {
    data.set(key, bad);
    assert.deepEqual(library.loadAppLibrary(), []);
    assert.match(library.readAppLibrary().error, /preserved/);
    assert.match(library.saveAppLibrary([legacy], true), /preserved/);
    assert.equal(data.get(key), bad, 'must not replace malformed user data');
  }
  data.delete(key);
  assert.equal(library.saveAppLibrary([legacy]), null);
  assert.equal(library.loadAppLibrary()[0].name, 'Manual');
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.match(library.saveAppLibrary([legacy]), /only for this session/);
  console.log('appLibraryStorage: legacy entries, corrupted data preservation and quota passed');
} finally { delete global.localStorage; rmSync(dir, { recursive: true, force: true }); }
