/**
 * KEY_EVENT (0xC0) — the pad telling the app what a finger just did.
 *
 * This path did not exist. The firmware streams KEY_EVENT frames whenever
 * global.usbReportEvents is 1, and the app subscribed to serial *text* lines
 * ("KEY:0:DOWN") that this firmware has never sent, so pressing a physical key
 * updated the pad and nothing else. Two halves are checked here:
 *
 *   1. Mpad3Link decodes the frame into a KeyEvent and emits it.
 *   2. hardwareBridge turns that into the same two notifications the simulator
 *      uses, so every downstream handler works unchanged.
 */
const assert = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');

async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'keyev-'));
  const outfile = join(tmp, 'mod.mjs');
  await build({
    entryPoints: [join(root, entry)],
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

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}

const KEY = 0;
const KNOB = 1;
const PRESS = 1;
const RELEASE = 2;
const TAP = 3;
const ENC_CW = 7;
const ENC_CCW = 8;
const CHANNEL_CHANGE = 9;

function keyEventPayload({ source = KEY, index = 0, event = PRESS, channel = 0, value = 0, action = 0 }) {
  const p = new Uint8Array(8);
  p[0] = source;
  p[1] = index;
  p[2] = event;
  p[3] = channel;
  const v = new DataView(p.buffer);
  v.setInt16(4, value, true);
  v.setUint16(6, action, true);
  return p;
}

async function run() {
  console.log('[keyEvents] Starting physical input tests...');
  const proto = await bundle('host/protocol/mpad3-protocol.mjs');
  const { Mpad3Link } = await bundle('src/utils/mpad3Link.ts');
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');

  /* ── 1. the link decodes frames the pad sends on its own ──────────────── */

  const link = new Mpad3Link({ writable: new WritableStream() });
  const events = [];
  link.onFrame((e) => events.push(e));

  check('a KEY_EVENT frame becomes a key event, not a shrug', () => {
    link.feed(proto.encodeFrame(proto.CMD.KEY_EVENT, keyEventPayload({ index: 3, event: PRESS })));
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'key');
    assert.strictEqual(events[0].key.index, 3);
    assert.strictEqual(events[0].key.event, PRESS);
    assert.strictEqual(events[0].key.eventName, 'PRESS');
  });

  check('a knob detent decodes with its count', () => {
    events.length = 0;
    link.feed(
      proto.encodeFrame(proto.CMD.KEY_EVENT, keyEventPayload({ source: KNOB, event: ENC_CW, value: 3 })),
    );
    assert.strictEqual(events[0].key.source, KNOB);
    assert.strictEqual(events[0].key.eventName, 'ENC_CW');
    assert.strictEqual(events[0].key.value, 3);
  });

  check('a corrupt frame produces nothing at all', () => {
    events.length = 0;
    const frame = proto.encodeFrame(proto.CMD.KEY_EVENT, keyEventPayload({ index: 1 }));
    frame[frame.length - 1] ^= 0xff; // break the CRC
    link.feed(frame);
    assert.strictEqual(events.length, 0);
  });

  check('an ERROR frame with nobody waiting is still reported', () => {
    const seen = [];
    const l2 = new Mpad3Link({ writable: new WritableStream() });
    l2.onFrame((e) => seen.push(e));
    l2.feed(proto.encodeFrame(proto.CMD.ERROR, new Uint8Array([proto.STATUS.BAD_ARG])));
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'error');
    assert.strictEqual(seen[0].statusName, 'BAD_ARG');
  });

  /* ── 2. the bridge turns that into the simulator's own notifications ───── */

  const inputs = [];
  const channels = [];
  hardwareBridge.onInputEvent((k, t) => inputs.push(`${k}:${t}`));
  hardwareBridge.onChannelSwitch((c) => channels.push(c));

  const send = (key) => hardwareBridge.handleLinkEvent({ kind: 'key', key: { channel: 0, value: 0, action: 1, ...key } });

  check('a physical press and release reach the editor', () => {
    inputs.length = 0;
    send({ source: KEY, index: 4, event: PRESS, eventName: 'PRESS' });
    send({ source: KEY, index: 4, event: RELEASE, eventName: 'RELEASE' });
    assert.deepStrictEqual(inputs, ['4:down', '4:up']);
  });

  check('a tap reports both edges', () => {
    inputs.length = 0;
    send({ source: KEY, index: 0, event: TAP, eventName: 'TAP' });
    assert.deepStrictEqual(inputs, ['0:down', '0:up']);
  });

  check('knob rotation uses the dial channel the UI already listens to', () => {
    inputs.length = 0;
    send({ source: KNOB, event: ENC_CW, eventName: 'ENC_CW' });
    send({ source: KNOB, event: ENC_CCW, eventName: 'ENC_CCW' });
    assert.deepStrictEqual(inputs, ['9:dial_cw', '9:dial_ccw']);
  });

  check('a layer change on the pad moves the app with it', () => {
    channels.length = 0;
    send({ source: KNOB, event: CHANNEL_CHANGE, eventName: 'CHANNEL_CHANGE', channel: 2 });
    assert.deepStrictEqual(channels, [2]);
  });

  check('a rejected command is remembered for the UI', () => {
    hardwareBridge.handleLinkEvent({ kind: 'error', status: proto.STATUS.BAD_ARG, statusName: 'BAD_ARG' });
    assert.strictEqual(hardwareBridge.lastProtocolError, 'BAD_ARG');
  });

  console.log(`\n=== keyEvents: ${passed} checks, ${failed} failures ===`);
  if (failed > 0) {
    console.log('PHYSICAL INPUT TESTS FAILED');
    process.exit(1);
  }
  console.log('PHYSICAL INPUT TESTS PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
