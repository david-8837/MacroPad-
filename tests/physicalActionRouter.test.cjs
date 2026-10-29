// Run: node tests/physicalActionRouter.test.cjs
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function loadRouter() {
  const dir = mkdtempSync(join(tmpdir(), 'mpad3-router-'));
  const outfile = join(dir, 'router.mjs');
  try {
    await esbuild.build({ entryPoints: [join(__dirname, '../src/utils/physicalActionRouter.ts')],
      bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function main() {
  const { routePhysicalAction: route } = await loadRouter();
  const act = (id) => ({ id, category: 'hotkey', name: id, payload: { keys: ['Ctrl', 'A'] } });
  const layer = (name) => ({
    keys: [{ keyIndex: 0, tapAction: act(`${name}-tap`), holdAction: act(`${name}-hold`),
      doubleTapAction: act(`${name}-double`) },
    { keyIndex: 1, isDestructiveSafety: true, longPressThresholdMs: 1500,
      safetyConfirmAction: act(`${name}-danger`) }],
    dial: { cwAction: act(`${name}-cw`), ccwAction: act(`${name}-ccw`),
      pressAction: act(`${name}-press`), holdAction: act(`${name}-knob-hold`) },
  });
  const layers = [layer('L0'), layer('L1')];
  const event = (channel = 0, firmwareAction = 0, value = 0) => ({ channel, firmwareAction, value });
  const id = (r) => r.action?.id;

  assert.equal(id(route(layers, 0, 'tap', event(0, 1))), undefined,
    'device-owned shortcut must never be sent a second time by the host');
  assert.equal(id(route(layers, 9, 'dial_cw', event(0, 4, 3))), undefined,
    'device-owned batched media events must not be duplicated');
  assert.equal(id(route(layers, 0, 'tap', event(1))), 'L1-tap',
    'use the channel in the event, not a stale React/UI active layer');
  assert.equal(route(layers, 0, 'tap', event(1)).count, 1);
  assert.equal(id(route(layers, 0, 'hold', event(1))), 'L1-hold');
  assert.equal(id(route(layers, 0, 'double_tap', event(1))), 'L1-double');
  assert.equal(id(route(layers, 0, 'down', event(0))), undefined,
    'a raw press must not execute a tap binding');
  assert.equal(id(route(layers, 0, 'hold_release', event(0))), undefined,
    'a release must not execute a tap binding');

  for (const tooShort of [0, 300, 1499]) {
    const routed = route(layers, 1, 'hold_release', event(0, 0, tooShort));
    assert.equal(routed.action, null, 'an unverified/short hold must fail closed');
    assert.match(routed.reason, /threshold not met|duration unavailable/);
  }
  assert.equal(id(route(layers, 1, 'tap', event(0, 0, 2000))), undefined,
    'a tap with an arbitrary value is not confirmation');
  assert.equal(id(route(layers, 1, 'hold', event(0, 0, 300))), undefined,
    'the standard hold threshold does not unlock the safety action');
  const unlocked = route(layers, 1, 'hold_release', event(0, 0, 1500));
  assert.equal(id(unlocked), 'L0-danger');
  assert.equal(unlocked.count, 1, 'confirmation only fires once, on release');

  assert.equal(id(route(layers, 9, 'dial_tap', event(0))), 'L0-press');
  const batched = route(layers, 9, 'dial_cw', event(1, 0, 4));
  assert.equal(id(batched), 'L1-cw');
  assert.equal(batched.count, 4, 'four detents mean four PC-only volume steps');
  const capped = route(layers, 9, 'dial_ccw', event(1, 0, 512));
  assert.equal(capped.count, 20, 'a corrupted/high-volume batch must not launch 512 apps');
  assert.equal(capped.truncated, true);
  assert.equal(id(route(layers, 9, 'dial_hold', event(1))), 'L1-knob-hold');
  assert.equal(id(route(layers, 0, 'tap', event(9))), undefined, 'invalid channel is ignored');
  assert.equal(id(route(layers, 10, 'tap', event(0))), undefined, 'invalid key is ignored');
  console.log('physicalActionRouter: all assertions passed');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
