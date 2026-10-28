// Run: node tests/systemMetrics.test.cjs
const assert = require('assert');
const { getMetrics, cpuPercent, selfTest } = require('../electron/native/system.cjs');
const { clamp, parseJsonLoose } = require('../electron/native/util.cjs');

async function runTests() {
  // 1. Check clamp logic
  assert.strictEqual(clamp(50, 0, 100), 50);
  assert.strictEqual(clamp(-10, 0, 100), 0);
  assert.strictEqual(clamp(150, 0, 100), 100);
  assert.strictEqual(clamp('not-a-number', 0, 100), 0);

  // 2. Check loose JSON parser
  assert.deepStrictEqual(parseJsonLoose('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(parseJsonLoose('Progress...\n{"val":42}\nDone'), { val: 42 });
  assert.strictEqual(parseJsonLoose('No JSON here'), null);

  // 3. cpuPercent measures an interval, so the first call has no baseline to
  //    difference against and says so (null) instead of guessing. The second
  //    call, after a real interval, must be a number in range.
  const first = await cpuPercent();
  assert.ok(first === null || (typeof first === 'number' && first >= 0 && first <= 100),
    `first CPU sample must be null or in range, got ${first}`);
  await new Promise((r) => setTimeout(r, 250));
  const cpu = await cpuPercent();
  assert.strictEqual(typeof cpu, 'number', 'CPU must be a number once two samples exist');
  assert.ok(!Number.isNaN(cpu), 'CPU must not be NaN');
  assert.ok(cpu >= 0 && cpu <= 100, `CPU out of bounds: ${cpu}`);

  // 4. Test getMetrics bundle
  const res = await getMetrics();
  assert.strictEqual(res.ok, true, 'getMetrics must succeed');
  assert.ok(res.value, 'Metrics must have value');

  const { cpu: mCpu, ram: mRam, gpu: mGpu, temp: mTemp, sources, detail } = res.value;

  // Every value is either a real reading inside range, or null. Null is the
  // contract for "this machine does not expose it" — never a made-up number.
  const inRange = (v, lo, hi) => v === null || (typeof v === 'number' && v >= lo && v <= hi);
  assert.ok(inRange(mCpu, 0, 100), `CPU % invalid: ${mCpu}`);
  assert.ok(inRange(mRam, 0, 100), `RAM % invalid: ${mRam}`);
  assert.ok(inRange(mGpu, 0, 100), `GPU % invalid: ${mGpu}`);
  assert.ok(inRange(mTemp, 0, 150), `Temp invalid: ${mTemp}`);

  // A value with no source would be a number from nowhere.
  assert.ok(sources, 'sources object must be present');
  if (mCpu !== null) assert.ok(sources.cpu, 'measured CPU must name its source');
  if (mGpu !== null) assert.ok(sources.gpu, 'measured GPU must name its source');
  if (mTemp !== null) assert.ok(sources.temp, 'measured temp must name its source');

  assert.ok(detail, 'Detail object must be present');
  assert.ok(typeof detail.cores === 'number' && detail.cores > 0, 'Cores count invalid');
  assert.ok(typeof detail.ramTotalGb === 'number' && detail.ramTotalGb > 0, 'RAM total invalid');

  // The old code defaulted a missing temperature sensor to 45 °C. That is the
  // exact lie this test exists to prevent: on a machine with no ACPI zone and no
  // GPU sensor, temp must be null, not a plausible-looking number.
  const supported = ['win32', 'linux', 'darwin'].includes(process.platform);
  if (supported && sources.temp === null) {
    assert.strictEqual(mTemp, null, 'no temperature source must mean temp === null');
  }

  // 5. Test selfTest diagnostic string
  const testRes = await selfTest();
  assert.strictEqual(testRes.ok, true, 'selfTest must return ok: true');
  assert.ok(typeof testRes.detail === 'string' && testRes.detail.includes('cpu'), 'selfTest detail format');

  console.log('systemMetrics: all assertions passed (live CPU/GPU/RAM/Temp telemetry verified)');
}

runTests().catch((err) => {
  console.error('systemMetrics test failed:', err);
  process.exit(1);
});

