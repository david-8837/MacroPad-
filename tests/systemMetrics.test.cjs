// Run: node tests/systemMetrics.test.cjs
const assert = require('assert');
const { getMetrics, cpuPercent, cpuPercentFromDelta, gpuPercentFromCounters, selfTest } = require('../electron/native/system.cjs');
const { clamp, parseJsonLoose } = require('../electron/native/util.cjs');
const fs = require('node:fs');
const vm = require('node:vm');

async function runTests() {
  // CPU is computed over an interval, not since boot or from one counter sample.
  assert.equal(cpuPercentFromDelta(null, { idle: 1, busy: 1 }), null);
  assert.equal(cpuPercentFromDelta({ idle: 100, busy: 100 }, { idle: 180, busy: 120 }), 20);
  assert.equal(cpuPercentFromDelta({ idle: 100, busy: 100 }, { idle: 100, busy: 100 }), null);
  assert.equal(cpuPercentFromDelta({ idle: 100, busy: 100 }, { idle: 90, busy: 105 }), null);
  // GPU engine counters are per-process: add shares of one engine, then take
  // the busiest engine/adapter, never add independent engines together.
  const counter = (pid, luid, engine, value, type = '3D') => ({ instance: `pid_${pid}_luid_0x0_${luid}_phys_0_eng_${engine}_engtype_${type}`, value });
  assert.equal(gpuPercentFromCounters([counter(1, '0xA', 0, 10), counter(2, '0xA', 0, 12), counter(3, '0xA', 1, 17, 'Copy')]), 22);
  assert.equal(gpuPercentFromCounters([counter(1, '0xA', 0, 10), counter(2, '0xB', 0, 25)]), 25);
  assert.equal(gpuPercentFromCounters([counter(1, '0xA', 0, 80), counter(2, '0xA', 0, 50)]), 100);
  assert.equal(gpuPercentFromCounters([counter(1, '0xA', 0, 0)]), 0);
  assert.equal(gpuPercentFromCounters([counter(1, '0xA', 0, null), counter(2, '0xA', 0, 'bad')]), null);
  assert.equal(gpuPercentFromCounters([]), null);
  // CPU is sampled AFTER the slow GPU probe, not seconds before the result is
  // sent to the renderer. Simulate Windows with a deliberately delayed probe.
  {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../electron/native/system.cjs'), 'utf8');
    let tick = { idle: 1000, busy: 1000 }, reads = 0, now = 10000, finishGpu;
    const fakeOs = { cpus: () => { reads++; return [{ times: { idle: tick.idle, user: tick.busy, nice: 0, sys: 0, irq: 0 } }]; }, totalmem: () => 100, freemem: () => 50 };
    const actualUtil = require('../electron/native/util.cjs');
    const fakeUtil = { ...actualUtil, powershell: async script => script.includes('GPU Engine')
      ? await new Promise(resolve => { finishGpu = resolve; })
      : { code: 0, stdout: '' } };
    class FakeDate extends Date { static now() { return now; } }
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, require: id => id === 'node:os' ? fakeOs : id === './util.cjs' ? fakeUtil : require(id), process: { platform: 'win32' }, Date: FakeDate, Map, Number, Math, Array, String });
    const delayedFirst = module.exports.getMetrics();
    assert.equal(reads, 0, 'CPU is not sampled before the slow GPU probe');
    finishGpu({ code: 0, stdout: '[{"instance":"pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D","value":0}]' });
    await delayedFirst;
    const baselineReads = reads;
    now += 1500;
    const delayedSecond = module.exports.getMetrics();
    assert.equal(reads, baselineReads, 'no stale early CPU sample is taken');
    tick = { idle: 1900, busy: 1100 }; // changes while GPU is being queried
    finishGpu({ code: 0, stdout: '[{"instance":"pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D","value":0}]' });
    const result = await delayedSecond;
    assert.equal(result.value.cpu, 10, 'reported CPU includes activity during the slow probe');
  }
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

