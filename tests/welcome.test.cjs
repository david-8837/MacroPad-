const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const tmp = mkdtempSync(join(tmpdir(), 'welcome-'));
try {
  const output = buildSync({ entryPoints: [join(__dirname, '../src/utils/welcome.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
  const file = join(tmp, 'welcome.cjs'); writeFileSync(file, output.outputFiles[0].text);
  const { shouldShowWelcome } = require(file);
  const storage = keys => ({ length: keys.length, key: i => keys[i] ?? null, getItem: key => keys.includes(key) ? '1' : null });
  assert.equal(shouldShowWelcome(storage([])), true);
  assert.equal(shouldShowWelcome(storage(['other-app'])), true);
  for (const key of ['kadowaz_deck', 'kadowaz_session', 'kadowaz_app_library', 'kadowaz_guide_seen']) {
    assert.equal(shouldShowWelcome(storage([key])), false, `existing ${key} is not first run`);
  }
  assert.equal(shouldShowWelcome(storage(['kadowaz_welcome_pending', 'kadowaz_deck'])), true, 'an interrupted fresh welcome is shown again');
  assert.equal(shouldShowWelcome(storage(['kadowaz_welcome_pending', 'kadowaz_guide_seen'])), false, 'dismissal wins over pending');
  assert.equal(shouldShowWelcome({ get length() { throw Error('blocked'); }, key() {}, getItem() { throw Error('blocked'); } }), false);
  console.log('welcome: fresh and existing storage detection passed');
} finally { rmSync(tmp, { recursive: true, force: true }); }
