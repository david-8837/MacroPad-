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

  // 3. Test cpuPercent function returns finite percentage
  const cpu = await cpuPercent();
  assert.ok(typeof cpu === 'number', 'CPU must be number');
  assert.ok(!Number.isNaN(cpu), 'CPU must not be NaN');
  assert.ok(cpu >= 0 && cpu <= 100, `CPU out of bounds: ${cpu}`);

  // 4. Test getMetrics bundle
  const res = await getMetrics();
  assert.strictEqual(res.ok, true, 'getMetrics must succeed');
  assert.ok(res.value, 'Metrics must have value');

  const { cpu: mCpu, ram: mRam, gpu: mGpu, temp: mTemp, detail } = res.value;
  assert.ok(mCpu >= 0 && mCpu <= 100, `CPU % invalid: ${mCpu}`);
  assert.ok(mRam >= 0 && mRam <= 100, `RAM % invalid: ${mRam}`);
  assert.ok(mGpu >= 0 && mGpu <= 100, `GPU % invalid: ${mGpu}`);
  assert.ok(mTemp >= 0 && mTemp <= 150, `Temp invalid: ${mTemp}`);

  assert.ok(detail, 'Detail object must be present');
  assert.ok(typeof detail.cores === 'number' && detail.cores > 0, 'Cores count invalid');
  assert.ok(typeof detail.ramTotalGb === 'number' && detail.ramTotalGb > 0, 'RAM total invalid');

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
