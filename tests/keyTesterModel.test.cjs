// OS keyboard-event visualizer: no scan rate, USB latency or contact-bounce claim.
// Run: node tests/keyTesterModel.test.cjs
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const { build } = require('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'mpad3-keys-'));
  const outfile = join(dir, 'module.mjs');
  try {
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  const { createTesterState, reduceTesterEvent, clearHeldKeys, ignoreKeyTesterTarget } =
    await bundle('src/utils/keyTesterModel.ts');
  let state = createTesterState();
  const send = (type, code, repeat = false) => { state = reduceTesterEvent(state, { type, code, key: 'a', repeat }); };
  send('down', 'KeyA');
  assert.equal(state.keydownEvents, 1);
  assert.equal(state.pressEvents, 1);
  assert.equal(state.testedKeys.KeyA.pressCount, 1);
  assert.equal(state.activeKeys.has('KeyA'), true);
  send('down', 'KeyA', true); // OS repeat, not physical bounce
  assert.equal(state.keydownEvents, 2);
  assert.equal(state.repeatEvents, 1);
  assert.equal(state.pressEvents, 1);
  assert.equal(state.testedKeys.KeyA.pressCount, 1);
  send('down', 'KeyA'); // duplicate delivery while still down is not another press
  assert.equal(state.pressEvents, 1);
  send('up', 'KeyA');
  assert.equal(state.activeKeys.size, 0);
  send('down', 'KeyA');
  assert.equal(state.pressEvents, 2);
  assert.equal(state.testedKeys.KeyA.pressCount, 2);
  state = clearHeldKeys(state); // focus loss cannot leave a stuck visual held key
  assert.equal(state.activeKeys.size, 0);
  assert.equal(state.keydownEvents, 4);
  assert.ok(!('latencyMs' in state.testedKeys.KeyA));
  assert.ok(!('isChattering' in state.testedKeys.KeyA));
  assert.equal(ignoreKeyTesterTarget({ tagName: 'INPUT' }), true);
  assert.equal(ignoreKeyTesterTarget({ tagName: 'BUTTON' }), false, 'arrival tab retains focus; keys must still be observed');
  assert.equal(ignoreKeyTesterTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(ignoreKeyTesterTarget({ tagName: 'DIV' }), false);
  assert.equal(ignoreKeyTesterTarget(null), false);
  console.log('keyTesterModel: delivered DOM events and OS repeats, no invented hardware measurements');
})().catch(err => { console.error(err); process.exitCode = 1; });
