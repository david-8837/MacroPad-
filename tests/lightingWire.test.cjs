/** LED editor -> binary protocol must preserve all nine RGB triples. */
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const tmp = mkdtempSync(join(tmpdir(), 'lighting-wire-'));
  try {
    const outfile = join(tmp, 'mod.mjs');
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const { lightingToWire, lightingFromWire } = await bundle('src/utils/lightingWire.ts');
  const { encodeLighting, decodeLighting, LED_MODE } = await bundle('host/protocol/mpad3-protocol.mjs');
  const perKey = Array.from({ length: 9 }, () => [0, 0, 0]);
  perKey[2] = [12, 34, 56];
  perKey[8] = [200, 175, 99];
  const editor = { mode: LED_MODE.PER_KEY, brightness: 234, speed: 120,
    r: 40, g: 96, b: 255, perKey, perKeyMask: (1 << 2) | (1 << 8) };

  const onWire = lightingToWire(editor);
  assert.deepEqual(onWire.perKey[2], [12, 34, 56]);
  const bytes = encodeLighting(3, onWire);
  const decoded = decodeLighting(bytes, 1);
  assert.equal(decoded.perKeyMask, (1 << 2) | (1 << 8));
  assert.deepEqual(decoded.perKey[2], [12, 34, 56]);
  assert.deepEqual(decoded.perKey[8], [200, 175, 99]);
  const reloaded = lightingFromWire(decoded);
  assert.deepEqual(reloaded.perKey, editor.perKey);
  assert.equal(reloaded.brightness, 234);
  console.log('lighting wire: nine per-key RGB triples survive encode, device decode, and editor reload');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
