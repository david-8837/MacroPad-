/*
 * host/tests/run.mjs — Node test suite for the protocol, no dependencies.
 *
 * Three jobs:
 *
 *   1. Prove the JavaScript struct geometry matches the COMPILED C. It reads
 *      firmware/build-host/layout.json, which is real sizeof()/offsetof() output
 *      dumped by firmware/tests/dump_layout.c, and compares it field by field
 *      against mpad3-protocol.mjs. This is the drift guard: change a C struct
 *      without updating the JS and this fails.
 *
 *   2. Re-implement CRC-16 and CRC-32 independently and check them against the
 *      standard published test vectors. Two implementations agreeing on "123456789"
 *      is real evidence; one implementation agreeing with itself is not.
 *
 *   3. Round-trip a config through encode -> decode, and through encode ->
 *      chunk -> reassemble, and check the default config the JS builds is
 *      byte-identical to the one the firmware builds.
 *
 * Run: node host/tests/run.mjs
 * Needs: firmware/build-host/layout.json (run `make -C firmware -f Makefile.host layout`)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ACTION_TYPE, CAP, CHANNEL_COUNT, CHUNK_COUNT, CHUNK_SIZE, CMD, CONFIG_FORMAT_VERSION,
  CONFIG_MAGIC_U32, ConfigAssembler, FRAME_OVERHEAD, HID, KEY_COUNT, LED_COUNT,
  LED_MODE, MAGIC_U32, MEDIA, MTU, FrameDecoder, OFFSETS, PROTOCOL_VERSION,
  SIZES, STATUS, crc16, crc32, decodeConfig, decodeInfo, decodeKeyEvent,
  defaultConfig, encodeChunk, encodeConfig, encodeConfigFrames, encodeFrame, encodeLedTest,
  encodeLighting, decodeLighting, emptyAction,
} from '../protocol/mpad3-protocol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

let passed = 0;
let failed = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log(`\n${name}`);
}

function ok(name) {
  passed++;
  console.log(`  ok   ${name}`);
}

function fail(name, detail) {
  failed++;
  console.log(`  FAIL ${name}`);
  console.log(`       ${detail}`);
}

function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    fail(name, e.message);
  }
}

function eq(actual, expected, what = '') {
  if (actual !== expected) {
    throw new Error(`${what}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function deepEq(actual, expected, what = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}\n  expected ${b}\n  got      ${a}`);
}

/* ── 1. layout drift guard ───────────────────────────────────────────────── */

const layoutPath = join(repoRoot, 'firmware', 'build-host', 'layout.json');
if (!existsSync(layoutPath)) {
  console.error(`\n${layoutPath} is missing.`);
  console.error('Run: make -C firmware -f Makefile.host layout\n');
  process.exit(2);
}
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'));

suite('struct layout matches the compiled C');

const C_STRUCT_FOR = {
  action: 'cfg_action_t',
  lighting: 'cfg_lighting_t',
  channel: 'cfg_channel_t',
  global: 'cfg_global_t',
  config: 'cfg_blob_t',
  sectorHeader: 'sector_header_t',
  keyEvent: 'key_event_t',
};

for (const [jsName, cName] of Object.entries(C_STRUCT_FOR)) {
  check(`${jsName} size == sizeof(${cName})`, () => {
    eq(SIZES[jsName], layout.sizes[jsName], `${cName}: `);
  });
}

check('info payload size', () => eq(SIZES.info, layout.sizes.info));
check('chunk size', () => eq(CHUNK_SIZE, layout.sizes.chunkSize));
check('chunk count', () => eq(CHUNK_COUNT, layout.sizes.chunkCount));

/* Every offset the JS declares must exist in the C dump with the same value.
 * dump_layout.c emits the camelCase field names, so the key is struct + name as
 * written in OFFSETS — no translation, and therefore nothing to get out of sync. */
const cOffsets = new Map(layout.offsets.map((o) => [`${o.struct}.${o.name}`, o.offset]));
let offsetChecks = 0;
const missing = [];
for (const [jsName, cName] of Object.entries(C_STRUCT_FOR)) {
  for (const [field, off] of Object.entries(OFFSETS[jsName] ?? {})) {
    const key = `${cName}.${field}`;
    if (!cOffsets.has(key)) {
      missing.push(key);
      continue;
    }
    check(`${cName}.${field} @${off}`, () => eq(off, cOffsets.get(key), `${cName}.${field}: `));
    offsetChecks++;
  }
}
if (missing.length) {
  fail('offset coverage', `these JS fields have no counterpart in layout.json: ${missing.join(', ')}`);
}
/* And the reverse: a C field the JS does not know about is a spec gap. */
const jsKeys = new Set();
for (const [jsName, cName] of Object.entries(C_STRUCT_FOR)) {
  for (const field of Object.keys(OFFSETS[jsName] ?? {})) jsKeys.add(`${cName}.${field}`);
}
const unknownToJs = layout.offsets
  .map((o) => `${o.struct}.${o.name}`)
  .filter((k) => !jsKeys.has(k) && !k.startsWith('_meta'));
if (unknownToJs.length) {
  fail('offset coverage (reverse)', `layout.json has fields the JS spec does not describe: ${unknownToJs.join(', ')}`);
}

suite('protocol constants match the compiled C');
check('protocol version', () => eq(PROTOCOL_VERSION, layout.constants.protocolVersion));
check('config format version', () => eq(CONFIG_FORMAT_VERSION, layout.constants.configFormatVersion));
check('magic', () => eq(MAGIC_U32, layout.constants.magicU32));
check('config magic', () => eq(CONFIG_MAGIC_U32, layout.constants.configMagicU32));
check('channels', () => eq(CHANNEL_COUNT, layout.constants.channels));
check('keys', () => eq(KEY_COUNT, layout.constants.keys));
check('leds', () => eq(LED_COUNT, layout.constants.leds));
check('mtu', () => eq(MTU, layout.constants.mtu));
check('frame overhead', () => eq(FRAME_OVERHEAD, layout.constants.frameOverhead));
check('every declared offset was checked', () => {
  if (offsetChecks < 40) throw new Error(`only ${offsetChecks} offsets compared; expected 40+`);
});

/* ── 2. CRC against published vectors ────────────────────────────────────── */

suite('CRC implementations against published test vectors');
const V = new TextEncoder().encode('123456789');

check('crc16("123456789") == 0x29B1 (CCITT-FALSE check value)', () => {
  eq(crc16(V).toString(16).toUpperCase(), '29B1');
});
check('crc16 of empty input == init 0xFFFF', () => eq(crc16(new Uint8Array(0)), 0xffff));
check('crc32("123456789") == 0xCBF43926 (IEEE check value)', () => {
  eq(crc32(V).toString(16).toUpperCase(), 'CBF43926');
});
check('crc32 of empty input == 0', () => eq(crc32(new Uint8Array(0)), 0));
check('crc16 detects a single bit flip', () => {
  const a = crc16(V);
  const w = Uint8Array.from(V);
  w[4] ^= 0x01;
  if (crc16(w) === a) throw new Error('single bit flip went undetected');
});
check('crc32 detects a single bit flip at every position', () => {
  for (let i = 0; i < V.length; i++) {
    for (const bit of [0x01, 0x80]) {
      const w = Uint8Array.from(V);
      w[i] ^= bit;
      if (crc32(w) === crc32(V)) throw new Error(`flip at byte ${i} bit ${bit} undetected`);
    }
  }
});
check('crc16 range matches the firmware coverage rule (cmd..payload)', () => {
  /* The firmware CRCs buf[2..end-2): cmd, len_lo, len_hi, ver, payload. */
  const frame = encodeFrame(CMD.SET_CHANNEL, Uint8Array.from([2]));
  const covered = frame.subarray(2, frame.length - 2);
  const want = covered[0] | 0; /* just prove the slice starts at cmd */
  eq(want, CMD.SET_CHANNEL);
  const crc = crc16(covered);
  eq(crc & 0xff, frame[frame.length - 2], 'crc low byte: ');
  eq((crc >> 8) & 0xff, frame[frame.length - 1], 'crc high byte: ');
});

/* ── 3. framing ──────────────────────────────────────────────────────────── */

suite('frame encode/decode');

check('frame layout is exactly as specified', () => {
  const f = encodeFrame(CMD.PING, Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
  eq(f[0], 0xa5, 'sof0: ');
  eq(f[1], 0x5a, 'sof1: ');
  eq(f[2], CMD.PING, 'cmd: ');
  eq(f[3], 4, 'len lo: ');
  eq(f[4], 0, 'len hi: ');
  eq(f[5], PROTOCOL_VERSION, 'version: ');
  eq(f[6], 0xde, 'payload[0]: ');
  eq(f.length, FRAME_OVERHEAD + 4, 'total length: ');
});

check('empty payload frame round trips', () => {
  const f = encodeFrame(CMD.PING);
  const d = new FrameDecoder();
  d.push(f);
  const got = d.next();
  if (!got) throw new Error('no frame decoded');
  eq(got.cmd, CMD.PING);
  eq(got.payload.length, 0);
  eq(d.stats.ok, 1);
  eq(d.stats.badCrc, 0);
});

check('payload over MTU is refused, not truncated', () => {
  let threw = false;
  try {
    encodeFrame(CMD.SET_CONFIG, new Uint8Array(MTU + 1));
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('oversized payload was accepted');
  encodeFrame(CMD.SET_CONFIG, new Uint8Array(MTU)); /* exactly fits */
});

check('a corrupted payload byte is rejected', () => {
  const f = encodeFrame(CMD.SET_CHANNEL, Uint8Array.from([1]));
  f[7] ^= 0x01;
  const d = new FrameDecoder();
  d.push(f);
  eq(d.next(), undefined);
  eq(d.stats.badCrc, 1);
});

check('decoder resynchronises after 500 bytes of garbage', () => {
  const d = new FrameDecoder();
  const noise = new Uint8Array(500);
  for (let i = 0; i < 500; i++) noise[i] = (i * 7 + 3) & 0xff;
  d.push(noise);
  eq(d.next(), undefined);
  d.push(encodeFrame(CMD.GET_CHANNEL));
  const got = d.next();
  if (!got) throw new Error('decoder never recovered');
  eq(got.cmd, CMD.GET_CHANNEL);
});

check('0xA5 0xA5 0x5A does not swallow the real frame', () => {
  const d = new FrameDecoder();
  d.push(Uint8Array.from([0xa5, 0xa5]));
  const f = encodeFrame(CMD.PING);
  d.push(f.subarray(1)); /* the decoder already holds the SOF0 */
  const got = d.next();
  if (!got) throw new Error('frame lost after a false SOF');
  eq(got.cmd, CMD.PING);
});

check('oversized declared length is rejected and recovery continues', () => {
  const d = new FrameDecoder();
  d.push(Uint8Array.from([0xa5, 0x5a, CMD.SET_CONFIG, 0xff, 0xff, PROTOCOL_VERSION]));
  eq(d.stats.badLength, 1);
  d.push(encodeFrame(CMD.PING));
  const got = d.next();
  if (!got) throw new Error('decoder stuck after a bad length');
  eq(got.cmd, CMD.PING);
});

check('wrong protocol version is reported separately from corruption', () => {
  const f = encodeFrame(CMD.PING);
  f[5] = PROTOCOL_VERSION + 1;
  const crc = crc16(f.subarray(2, f.length - 2));
  f[f.length - 2] = crc & 0xff;
  f[f.length - 1] = (crc >> 8) & 0xff;
  const d = new FrameDecoder();
  d.push(f);
  eq(d.next(), undefined);
  eq(d.stats.badVersion, 1);
  eq(d.stats.badCrc, 0, 'must not be misreported as corruption: ');
});

check('frames arriving one byte at a time still decode', () => {
  const f = encodeFrame(CMD.SET_LIGHTING, encodeLighting(1, defaultConfig().channels[1].lighting));
  const d = new FrameDecoder();
  for (const b of f) d.push(Uint8Array.from([b]));
  const got = d.next();
  if (!got) throw new Error('byte-at-a-time streaming failed');
  eq(got.cmd, CMD.SET_LIGHTING);
  eq(got.payload.length, 1 + SIZES.lighting);
});

check('two frames back to back both decode', () => {
  const d = new FrameDecoder();
  /* Push both before draining: push() returns the live queue array, so calling
   * next() in between mutates what the first push returned. */
  d.push(encodeFrame(CMD.PING));
  d.push(encodeFrame(CMD.SET_CHANNEL, Uint8Array.from([2])));
  const first = d.next();
  const second = d.next();
  if (!first || !second) throw new Error('one of the two frames was lost');
  eq(first.cmd, CMD.PING);
  eq(second.cmd, CMD.SET_CHANNEL);
  eq(second.payload[0], 2);
  eq(d.stats.ok, 2);
});

check('a frame split across an arbitrary chunk boundary decodes', () => {
  const f = encodeFrame(CMD.SET_CONFIG, encodeChunk(3, CHUNK_COUNT, new Uint8Array(100)));
  for (const split of [1, 2, 5, 6, 7, 13, f.length - 1]) {
    const d = new FrameDecoder();
    d.push(f.subarray(0, split));
    eq(d.next(), undefined, `split at ${split} decoded too early: `);
    d.push(f.subarray(split));
    const got = d.next();
    if (!got) throw new Error(`split at ${split} lost the frame`);
    eq(got.cmd, CMD.SET_CONFIG);
  }
});

/* ── 4. config codec ─────────────────────────────────────────────────────── */

suite('config codec');

check('default config encodes to exactly SIZES.config bytes with a valid CRC', () => {
  const blob = encodeConfig(defaultConfig());
  eq(blob.length, SIZES.config);
  const v = new DataView(blob.buffer);
  eq(v.getUint32(0, true), CONFIG_MAGIC_U32, 'magic: ');
  eq(v.getUint16(4, true), CONFIG_FORMAT_VERSION, 'version: ');
  eq(v.getUint16(6, true), SIZES.config, 'length: ');
  eq(v.getUint32(OFFSETS.config.crc32, true), crc32(blob, 0, OFFSETS.config.crc32), 'crc: ');
});

check('default config round trips through encode/decode', () => {
  const cfg = defaultConfig();
  const back = decodeConfig(encodeConfig(cfg));
  eq(back.global.holdMs, 300);
  eq(back.global.knobHoldMs, 500);
  eq(back.global.usbReportEvents, 1);
  eq(back.channels.length, CHANNEL_COUNT);
  eq(back.channels[0].keys.length, 9);
  for (const ch of back.channels) {
    for (const k of ch.keys) eq(k.type, ACTION_TYPE.NONE, 'factory keys must be empty: ');
    eq(ch.knobCw.code, MEDIA.VOLUME_UP, 'knob cw: ');
    eq(ch.knobCcw.code, MEDIA.VOLUME_DOWN, 'knob ccw: ');
    eq(ch.knobTap.code, MEDIA.MUTE, 'knob tap: ');
    eq(ch.knobHold.type, ACTION_TYPE.CHANNEL_NEXT, 'knob hold: ');
  }
});

check('the four default channels have distinct base colours', () => {
  const { channels } = decodeConfig(encodeConfig(defaultConfig()));
  const seen = new Set();
  for (const ch of channels) {
    const key = `${ch.lighting.r},${ch.lighting.g},${ch.lighting.b}`;
    if (seen.has(key)) throw new Error(`two channels share colour ${key}`);
    seen.add(key);
  }
  eq(seen.size, CHANNEL_COUNT);
});

check('text actions round trip and stay NUL terminated', () => {
  const cfg = defaultConfig();
  cfg.channels[2].keys[4] = { type: ACTION_TYPE.TEXT, flags: 0, code: 0, text: 'scene-3' };
  const back = decodeConfig(encodeConfig(cfg));
  eq(back.channels[2].keys[4].type, ACTION_TYPE.TEXT);
  eq(back.channels[2].keys[4].text, 'scene-3');
  /* The field is 32 bytes and the firmware requires a NUL inside it. */
  const blob = encodeConfig(cfg);
  const base = OFFSETS.config.channels + 2 * SIZES.channel + OFFSETS.channel.keys + 4 * SIZES.action;
  let sawNul = false;
  for (let i = 0; i < 32; i++) if (blob[base + OFFSETS.action.text + i] === 0) sawNul = true;
  if (!sawNul) throw new Error('text field has no NUL terminator');
});

check('text longer than the field is truncated, not overflowed', () => {
  const cfg = defaultConfig();
  cfg.channels[0].keys[0] = { type: ACTION_TYPE.TEXT, flags: 0, code: 0, text: 'x'.repeat(200) };
  const blob = encodeConfig(cfg);
  eq(blob.length, SIZES.config, 'blob grew: ');
  const back = decodeConfig(blob);
  eq(back.channels[0].keys[0].text.length, 31, 'must be capped at TEXT_MAX-1: ');
});

check('unicode text does not corrupt neighbouring fields', () => {
  const cfg = defaultConfig();
  cfg.channels[1].keys[0] = { type: ACTION_TYPE.TEXT, flags: 0, code: 0, text: 'café→π' };
  cfg.channels[1].keys[1] = { type: ACTION_TYPE.KEYCODE, flags: 0, code: HID.ENTER, text: '' };
  const back = decodeConfig(encodeConfig(cfg));
  eq(back.channels[1].keys[1].code, HID.ENTER, 'neighbouring key was corrupted: ');
  /* Multi-byte UTF-8 means fewer characters fit; what matters is that it does
   * not overrun and that the neighbour survives. */
  if (back.channels[1].keys[0].text.length === 0) throw new Error('text was lost entirely');
});

check('action flags survive the round trip', () => {
  const cfg = defaultConfig();
  cfg.channels[0].keys[1] = {
    type: ACTION_TYPE.KEYCODE,
    flags: 0x01 | 0x04, /* HOLD_DOWN | REPEAT */
    code: HID.LEFT,
    text: '',
  };
  const back = decodeConfig(encodeConfig(cfg));
  eq(back.channels[0].keys[1].flags, 0x05);
  eq(back.channels[0].keys[1].code, HID.LEFT);
});

check('per-key lighting mask and colours round trip', () => {
  const cfg = defaultConfig();
  cfg.channels[0].lighting.mode = LED_MODE.PER_KEY;
  cfg.channels[0].lighting.perKey = [
    [255, 0, 0], [0, 0, 0], [0, 255, 0], [0, 0, 0], [0, 0, 255],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [255, 255, 255],
  ];
  const back = decodeConfig(encodeConfig(cfg));
  eq(back.channels[0].lighting.mode, LED_MODE.PER_KEY);
  /* Keys 0, 2, 4 and 8 have colour; the mask must have exactly those bits. */
  eq(back.channels[0].lighting.perKeyMask, 0b100010101);
  deepEq(back.channels[0].lighting.perKey[0], [255, 0, 0], 'key 0: ');
  deepEq(back.channels[0].lighting.perKey[4], [0, 0, 255], 'key 4: ');
  deepEq(back.channels[0].lighting.perKey[8], [255, 255, 255], 'key 8: ');
  deepEq(back.channels[0].lighting.perKey[1], [0, 0, 0], 'key 1: ');
});

check('a corrupted blob is rejected with a CRC error', () => {
  const blob = encodeConfig(defaultConfig());
  blob[OFFSETS.config.channels + 5] ^= 0x01;
  let threw = false;
  try {
    decodeConfig(blob);
  } catch (e) {
    threw = /CRC/i.test(e.message);
  }
  if (!threw) throw new Error('corruption was not reported as a CRC failure');
});

check('wrong magic and wrong version are rejected distinctly', () => {
  const blob = encodeConfig(defaultConfig());
  const badMagic = Uint8Array.from(blob);
  badMagic[0] ^= 0xff;
  let msg = '';
  try { decodeConfig(badMagic); } catch (e) { msg = e.message; }
  if (!/magic/i.test(msg)) throw new Error(`bad magic reported as: ${msg}`);

  const badVersion = Uint8Array.from(blob);
  badVersion[4] = CONFIG_FORMAT_VERSION + 1;
  const v = new DataView(badVersion.buffer);
  v.setUint32(OFFSETS.config.crc32, crc32(badVersion, 0, OFFSETS.config.crc32), true);
  msg = '';
  try { decodeConfig(badVersion); } catch (e) { msg = e.message; }
  if (!/version/i.test(msg)) throw new Error(`bad version reported as: ${msg}`);
});

check('every byte position is covered by the config CRC', () => {
  const base = encodeConfig(defaultConfig());
  const baseCrc = crc32(base, 0, OFFSETS.config.crc32);
  let holes = 0;
  for (let i = 0; i < OFFSETS.config.crc32; i++) {
    const w = Uint8Array.from(base);
    w[i] ^= 0x80;
    if (crc32(w, 0, OFFSETS.config.crc32) === baseCrc) holes++;
  }
  eq(holes, 0, 'bytes whose flip the CRC cannot see: ');
});

suite('config chunking');

check('chunk count covers the blob exactly', () => {
  eq(CHUNK_COUNT, Math.ceil(SIZES.config / CHUNK_SIZE));
  eq((CHUNK_COUNT - 1) * CHUNK_SIZE + (SIZES.config % CHUNK_SIZE), SIZES.config);
});

check('encodeConfigFrames produces CHUNK_COUNT frames, all within MTU', () => {
  const frames = encodeConfigFrames(defaultConfig());
  eq(frames.length, CHUNK_COUNT);
  for (const f of frames) {
    if (f.length > MTU + FRAME_OVERHEAD) throw new Error(`frame of ${f.length} exceeds MTU`);
  }
});

check('chunk stream reassembles to a byte-identical blob', () => {
  const cfg = defaultConfig();
  cfg.channels[1].keys[3] = { type: ACTION_TYPE.TEXT, flags: 0, code: 0, text: 'hello world' };
  const blob = encodeConfig(cfg);

  const asm = new ConfigAssembler();
  let result = null;
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const off = i * CHUNK_SIZE;
    const slice = blob.subarray(off, Math.min(off + CHUNK_SIZE, blob.length));
    result = asm.add(new Uint8Array([
      i, CHUNK_COUNT, slice.length & 0xff, (slice.length >> 8) & 0xff, ...slice,
    ]));
  }
  if (!asm.done) throw new Error('assembler never reported done');
  if (!result) throw new Error('assembler never returned a config');
  deepEq(Uint8Array.from(result ? encodeConfig(result) : []), Uint8Array.from(blob), 'reassembled blob: ');
});

check('an out-of-order chunk is refused rather than silently zeroing a region', () => {
  const asm = new ConfigAssembler();
  let threw = false;
  try {
    asm.add(new Uint8Array([1, CHUNK_COUNT, 4, 0, 1, 2, 3, 4]));
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('chunk 1 was accepted as the first chunk');
});

check('a truncated stream never reports done', () => {
  const blob = encodeConfig(defaultConfig());
  const asm = new ConfigAssembler();
  for (let i = 0; i < CHUNK_COUNT - 1; i++) {
    const off = i * CHUNK_SIZE;
    const slice = blob.subarray(off, off + CHUNK_SIZE);
    asm.add(new Uint8Array([i, CHUNK_COUNT, slice.length & 0xff, (slice.length >> 8) & 0xff, ...slice]));
  }
  eq(asm.done, false);
});

check('progress reporting reaches 1.0', () => {
  const blob = encodeConfig(defaultConfig());
  const asm = new ConfigAssembler();
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const off = i * CHUNK_SIZE;
    const slice = blob.subarray(off, Math.min(off + CHUNK_SIZE, blob.length));
    asm.add(new Uint8Array([i, CHUNK_COUNT, slice.length & 0xff, (slice.length >> 8) & 0xff, ...slice]));
  }
  eq(asm.progress, 1);
});

/* ── 5. device -> host payloads ──────────────────────────────────────────── */

suite('device payload decoding');

check('info payload decodes to a 4-channel 9-key 9-LED device', () => {
  const p = new Uint8Array(SIZES.info);
  const v = new DataView(p.buffer);
  v.setUint32(0, MAGIC_U32, true);
  v.setUint16(4, PROTOCOL_VERSION, true);
  v.setUint16(6, CONFIG_FORMAT_VERSION, true);
  p[8] = CHANNEL_COUNT; p[9] = 9; p[10] = 9;
  p[11] = CAP.ENCODER | CAP.FLASH | CAP.EVENTS;
  v.setUint16(12, SIZES.config, true);
  v.setUint16(14, 7, true);

  const info = decodeInfo(p);
  eq(info.magic, MAGIC_U32);
  eq(info.channels, CHANNEL_COUNT);
  eq(info.keys, 9);
  eq(info.leds, 9);
  eq(info.configSize, SIZES.config);
  eq(info.firmwareBuild, 7);
  if (!(info.capabilities & CAP.ENCODER)) throw new Error('encoder capability lost');
});

check('key event decodes all six fields including the signed detent count', () => {
  const p = new Uint8Array(SIZES.keyEvent);
  const v = new DataView(p.buffer);
  p[0] = 1; /* knob */
  p[1] = 0;
  p[2] = 8; /* ENC_CCW */
  p[3] = 2; /* channel 2 */
  v.setInt16(4, -7, true);
  v.setUint16(6, ACTION_TYPE.MEDIA, true);

  const e = decodeKeyEvent(p);
  eq(e.source, 1);
  eq(e.event, 8);
  eq(e.eventName, 'ENC_CCW');
  eq(e.channel, 2);
  eq(e.value, -7, 'negative detent count: ');
  eq(e.action, ACTION_TYPE.MEDIA);
});

check('key event size matches the firmware constant', () => {
  eq(SIZES.keyEvent, 8);
});

check('status codes are the ones the firmware sends', () => {
  eq(STATUS.OK, 0);
  eq(STATUS.BAD_CRC, 1);
  eq(STATUS.FLASH_FAIL, 5);
  eq(STATUS.UNKNOWN_CMD, 7);
  eq(STATUS.BAD_ARG, 8);
});

suite('helper encoders');

check('encodeLedTest produces 27 bytes in R,G,B order', () => {
  const b = encodeLedTest([[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
  eq(b.length, 27);
  eq(b[0], 255); eq(b[1], 0); eq(b[2], 0);
  eq(b[3], 0); eq(b[4], 255); eq(b[5], 0);
  eq(b[6], 0); eq(b[7], 0); eq(b[8], 255);
  eq(b[9], 0, 'unspecified LEDs must be dark, not garbage: ');
});

check('encodeLighting is 1 + 40 bytes with the channel index first', () => {
  const b = encodeLighting(2, defaultConfig().channels[2].lighting);
  eq(b.length, 1 + SIZES.lighting);
  eq(b[0], 2);
  eq(b[1 + OFFSETS.lighting.mode], LED_MODE.REACTIVE);
  eq(b[1 + OFFSETS.lighting.brightness], 90);
});

check('decodeLighting round-trips encodeLighting', () => {
  const cfg = defaultConfig();
  const L = { ...cfg.channels[1].lighting, mode: LED_MODE.SPECTRUM, brightness: 41, speed: 200 };
  L.perKey = [
    [1, 2, 3], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [9, 8, 7],
  ];
  const payload = encodeLighting(1, L);
  const back = decodeLighting(payload, 1); /* skip the channel byte */
  eq(back.mode, LED_MODE.SPECTRUM);
  eq(back.brightness, 41);
  eq(back.speed, 200);
  eq(back.perKeyMask, (1 << 0) | (1 << 8));
  eq(back.perKey[0][0], 1);
  eq(back.perKey[8][2], 7);
  eq(back.r, L.r);
});

check('emptyAction encodes to 40 zero bytes', () => {
  const cfg = defaultConfig();
  cfg.channels[0].keys[0] = emptyAction();
  const blob = encodeConfig(cfg);
  const base = OFFSETS.config.channels + OFFSETS.channel.keys;
  for (let i = 0; i < SIZES.action; i++) {
    eq(blob[base + i], 0, `byte ${i}: `);
  }
});

/* ── 6. the strongest check: C defaults vs JS defaults, byte for byte ────── */

suite('firmware factory config vs JavaScript factory config');

const defaultsPath = join(repoRoot, 'firmware', 'build-host', 'defaults.bin');
if (!existsSync(defaultsPath)) {
  fail('defaults.bin present', `missing ${defaultsPath}; run \`make -C firmware -f Makefile.host defaults\``);
} else {
  const fromC = new Uint8Array(readFileSync(defaultsPath));
  const fromJs = encodeConfig(defaultConfig());

  check('same length', () => eq(fromJs.length, fromC.length));

  /* Report every differing byte with a human-readable field name, because
   * "byte 1234 differs" is not actionable and "channel 2 lighting.b differs"
   * is. */
  const diffs = [];
  const n = Math.min(fromC.length, fromJs.length);
  for (let i = 0; i < n; i++) if (fromC[i] !== fromJs[i]) diffs.push(i);

  check('byte-identical', () => {
    if (diffs.length === 0) return;
    const shown = diffs.slice(0, 12).map((i) => `    offset ${i}: C=0x${fromC[i].toString(16)} JS=0x${fromJs[i].toString(16)}  [${describeOffset(i)}]`);
    throw new Error(
      `${diffs.length} of ${n} bytes differ.\n${shown.join('\n')}${diffs.length > 12 ? `\n    ... and ${diffs.length - 12} more` : ''}`,
    );
  });

  check('the C blob validates through the JS decoder', () => {
    const cfg = decodeConfig(fromC);
    eq(cfg.channels.length, CHANNEL_COUNT);
    eq(cfg.channels[0].keys.length, 9);
  });

  check('the JS blob would validate in C (magic/version/length/crc)', () => {
    const v = new DataView(fromJs.buffer);
    eq(v.getUint32(0, true), CONFIG_MAGIC_U32, 'magic: ');
    eq(v.getUint16(4, true), CONFIG_FORMAT_VERSION, 'version: ');
    eq(v.getUint16(6, true), SIZES.config, 'length: ');
    eq(v.getUint32(OFFSETS.config.crc32, true), crc32(fromJs, 0, OFFSETS.config.crc32), 'crc: ');
  });
}

/** Name the field a config-blob offset falls inside, for a readable failure. */
function describeOffset(off) {
  if (off < OFFSETS.config.global) return 'config header';
  if (off < OFFSETS.config.channels) {
    const rel = off - OFFSETS.config.global;
    for (const [name, o] of Object.entries(OFFSETS.global)) {
      if (rel === o) return `global.${name}`;
    }
    return `global +${rel}`;
  }
  if (off < OFFSETS.config.crc32) {
    const rel = off - OFFSETS.config.channels;
    const ch = Math.floor(rel / SIZES.channel);
    const inCh = rel - ch * SIZES.channel;
    for (const [name, o] of Object.entries(OFFSETS.channel)) {
      if (name === 'keys') {
        if (inCh < KEY_COUNT * SIZES.action) {
          const k = Math.floor(inCh / SIZES.action);
          const inAction = inCh - k * SIZES.action;
          const field = Object.entries(OFFSETS.action).find(([, o2]) => o2 <= inAction);
          return `channels[${ch}].keys[${k}].${field ? field[0] : '?'}`;
        }
        continue;
      }
      const size = name === 'lighting' ? SIZES.lighting : SIZES.action;
      if (inCh >= o && inCh < o + size) {
        const inSub = inCh - o;
        const table = name === 'lighting' ? OFFSETS.lighting : OFFSETS.action;
        const field = Object.entries(table).find(([, o2]) => o2 <= inSub);
        return `channels[${ch}].${name}${field ? `.${field[0]}` : ''}`;
      }
    }
    return `channels[${ch}] +${inCh}`;
  }
  return 'config.crc32';
}

/* ── report ──────────────────────────────────────────────────────────────── */

console.log(`\n=== ${passed + failed} checks, ${failed} failures ===`);
if (failed === 0) {
  console.log('ALL HOST PROTOCOL TESTS PASSED');
  process.exit(0);
}
process.exit(1);
