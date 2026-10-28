// Run: node tests/audioControl.test.cjs
const assert = require('assert');
const path = require('path');
const audio = require('../electron/native/audio.cjs');
const { executeAction } = require('../electron/actionExecutor.cjs');

async function runTests() {
  console.log('Testing Windows Audio Control & WASAPI Mixer...');

  // 1. Audio self-test
  const st = await audio.selfTest();
  assert.strictEqual(typeof st.ok, 'boolean', 'selfTest().ok should be boolean');
  assert.strictEqual(typeof st.detail, 'string', 'selfTest().detail should be string');
  console.log('  ✓ selfTest passed:', st.detail);

  // 2. Master volume & mute inspection
  const vol = await audio.getMasterVolume();
  assert.strictEqual(vol.ok, true, 'getMasterVolume() should succeed');
  assert.strictEqual(typeof vol.value, 'number', 'vol.value should be number');
  assert.ok(vol.value >= 0 && vol.value <= 100, `vol.value out of range: ${vol.value}`);
  console.log(`  ✓ getMasterVolume passed: ${vol.value}%`);

  const mute = await audio.getMasterMute();
  assert.strictEqual(mute.ok, true, 'getMasterMute() should succeed');
  assert.strictEqual(typeof mute.value, 'boolean', 'mute.value should be boolean');
  console.log(`  ✓ getMasterMute passed: muted=${mute.value}`);

  // 3. Audio endpoint enumeration
  const devices = await audio.listDevices();
  assert.strictEqual(devices.ok, true, 'listDevices() should succeed');
  assert.ok(Array.isArray(devices.value), 'devices.value should be array');
  assert.ok(devices.value.length > 0, 'should detect at least one audio endpoint');
  for (const d of devices.value) {
    assert.strictEqual(typeof d.id, 'string', 'device.id should be string');
    assert.strictEqual(typeof d.name, 'string', 'device.name should be string');
    assert.ok(d.kind === 'input' || d.kind === 'output', 'device.kind should be input or output');
    assert.strictEqual(typeof d.active, 'boolean', 'device.active should be boolean');
  }
  console.log(`  ✓ listDevices passed: found ${devices.value.length} devices`);

  // 4. Microphone inspection
  const mic = await audio.getMic();
  assert.strictEqual(mic.ok, true, 'getMic() should succeed');
  assert.strictEqual(typeof mic.value.muted, 'boolean', 'mic.muted should be boolean');
  assert.strictEqual(typeof mic.value.level, 'number', 'mic.level should be number');
  console.log(`  ✓ getMic passed: level=${mic.value.level}%, muted=${mic.value.muted}`);

  // 5. ActionExecutor audio_session category integration
  const resVolDelta = await executeAction({
    category: 'audio_session',
    payload: { processName: 'master', audioDelta: 0 },
  });
  assert.strictEqual(resVolDelta.success, true, 'executeAction audioDelta=0 should succeed');
  console.log('  ✓ executeAction audio_session delta passed');

  console.log('All audioControl tests passed successfully!');
}

runTests().catch((err) => {
  console.error('audioControl test failed:', err);
  process.exit(1);
});

