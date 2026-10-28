// Run: node tests/windowTracker.test.cjs
const assert = require('assert');
const { normalise, getActiveWindow } = require('../electron/native/window.cjs');

async function runTests() {
  // 1. Process name normalization
  const norm1 = normalise({ process: 'Resolve.exe', title: 'DaVinci Resolve Studio 18', pid: 1234 });
  assert.strictEqual(norm1.app, 'resolve');
  assert.strictEqual(norm1.title, 'DaVinci Resolve Studio 18');
  assert.strictEqual(norm1.pid, 1234);

  const norm2 = normalise({ process: 'OBS64.EXE', title: 'OBS 30.1.0 - Profile: Stream' });
  assert.strictEqual(norm2.app, 'obs64');

  const normEmpty = normalise({});
  assert.strictEqual(normEmpty.app, '');
  assert.strictEqual(normEmpty.title, '');
  assert.strictEqual(normEmpty.pid, 0);

  // 2. Window titles are still normalised for manual diagnostics
  const normResolve = normalise({ process: 'Resolve.exe', title: 'DaVinci Resolve' });
  assert.strictEqual(normResolve.app, 'resolve');

  console.log('windowTracker: all assertions passed (active window normalization verified)');
}

runTests().catch((err) => {
  console.error('windowTracker test failed:', err);
  process.exit(1);
});

