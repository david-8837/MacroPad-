/*
 * mpad3-protocol.mjs — JavaScript implementation of the mpad3 wire protocol.
 *
 * Generated from host/protocol/protocol.json by tools/gen_protocol.py for the
 * constant tables, but the encode/decode functions below are written by hand so
 * they stay readable and can be lifted straight into a Web Serial app.
 *
 * Nothing here imports anything. It runs in Node 18+ and in a browser module.
 *
 *   import { encodeFrame, decodeStream, defaultConfig } from './mpad3-protocol.mjs';
 *
 * The two things that MUST match the firmware exactly are the CRCs and the
 * struct offsets. host/tests/run.mjs checks both against the compiled C.
 */

/* ── constants (mirrors firmware/include/magic.h) ─────────────────────────── */
export const MAGIC_STRING = 'MPAD3';
export const MAGIC_U32 = 0x4d504144;
export const CONFIG_MAGIC_U32 = 0x43464733;
export const SECTOR_MAGIC_U32 = 0x53454331;
export const PROTOCOL_VERSION = 3;
export const CONFIG_FORMAT_VERSION = 3;
export const LED_TEST_HOLD_MS = 300; /* bench-only raw override, then normal mode resumes */

export const SOF0 = 0xa5;
export const SOF1 = 0x5a;
export const FRAME_HEADER_SIZE = 6;
export const FRAME_CRC_SIZE = 2;
export const FRAME_OVERHEAD = FRAME_HEADER_SIZE + FRAME_CRC_SIZE;
export const MTU = 512;
export const CHUNK_SIZE = 256;

export const CMD = {
  PING: 0x00,
  PONG: 0x80,
  GET_INFO: 0x01,
  INFO: 0x81,
  GET_CONFIG: 0x02,
  CONFIG_CHUNK: 0x82,
  SET_CONFIG: 0x03,
  SET_ACK: 0x83,
  RESET_CONFIG: 0x04,
  COMMIT: 0x05,
  COMMIT_ACK: 0x85,
  GET_CHANNEL: 0x06,
  CHANNEL: 0x86,
  SET_CHANNEL: 0x07,
  GET_LIGHTING: 0x08,
  LIGHTING: 0x88,
  SET_LIGHTING: 0x09,
  PREVIEW_LIGHTING: 0x0a,
  LED_TEST: 0x0b,
  OLED_FRAME: 0x0c,
  OLED_FRAME_ACK: 0x8c,
  GET_OLED_STATE: 0x0d,
  OLED_STATE: 0x8d,
  SET_OLED_MODE: 0x0e,
  KEY_EVENT: 0xc0,
  OLED_MODE_EVENT: 0xc1,
  BOOTLOADER: 0xfe,
  ERROR: 0xff,
};

export const CMD_NAME = Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k]));

export const STATUS = {
  OK: 0,
  BAD_CRC: 1,
  BAD_MAGIC: 2,
  BAD_VERSION: 3,
  BAD_LENGTH: 4,
  FLASH_FAIL: 5,
  BUSY: 6,
  UNKNOWN_CMD: 7,
  BAD_ARG: 8,
  LED_DISABLED: 9,
};

export const STATUS_NAME = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));

export const ACTION_TYPE = {
  NONE: 0,
  KEYCODE: 1,
  MODS: 2,
  TEXT: 3,
  MEDIA: 4,
  CHANNEL: 5,
  CHANNEL_NEXT: 6,
  LED_MODE: 7,
  LED_BRIGHT: 8,
  LAYER_HOLD: 9,
  WEBHOOK: 10,
  BOOTLOADER: 11,
  RESET_CONFIG: 12,
  OLED_NEXT: 13,
};

export const ACTION_FLAG = {
  NONE: 0x00,
  HOLD_DOWN: 0x01,
  ON_RELEASE: 0x02,
  REPEAT: 0x04,
  STICKY: 0x08,
};

export const LED_MODE = {
  OFF: 0,
  STATIC: 1,
  PER_KEY: 2,
  BREATH: 3,
  RAINBOW: 4,
  SPECTRUM: 5,
  REACTIVE: 6,
  CHANNEL_TINT: 7,
};

export const EVENT_KIND = {
  NONE: 0,
  PRESS: 1,
  RELEASE: 2,
  TAP: 3,
  HOLD: 4,
  HOLD_RELEASE: 5,
  DOUBLE_TAP: 6,
  ENC_CW: 7,
  ENC_CCW: 8,
  CHANNEL_CHANGE: 9,
};

export const EVENT_KIND_NAME = Object.fromEntries(
  Object.entries(EVENT_KIND).map(([k, v]) => [v, k]),
);

export const CAP = { ENCODER: 0x01, OLED: 0x02, FLASH: 0x04, EVENTS: 0x08, OLED_STREAM: 0x10,
  LED_OUTPUT: 0x20 };

/* Volatile 128x32 page-order streaming. No saved-config layout changes. */
export const OLED_MODE_COUNT = 12;
export const OLED_STREAM = Object.freeze({
  FRAME_BYTES: 512, CHUNK_BYTES: 256, CHUNK_COUNT: 2, HEADER_BYTES: 9,
  STAGING_TIMEOUT_MS: 350, TTL_MS: 1200,
});

/* Struct geometry. Offsets come from the compiled C via layout.json and are
 * asserted against these values by the test suite. */
export const CHANNEL_COUNT = 4;

export const SIZES = {
  action: 40,
  lighting: 40,
  channel: 560,
  global: 20,
  /* Derived, not typed twice: header (8) + global (20) + channels + crc (4). */
  config: 8 + 20 + CHANNEL_COUNT * 560 + 4,
  sectorHeader: 16,
  keyEvent: 8,
  oledFrameChunk: OLED_STREAM.HEADER_BYTES + OLED_STREAM.CHUNK_BYTES,
  oledState: 3,
  info: 16,
};

export const OFFSETS = {
  action: { type: 0, flags: 1, code: 2, text: 4, pad: 36 },
  lighting: {
    mode: 0, brightness: 1, speed: 2, r: 3, g: 4, b: 5, pad0: 6,
    perKeyMask: 7, perKey: 9, pad: 36,
  },
  channel: { keys: 0, knobCw: 360, knobCcw: 400, knobTap: 440, knobHold: 480, lighting: 520 },
  global: {
    holdMs: 0, doubleTapMs: 2, knobHoldMs: 4, knobIdleMs: 6, knobBatch: 8,
    holdRepeatMs: 9, bootChannel: 10, ledInvertOutput: 11, usbReportEvents: 12,
    oledAutoCycleS: 13, oledPlaylist: 14, oledBootMode: 16,
    oledContrast: 17, oledInverted: 18, oledPad: 19,
  },
  config: { magic: 0, version: 4, length: 6, global: 8, channels: 28, crc32: 8 + 20 + CHANNEL_COUNT * 560 },
  /* The A/B flash sector header. The host never reads raw flash, but describing
   * it here is what makes the reverse coverage check meaningful: if firmware
   * adds a field to sector_header_t, this file has to acknowledge it. */
  sectorHeader: { magic: 0, seq: 4, blobCrc: 8, hdrCrc: 12 },
  keyEvent: { source: 0, index: 1, event: 2, channel: 3, value: 4, action: 6 },
  oledFrameChunk: { seq: 0, mode: 2, index: 3, count: 4, crc32: 5, pages: 9 },
  oledState: { mode: 0, epoch: 1 },
};

export const KEY_COUNT = 9;
export const LED_COUNT = 9;
export const TEXT_MAX = 32;
export const CHUNK_COUNT = Math.ceil(SIZES.config / CHUNK_SIZE);

/* HID usages, the subset an app should offer first. */
export const HID = {
  A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0a, H: 0x0b,
  I: 0x0c, J: 0x0d, K: 0x0e, L: 0x0f, M: 0x10, N: 0x11, O: 0x12, P: 0x13,
  Q: 0x14, R: 0x15, S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1a, X: 0x1b,
  Y: 0x1c, Z: 0x1d,
  '1': 0x1e, '2': 0x1f, '3': 0x20, '4': 0x21, '5': 0x22,
  '6': 0x23, '7': 0x24, '8': 0x25, '9': 0x26, '0': 0x27,
  ENTER: 0x28, ESC: 0x29, BACKSPACE: 0x2a, TAB: 0x2b, SPACE: 0x2c,
  MINUS: 0x2d, EQUAL: 0x2e,
  F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
  F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
  PRINTSCREEN: 0x46, INSERT: 0x49, HOME: 0x4a, PAGEUP: 0x4b,
  DELETE: 0x4c, END: 0x4d, PAGEDOWN: 0x4e,
  RIGHT: 0x4f, LEFT: 0x50, DOWN: 0x51, UP: 0x52,
};

export const MOD = {
  LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08,
  RCTL: 0x10, RSFT: 0x20, RALT: 0x40, RGUI: 0x80,
};

export const MEDIA = {
  PLAY_PAUSE: 0xcd, STOP: 0xb7, NEXT_TRACK: 0xb5, PREV_TRACK: 0xb6,
  VOLUME_UP: 0xe9, VOLUME_DOWN: 0xea, MUTE: 0xe2,
  BRIGHTNESS_UP: 0x6f, BRIGHTNESS_DOWN: 0x70,
};

/* ── CRC ──────────────────────────────────────────────────────────────────── */

/** CRC-16/CCITT-FALSE. poly 0x1021, init 0xFFFF, no reflection, no xorout. */
export function crc16(bytes, start = 0, end = bytes.length) {
  let crc = 0xffff;
  for (let i = start; i < end; i++) {
    crc ^= bytes[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32/IEEE 802.3. reflected, init 0xFFFFFFFF, xorout 0xFFFFFFFF. */
export function crc32(bytes, start = 0, end = bytes.length) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ── framing ─────────────────────────────────────────────────────────────── */

/** Build one frame. Throws if the payload would not fit the MTU. */
export function encodeFrame(cmd, payload = new Uint8Array(0)) {
  if (payload.length > MTU) {
    throw new Error(`payload ${payload.length} exceeds MTU ${MTU}; chunk it`);
  }
  const out = new Uint8Array(FRAME_OVERHEAD + payload.length);
  out[0] = SOF0;
  out[1] = SOF1;
  out[2] = cmd;
  out[3] = payload.length & 0xff;
  out[4] = (payload.length >> 8) & 0xff;
  out[5] = PROTOCOL_VERSION;
  out.set(payload, FRAME_HEADER_SIZE);
  const crc = crc16(out, 2, FRAME_HEADER_SIZE + payload.length);
  out[out.length - 2] = crc & 0xff;
  out[out.length - 1] = (crc >> 8) & 0xff;
  return out;
}

/**
 * Streaming decoder. Feed it whatever bytes arrive, in whatever size chunks the
 * serial port gives you, and pull complete frames out of `frames`.
 *
 * It resynchronises on garbage: a corrupt byte costs one frame, not a replug.
 * `stats` counts what happened so a flaky cable is diagnosable rather than
 * mysterious.
 */
export class FrameDecoder {
  constructor() {
    this.state = 'sof0';
    this.buf = [];
    this.cmd = 0;
    this.len = 0;
    this.ver = 0;
    this.crcRx = 0;
    this.frames = [];
    this.stats = { ok: 0, badCrc: 0, badVersion: 0, badLength: 0, resync: 0 };
  }

  _reset() {
    this.state = 'sof0';
    this.buf = [];
  }

  push(chunk) {
    for (const byte of chunk) this._pushByte(byte);
    return this.frames;
  }

  /** Take the next complete frame, or undefined. */
  next() {
    return this.frames.shift();
  }

  _pushByte(byte) {
    switch (this.state) {
      case 'sof0':
        if (byte === SOF0) this.state = 'sof1';
        else this.stats.resync++;
        return;

      case 'sof1':
        if (byte === SOF1) this.state = 'cmd';
        else if (byte === SOF0) {
          /* 0xA5 0xA5 0x5A — the first was noise; keep hunting for SOF1. */
          this.stats.resync++;
        } else {
          this._reset();
          this.stats.resync++;
        }
        return;

      case 'cmd':
        this.cmd = byte;
        this.state = 'lenLo';
        return;

      case 'lenLo':
        this.len = byte;
        this.state = 'lenHi';
        return;

      case 'lenHi':
        this.len |= byte << 8;
        this.state = 'ver';
        return;

      case 'ver':
        this.ver = byte;
        if (this.len > MTU) {
          this._reset();
          this.stats.badLength++;
          return;
        }
        /* Consume the payload even when the version is wrong. Rejecting here
         * would leave `len` unread bytes in the stream and every later frame
         * would be hunted for inside someone else's payload. */
        this.buf = [];
        /* len === 0 must skip the payload state entirely. Waiting for a payload
         * byte that does not exist swallows the CRC low byte as payload and
         * desynchronises every frame after it. PING and COMMIT are exactly such
         * frames, so this bug breaks the handshake first. */
        this.state = this.len === 0 ? 'crcLo' : 'payload';
        return;

      case 'payload':
        this.buf.push(byte);
        if (this.buf.length >= this.len) this.state = 'crcLo';
        return;

      case 'crcLo':
        this.crcRx = byte;
        this.state = 'crcHi';
        return;

      case 'crcHi': {
        this.crcRx |= byte << 8;
        const covered = new Uint8Array(4 + this.buf.length);
        covered[0] = this.cmd;
        covered[1] = this.len & 0xff;
        covered[2] = (this.len >> 8) & 0xff;
        covered[3] = this.ver;
        covered.set(this.buf, 4);
        const crc = crc16(covered);
        const payload = Uint8Array.from(this.buf);
        const cmd = this.cmd;
        const ver = this.ver;
        this._reset();
        if (crc !== this.crcRx) {
          this.stats.badCrc++;
          return;
        }
        if (ver !== PROTOCOL_VERSION) {
          this.stats.badVersion++;
          return;
        }
        this.stats.ok++;
        this.frames.push({ cmd, payload, ver });
        return;
      }
    }
  }
}

/* ── payload codecs ──────────────────────────────────────────────────────── */

const td = new TextDecoder();
const te = new TextEncoder();

export function decodeInfo(p) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    magic: v.getUint32(0, true),
    protocolVersion: v.getUint16(4, true),
    configVersion: v.getUint16(6, true),
    channels: p[8],
    keys: p[9],
    leds: p[10],
    capabilities: p[11],
    configSize: v.getUint16(12, true),
    firmwareBuild: v.getUint16(14, true),
  };
}

export function decodeKeyEvent(p) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    source: p[0],
    index: p[1],
    event: p[2],
    eventName: EVENT_KIND_NAME[p[2]] ?? `UNKNOWN(${p[2]})`,
    channel: p[3],
    value: v.getInt16(4, true),
    action: v.getUint16(6, true),
  };
}

/* SSD1306 pages are [page0 x=0..127, page1, page2, page3]; bit y&7 is
 * the pixel in a page byte. Keep the full-frame checksum in BOTH halves: a
 * reordered, lost or mixed packet is never an image. */
export function encodeOledFrameChunks(pages, mode, seq) {
  if (!(pages instanceof Uint8Array) || pages.length !== OLED_STREAM.FRAME_BYTES) {
    throw new RangeError('OLED canvas must contain exactly 512 page-order bytes');
  }
  if (!Number.isInteger(mode) || mode < 0 || mode >= OLED_MODE_COUNT ||
      !Number.isInteger(seq) || seq < 0 || seq > 0xffff) {
    throw new RangeError('invalid OLED mode or sequence');
  }
  const checksum = crc32(pages);
  return [0, 1].map((index) => {
    const p = new Uint8Array(SIZES.oledFrameChunk);
    const v = new DataView(p.buffer);
    v.setUint16(0, seq, true);
    p[2] = mode;
    p[3] = index;
    p[4] = OLED_STREAM.CHUNK_COUNT;
    v.setUint32(5, checksum, true);
    p.set(pages.subarray(index * OLED_STREAM.CHUNK_BYTES,
                         (index + 1) * OLED_STREAM.CHUNK_BYTES), OLED_STREAM.HEADER_BYTES);
    return p;
  });
}

export function decodeOledFrameChunk(p) {
  if (!(p instanceof Uint8Array) || p.length !== SIZES.oledFrameChunk ||
      p[2] >= OLED_MODE_COUNT || p[3] >= OLED_STREAM.CHUNK_COUNT ||
      p[4] !== OLED_STREAM.CHUNK_COUNT) throw new RangeError('invalid OLED chunk');
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    seq: v.getUint16(0, true), mode: p[2], index: p[3], count: p[4],
    crc32: v.getUint32(5, true), pages: p.slice(OLED_STREAM.HEADER_BYTES),
  };
}

export function decodeOledState(p) {
  if (!(p instanceof Uint8Array) || p.length !== SIZES.oledState ||
      p[0] >= OLED_MODE_COUNT) throw new RangeError('invalid OLED state');
  return { mode: p[0], epoch: p[1] | (p[2] << 8) };
}

export function decodeOledFrameAck(p) {
  if (!(p instanceof Uint8Array) || p.length !== 3 || p[2] >= OLED_MODE_COUNT) {
    throw new RangeError('invalid OLED frame ACK');
  }
  return { seq: p[0] | (p[1] << 8), mode: p[2] };
}

export function decodeChunk(p) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { index: p[0], count: p[1], n: v.getUint16(2, true), bytes: p.subarray(4, 4 + v.getUint16(2, true)) };
}

export function encodeChunk(index, count, bytes) {
  const out = new Uint8Array(4 + bytes.length);
  out[0] = index;
  out[1] = count;
  out[2] = bytes.length & 0xff;
  out[3] = (bytes.length >> 8) & 0xff;
  out.set(bytes, 4);
  return out;
}

/* ── config object <-> bytes ─────────────────────────────────────────────── */

export function emptyAction() {
  return { type: ACTION_TYPE.NONE, flags: 0, code: 0, text: '' };
}

export function emptyLighting() {
  return {
    mode: LED_MODE.REACTIVE, brightness: 90, speed: 128,
    r: 0x20, g: 0x60, b: 0xff,
    perKey: Array.from({ length: LED_COUNT }, () => [0, 0, 0]),
  };
}

/** The factory-default config, matching firmware/src/storage/config_defaults.c. */
export function defaultConfig() {
  const channelRgb = [
    [0x20, 0x60, 0xff],
    [0xc0, 0x20, 0xff],
    [0xff, 0x90, 0x10],
    [0x20, 0xe0, 0x60],
  ];
  return {
    global: {
      holdMs: 300,
      doubleTapMs: 0,
      knobHoldMs: 500,
      knobIdleMs: 40,
      knobBatch: 4,
      holdRepeatMs: 40,
      bootChannel: 0,
      ledInvertOutput: 1,
      usbReportEvents: 1,
      oledAutoCycleS: 30,
      oledPlaylist: 0,
      oledBootMode: 0,
      oledContrast: 143,
      oledInverted: 0,
    },
    channels: Array.from({ length: CHANNEL_COUNT }, (_, ch) => ({
      keys: Array.from({ length: KEY_COUNT }, () => emptyAction()),
      knobCw: { type: ACTION_TYPE.MEDIA, flags: 0, code: MEDIA.VOLUME_UP, text: '' },
      knobCcw: { type: ACTION_TYPE.MEDIA, flags: 0, code: MEDIA.VOLUME_DOWN, text: '' },
      knobTap: { type: ACTION_TYPE.MEDIA, flags: 0, code: MEDIA.MUTE, text: '' },
      knobHold: { type: ACTION_TYPE.CHANNEL_NEXT, flags: 0, code: 0, text: '' },
      lighting: { ...emptyLighting(), ...{ r: channelRgb[ch][0], g: channelRgb[ch][1], b: channelRgb[ch][2] } },
    })),
  };
}

function putAction(view, base, a) {
  view.setUint8(base + OFFSETS.action.type, a.type ?? 0);
  view.setUint8(base + OFFSETS.action.flags, a.flags ?? 0);
  view.setUint16(base + OFFSETS.action.code, a.code ?? 0, true);
  const bytes = te.encode(a.text ?? '');
  const n = Math.min(bytes.length, TEXT_MAX - 1); /* always leave room for the NUL */
  for (let i = 0; i < TEXT_MAX; i++) {
    view.setUint8(base + OFFSETS.action.text + i, i < n ? bytes[i] : 0);
  }
}

function getAction(view, base) {
  const raw = new Uint8Array(TEXT_MAX);
  for (let i = 0; i < TEXT_MAX; i++) raw[i] = view.getUint8(base + OFFSETS.action.text + i);
  const nul = raw.indexOf(0);
  return {
    type: view.getUint8(base + OFFSETS.action.type),
    flags: view.getUint8(base + OFFSETS.action.flags),
    code: view.getUint16(base + OFFSETS.action.code, true),
    text: td.decode(nul < 0 ? raw : raw.subarray(0, nul)),
  };
}

function putLighting(view, base, L) {
  view.setUint8(base + OFFSETS.lighting.mode, L.mode);
  view.setUint8(base + OFFSETS.lighting.brightness, L.brightness);
  view.setUint8(base + OFFSETS.lighting.speed, L.speed);
  view.setUint8(base + OFFSETS.lighting.r, L.r);
  view.setUint8(base + OFFSETS.lighting.g, L.g);
  view.setUint8(base + OFFSETS.lighting.b, L.b);
  let mask = 0;
  for (let i = 0; i < LED_COUNT; i++) {
    const c = L.perKey?.[i];
    if (c && (c[0] || c[1] || c[2])) {
      mask |= 1 << i;
      view.setUint8(base + OFFSETS.lighting.perKey + i * 3 + 0, c[0]);
      view.setUint8(base + OFFSETS.lighting.perKey + i * 3 + 1, c[1]);
      view.setUint8(base + OFFSETS.lighting.perKey + i * 3 + 2, c[2]);
    } else {
      for (let k = 0; k < 3; k++) view.setUint8(base + OFFSETS.lighting.perKey + i * 3 + k, 0);
    }
  }
  view.setUint16(base + OFFSETS.lighting.perKeyMask, mask, true);
}

function getLighting(view, base) {
  const mask = view.getUint16(base + OFFSETS.lighting.perKeyMask, true);
  const perKey = [];
  for (let i = 0; i < LED_COUNT; i++) {
    perKey.push([
      view.getUint8(base + OFFSETS.lighting.perKey + i * 3 + 0),
      view.getUint8(base + OFFSETS.lighting.perKey + i * 3 + 1),
      view.getUint8(base + OFFSETS.lighting.perKey + i * 3 + 2),
    ]);
  }
  return {
    mode: view.getUint8(base + OFFSETS.lighting.mode),
    brightness: view.getUint8(base + OFFSETS.lighting.brightness),
    speed: view.getUint8(base + OFFSETS.lighting.speed),
    r: view.getUint8(base + OFFSETS.lighting.r),
    g: view.getUint8(base + OFFSETS.lighting.g),
    b: view.getUint8(base + OFFSETS.lighting.b),
    perKeyMask: mask,
    perKey,
  };
}

/** Serialise a config object to the exact bytes the firmware expects. */
export function encodeConfig(cfg) {
  const out = new Uint8Array(SIZES.config);
  const v = new DataView(out.buffer);

  v.setUint32(OFFSETS.config.magic, CONFIG_MAGIC_U32, true);
  v.setUint16(OFFSETS.config.version, CONFIG_FORMAT_VERSION, true);
  v.setUint16(OFFSETS.config.length, SIZES.config, true);

  const g = cfg.global ?? {};
  const gb = OFFSETS.config.global;
  v.setUint16(gb + OFFSETS.global.holdMs, g.holdMs ?? 300, true);
  v.setUint16(gb + OFFSETS.global.doubleTapMs, g.doubleTapMs ?? 0, true);
  v.setUint16(gb + OFFSETS.global.knobHoldMs, g.knobHoldMs ?? 500, true);
  v.setUint16(gb + OFFSETS.global.knobIdleMs, g.knobIdleMs ?? 40, true);
  v.setUint8(gb + OFFSETS.global.knobBatch, g.knobBatch ?? 4);
  v.setUint8(gb + OFFSETS.global.holdRepeatMs, g.holdRepeatMs ?? 40);
  v.setUint8(gb + OFFSETS.global.bootChannel, g.bootChannel ?? 0);
  v.setUint8(gb + OFFSETS.global.ledInvertOutput, g.ledInvertOutput ?? 1);
  v.setUint8(gb + OFFSETS.global.usbReportEvents, g.usbReportEvents ?? 1);
  // OLED rotation: seconds per screen (0 = off) and the playlist bitmask.
  v.setUint8(gb + OFFSETS.global.oledAutoCycleS, g.oledAutoCycleS ?? 30);
  v.setUint16(gb + OFFSETS.global.oledPlaylist, g.oledPlaylist ?? 0, true);
  v.setUint8(gb + OFFSETS.global.oledBootMode, g.oledBootMode ?? 0);
  v.setUint8(gb + OFFSETS.global.oledContrast, g.oledContrast ?? 143);
  v.setUint8(gb + OFFSETS.global.oledInverted, g.oledInverted ?? 0);
  /* oledPad remains zero in the newly allocated blob. */

  for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
    const base = OFFSETS.config.channels + ch * SIZES.channel;
    const c = cfg.channels?.[ch] ?? {};
    for (let k = 0; k < KEY_COUNT; k++) {
      putAction(v, base + OFFSETS.channel.keys + k * SIZES.action, c.keys?.[k] ?? emptyAction());
    }
    putAction(v, base + OFFSETS.channel.knobCw, c.knobCw ?? emptyAction());
    putAction(v, base + OFFSETS.channel.knobCcw, c.knobCcw ?? emptyAction());
    putAction(v, base + OFFSETS.channel.knobTap, c.knobTap ?? emptyAction());
    putAction(v, base + OFFSETS.channel.knobHold, c.knobHold ?? emptyAction());
    putLighting(v, base + OFFSETS.channel.lighting, c.lighting ?? emptyLighting());
  }

  v.setUint32(OFFSETS.config.crc32, crc32(out, 0, OFFSETS.config.crc32), true);
  return out;
}

/** Parse a config blob. Throws on a bad magic, version, length, or CRC. */
export function decodeConfig(bytes) {
  if (bytes.length !== SIZES.config) {
    throw new Error(`config is ${bytes.length} bytes, expected ${SIZES.config}`);
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = v.getUint32(OFFSETS.config.magic, true);
  if (magic !== CONFIG_MAGIC_U32) throw new Error(`bad config magic 0x${magic.toString(16)}`);
  const version = v.getUint16(OFFSETS.config.version, true);
  if (version !== CONFIG_FORMAT_VERSION) throw new Error(`unsupported config version ${version}`);
  const length = v.getUint16(OFFSETS.config.length, true);
  if (length !== SIZES.config) throw new Error(`bad config length ${length}`);
  const want = v.getUint32(OFFSETS.config.crc32, true);
  const got = crc32(bytes, 0, OFFSETS.config.crc32);
  if (want !== got) {
    throw new Error(`config CRC mismatch: stored 0x${want.toString(16)} computed 0x${got.toString(16)}`);
  }

  const gb = OFFSETS.config.global;
  const global = {
    holdMs: v.getUint16(gb + OFFSETS.global.holdMs, true),
    doubleTapMs: v.getUint16(gb + OFFSETS.global.doubleTapMs, true),
    knobHoldMs: v.getUint16(gb + OFFSETS.global.knobHoldMs, true),
    knobIdleMs: v.getUint16(gb + OFFSETS.global.knobIdleMs, true),
    knobBatch: v.getUint8(gb + OFFSETS.global.knobBatch),
    holdRepeatMs: v.getUint8(gb + OFFSETS.global.holdRepeatMs),
    bootChannel: v.getUint8(gb + OFFSETS.global.bootChannel),
    ledInvertOutput: v.getUint8(gb + OFFSETS.global.ledInvertOutput),
    usbReportEvents: v.getUint8(gb + OFFSETS.global.usbReportEvents),
    oledAutoCycleS: v.getUint8(gb + OFFSETS.global.oledAutoCycleS),
    oledPlaylist: v.getUint16(gb + OFFSETS.global.oledPlaylist, true),
    oledBootMode: v.getUint8(gb + OFFSETS.global.oledBootMode),
    oledContrast: v.getUint8(gb + OFFSETS.global.oledContrast),
    oledInverted: v.getUint8(gb + OFFSETS.global.oledInverted),
  };

  const channels = [];
  for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
    const base = OFFSETS.config.channels + ch * SIZES.channel;
    const keys = [];
    for (let k = 0; k < KEY_COUNT; k++) {
      keys.push(getAction(v, base + OFFSETS.channel.keys + k * SIZES.action));
    }
    channels.push({
      keys,
      knobCw: getAction(v, base + OFFSETS.channel.knobCw),
      knobCcw: getAction(v, base + OFFSETS.channel.knobCcw),
      knobTap: getAction(v, base + OFFSETS.channel.knobTap),
      knobHold: getAction(v, base + OFFSETS.channel.knobHold),
      lighting: getLighting(v, base + OFFSETS.channel.lighting),
    });
  }
  return { global, channels };
}

/** Split a config blob into the SET_CONFIG frames to send, in order. */
export function encodeConfigFrames(cfg) {
  const blob = cfg instanceof Uint8Array ? cfg : encodeConfig(cfg);
  const frames = [];
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const off = i * CHUNK_SIZE;
    const slice = blob.subarray(off, Math.min(off + CHUNK_SIZE, blob.length));
    frames.push(encodeFrame(CMD.SET_CONFIG, encodeChunk(i, CHUNK_COUNT, slice)));
  }
  return frames;
}

/** Reassemble CONFIG_CHUNK replies into a blob. Throws if a chunk is missing. */
export class ConfigAssembler {
  constructor() {
    this.blob = new Uint8Array(SIZES.config);
    this.filled = 0;
    this.next = 0;
    this.done = false;
  }

  add(payload) {
    const c = decodeChunk(payload);
    if (c.index !== this.next) throw new Error(`chunk ${c.index} arrived, expected ${this.next}`);
    if (c.count !== CHUNK_COUNT) throw new Error(`device reports ${c.count} chunks, expected ${CHUNK_COUNT}`);
    this.blob.set(c.bytes, this.filled);
    this.filled += c.n;
    this.next++;
    if (this.filled >= SIZES.config) {
      this.done = true;
      return decodeConfig(this.blob); /* validates the CRC */
    }
    return null;
  }

  get progress() {
    return this.filled / SIZES.config;
  }
}

/** 27 raw bytes for CMD_LED_TEST — the "is my soldering right" command. */
export function encodeLedTest(rgbArray) {
  const out = new Uint8Array(LED_COUNT * 3);
  for (let i = 0; i < LED_COUNT; i++) {
    const c = rgbArray[i] ?? [0, 0, 0];
    out[i * 3 + 0] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}

/** Decode a cfg_lighting_t. `offset` skips a leading byte when the payload is a
 * CMD_LIGHTING reply (1 channel byte + 40) rather than a bare struct. */
export function decodeLighting(p, offset = 0) {
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return getLighting(v, offset);
}

/** Encode a cfg_lighting_t for SET_LIGHTING / PREVIEW_LIGHTING. */
export function encodeLighting(channelIndex, L) {
  const out = new Uint8Array(1 + SIZES.lighting);
  out[0] = channelIndex;
  const v = new DataView(out.buffer);
  putLighting(v, 1, L);
  return out;
}
