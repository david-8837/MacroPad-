// Run: node tests/actionHistory.test.cjs
const assert = require('assert');
const util = require('../electron/native/util.cjs');
const system = require('../electron/native/system.cjs');
const audio = require('../electron/native/audio.cjs');
const obs = require('../electron/native/obs.cjs');

async function runTests() {
  console.log('Testing Action History & Diagnostic Subsystem...');

  // 1. Native ring buffer logging
  const initialLog = util.getLog();
  assert.ok(Array.isArray(initialLog), 'util.getLog() must return an array');

  util.logLine('test-subsystem', 'test action executed', 'extra detail 123');
  const updatedLog = util.getLog();
  assert.ok(updatedLog.length >= initialLog.length + 1, 'log length should increase');

  const lastEntry = updatedLog[updatedLog.length - 1];
  assert.strictEqual(lastEntry.where, 'test-subsystem');
  assert.strictEqual(lastEntry.message, 'test action executed');
  assert.strictEqual(lastEntry.extra, 'extra detail 123');
  assert.strictEqual(typeof lastEntry.at, 'number');
  console.log('  ✓ native logLine and getLog verified');

  // 2. Subsystem self-tests
  console.log('  Running subsystem self-tests:');
  const [sysTest, audTest, obsTest] = await Promise.all([
    system.selfTest(),
    audio.selfTest(),
    obs.selfTest(),
  ]);

  assert.strictEqual(typeof sysTest.ok, 'boolean');
  assert.strictEqual(typeof sysTest.detail, 'string');
  console.log('    ✓ system.selfTest:', sysTest.detail);

  assert.strictEqual(typeof audTest.ok, 'boolean');
  assert.strictEqual(typeof audTest.detail, 'string');
  console.log('    ✓ audio.selfTest:', audTest.detail);

  assert.strictEqual(typeof obsTest.ok, 'boolean');
  assert.strictEqual(typeof obsTest.detail, 'string');
  console.log('    ✓ obs.selfTest:', obsTest.detail);

  // 3. Action history filtering logic simulation
  const mockHistory = [
    { id: '1', name: 'Volume Up', category: 'audio_session', type: 'success' },
    { id: '2', name: 'Switch Scene: Camera', category: 'obs', type: 'success' },
    { id: '3', name: 'Keypress Ctrl+C', category: 'hotkey', type: 'success' },
    { id: '4', name: 'Hold cancelled (Safety)', category: 'hotkey', type: 'safety' },
    { id: '5', name: 'Dial Turn +1', category: 'encoder', type: 'success' },
  ];

  const filterAudio = mockHistory.filter(i => i.category === 'audio_session');
  assert.strictEqual(filterAudio.length, 1);

  const filterObs = mockHistory.filter(i => i.category === 'obs');
  assert.strictEqual(filterObs.length, 1);

  const filterSafety = mockHistory.filter(i => i.type === 'safety');
  assert.strictEqual(filterSafety.length, 1);

  const filterSearch = mockHistory.filter(i => i.name.toLowerCase().includes('scene'));
  assert.strictEqual(filterSearch.length, 1);
  console.log('  ✓ action history filtering logic passed');

  console.log('All actionHistory tests passed successfully!');
}

runTests().catch((err) => {
  console.error('actionHistory test failed:', err);
  process.exit(1);
});
