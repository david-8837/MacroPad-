const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const dir = mkdtempSync(join(tmpdir(), 'zero-preferences-'));
try {
  const out = join(dir, 'preferences.cjs');
  const result = buildSync({ entryPoints: [resolve('src/utils/appPreferences.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  writeFileSync(out, result.outputFiles[0].text);
  const prefs = require(out);
  let blocked = false; const data = new Map();
  global.localStorage = { getItem: key => { if (blocked) throw Error('denied'); return data.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw Error('denied'); data.set(key, value); } };
  const applied = [];
  global.document = { documentElement: { dataset: {} } };
  global.window = { electronAPI: { setWindowTheme: async theme => { applied.push(theme); return true; } } };
  assert.equal(prefs.readTheme(), 'light'); assert.equal(prefs.readThemeForStartup().storageAvailable, true); assert.equal(prefs.readOpeningAnimation(), true);
  assert.equal(prefs.saveTheme('dark'), true); assert.equal(prefs.readTheme(), 'dark');
  assert.equal(prefs.saveOpeningAnimation(false), true); assert.equal(prefs.readOpeningAnimation(), false);
  prefs.applyTheme('dark'); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.deepEqual(applied, ['dark']);
  assert.equal(prefs.saveTheme('light'), true); assert.equal(prefs.readTheme(), 'light');
  assert.equal(prefs.saveOpeningAnimation(true), true); assert.equal(prefs.readOpeningAnimation(), true);
  data.set('kadowaz_app_theme', 'invalid'); assert.equal(prefs.readTheme(), 'light');
  data.set('kadowaz_opening_animation', 'invalid'); assert.equal(prefs.readOpeningAnimation(), true);
  blocked = true;
  assert.equal(prefs.saveTheme('dark'), false); assert.equal(prefs.saveOpeningAnimation(false), false);
  assert.equal(prefs.readTheme(), 'light'); assert.equal(prefs.readThemeForStartup().storageAvailable, false); assert.equal(prefs.readOpeningAnimation(), true);
  console.log('app preferences: defaults, persistence, native theme, invalid data and storage failures passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
