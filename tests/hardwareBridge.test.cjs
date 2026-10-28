// Run: node tests/hardwareBridge.test.cjs
const assert = require('assert');
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

/*
 * The text-line half of the bridge.
 *
 * The firmware speaks binary frames, but it still answers the `OLED:` command
 * family as text (firmware/src/core/ascii_cmd.c), so the line parser is live
 * code, not legacy. This exercises it through one fake serial stream: chunks
 * split mid-line, CRLF, garbage, an out-of-range key index.
 *
 * The module is bundled rather than type-stripped on the fly — it imports the
 * binary link and the protocol module, and hand-stubbing those was one refactor
 * away from testing nothing at all.
 */
async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'hb-'));
  const outfile = join(tmp, 'mod.mjs');
  await build({
    entryPoints: [join(__dirname, '..', entry)],
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

async function run() {
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');

  const events = [];
  const states = [];
  hardwareBridge.onInputEvent((k, t) => events.push(`in:${k}:${t}`));
  hardwareBridge.onChannelSwitch((c) => events.push(`ch:${c}`));
  hardwareBridge.onHoldSwitch(() => events.push('hold'));
  hardwareBridge.onStateChange((s) => states.push(s));

  // Chunks split mid-line, a CRLF line, garbage, and an out-of-range key index.
  // CHANNEL:3 is the fourth page — the parser used to reject anything past 2.
  const chunks = [
    'KEY:0:D',
    'OWN\nKEY:0:UP\nENC:',
    'CW\r\nENC:CCW\nCHANNEL:',
    '3\nENC:HOLD_SWITCH\nKEY:99:DOWN\nnoise\nENC:DOWN\nENC:UP\n',
  ];
  const enc = new TextEncoder();
  const port = {
    readable: new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)));
        c.close();
      },
    }),
  };
  hardwareBridge.serialPort = port;
  hardwareBridge.connectionState = 'connected';

  await hardwareBridge.readSerialStream(port);

  assert.deepStrictEqual(events, [
    'in:0:down',
    'in:0:up',
    'in:9:dial_cw',
    'in:9:dial_ccw',
    'ch:2',
    'hold',
    'in:9:down',
    'in:9:up',
  ]);
  assert.strictEqual(states[states.length - 1], 'disconnected', 'stream end must report a disconnect');
  console.log('hardwareBridge: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
