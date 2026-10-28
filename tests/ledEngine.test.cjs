/**
 * ledEngine — the TypeScript port and the firmware must produce the same bytes.
 *
 * src/lighting/engine.ts drives the browser preview; firmware/src/lighting/leds.c
 * drives the nine LEDs. If they drift, the preview shows a colour the pad will
 * never display, which is the exact failure this project keeps having to undo.
 *
 * The comparison is not eyeballed and the scenarios are not duplicated:
 * firmware/tests/dump_leds.c prints its scenario table *and* the frame it
 * produced for it, and this test replays the same inputs through the TypeScript.
 * Add a scenario in the C and it is covered here automatically.
 *
 * Like the audio suite, this needs a toolchain (make + gcc). Without one it
 * skips with a notice instead of failing.
 */
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
const repoFirmware = join(root, 'firmware');
const vectorsPath = join(repoFirmware, 'build-host', 'led-vectors.json');

/** Bundle the TS engine so Node can import it, exactly like the OLED exporter. */
async function loadEngine() {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'ledengine-'));
  const outfile = join(tmp, 'engine.mjs');
  await build({
    entryPoints: [join(root, 'src', 'lighting', 'engine.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

function buildVectorsIfMissing() {
  if (existsSync(vectorsPath)) return true;
  try {
    execFileSync('make', ['-C', repoFirmware, '-f', 'Makefile.host', 'ledvectors'], {
      stdio: 'pipe',
    });
    return existsSync(vectorsPath);
  } catch {
    return false;
  }
}

async function runTests() {
  console.log('[ledEngine] Starting LED engine parity tests...');

  if (!buildVectorsIfMissing()) {
    console.log('  SKIP  ledEngine — no C toolchain to build firmware/build-host/led-vectors.json');
    console.log('        (run: make -C firmware -f Makefile.host ledvectors)\n');
    return;
  }

  const engine = await loadEngine();
  const { scenarios } = JSON.parse(readFileSync(vectorsPath, 'utf8'));
  assert.ok(scenarios.length >= 20, 'the scenario table should be substantial');

  let compared = 0;
  for (const sc of scenarios) {
    const L = engine.createLighting({
      mode: sc.lighting.mode,
      brightness: sc.lighting.brightness,
      speed: sc.lighting.speed,
      r: sc.lighting.r,
      g: sc.lighting.g,
      b: sc.lighting.b,
      perKey: sc.lighting.perKey,
      perKeyMask: sc.lighting.perKeyMask,
    });

    const eng = engine.createEngine();
    for (let f = 0; f < sc.state.frames; f++) {
      const st = {
        keyDownMask: sc.state.hitMask,
        keyHitMask: f === 0 ? sc.state.hitMask : 0,
        channel: sc.state.channel,
        nowMs: sc.state.nowMs + f * sc.state.gapMs,
        masterBrightness: sc.state.masterBrightness,
        idleOverride: sc.state.idleOverride,
      };
      const got = engine.computeFrame(eng, L, st);
      const want = sc.frames[f];
      for (let i = 0; i < engine.LED_COUNT; i++) {
        assert.deepStrictEqual(
          [got[i].r, got[i].g, got[i].b],
          want[i],
          `scenario "${sc.name}" frame ${f} LED ${i}: TypeScript ${JSON.stringify(got[i])} vs C ${JSON.stringify(want[i])}`,
        );
        compared++;
      }
    }
  }
  console.log(`  ✓ ${scenarios.length} scenarios × 9 LEDs agree with the C engine (${compared} pixels)`);

  // The port's own invariants, so a broken bundle is not mistaken for parity.
  const dark = engine.computeFrame(engine.createEngine(), engine.createLighting({ mode: 0 }), {
    keyDownMask: 0, keyHitMask: 0, channel: 0, nowMs: 0, masterBrightness: 255, idleOverride: 255,
  });
  assert.ok(dark.every((p) => p.r === 0 && p.g === 0 && p.b === 0), 'OFF must be black');
  console.log('  ✓ OFF renders black');

  const hex = engine.frameToHex(dark);
  assert.strictEqual(hex.length, engine.LED_COUNT);
  assert.ok(hex.every((h) => /^#[0-9a-f]{6}$/.test(h)), 'preview colours are 6-digit hex');
  console.log('  ✓ frameToHex returns 9 CSS colours');

  // Reactive decay must be time based, not frame based: two calls 16 ms apart
  // decay less than one call 200 ms later.
  const base = {
    keyDownMask: 0, keyHitMask: 0, channel: 0, masterBrightness: 255, idleOverride: 255,
  };
  const cfg = engine.createLighting({ mode: 6, r: 255, g: 255, b: 255, speed: 128 });
  const fast = engine.createEngine();
  engine.computeFrame(fast, cfg, { ...base, nowMs: 1000, keyHitMask: 0x1ff });
  const afterFast = engine.computeFrame(fast, cfg, { ...base, nowMs: 1016 });
  const slow = engine.createEngine();
  engine.computeFrame(slow, cfg, { ...base, nowMs: 1000, keyHitMask: 0x1ff });
  const afterSlow = engine.computeFrame(slow, cfg, { ...base, nowMs: 1200 });
  assert.ok(
    afterSlow[0].r < afterFast[0].r,
    'a longer gap must decay the flare further (time-based, not frame-based)',
  );
  console.log('  ✓ reactive decay is time based');

  console.log('LED engine parity: ALL TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('ledEngine test failed:', err);
  process.exit(1);
});
