/*
 * mpad3-protocol.d.mts — types for the hand-written JS protocol module.
 *
 * The module next to this file is the single implementation of the wire format
 * on the JavaScript side: the Node test suite verifies it byte-for-byte against
 * the compiled C, and tools/gen_protocol.py generates the constant tables. That
 * is why this is a hand-written declaration and not a copy: the renderer imports
 * the real module, so there is exactly one place where the bytes are defined.
 *
 * Only the surface the app uses is declared. If something is missing, add it
 * here from the module — do not re-implement it in TypeScript.
 */
import type { Lighting, Info } from './generated/mpad3-protocol';

export type { Lighting, Info };

export const MAGIC_STRING: string;
export const MAGIC_U32: number;
export const PROTOCOL_VERSION: number;
export const CONFIG_FORMAT_VERSION: number;
export const LED_TEST_HOLD_MS: number;
export const MTU: number;
export const CHUNK_SIZE: number;

export const SOF0: number;
export const SOF1: number;
export const FRAME_HEADER_SIZE: number;
export const FRAME_CRC_SIZE: number;
export const FRAME_OVERHEAD: number;

export const CMD: Record<string, number>;
export const CMD_NAME: Record<number, string>;
export const STATUS: Record<string, number>;
export const STATUS_NAME: Record<number, string>;
export const ACTION_TYPE: Record<string, number>;
export const LED_MODE: Record<string, number>;
export const CAP: { ENCODER: number; OLED: number; FLASH: number; EVENTS: number; OLED_STREAM: number; LED_OUTPUT: number };
export const OLED_MODE_COUNT: number;
export const OLED_STREAM: {
  readonly FRAME_BYTES: number;
  readonly CHUNK_BYTES: number;
  readonly CHUNK_COUNT: number;
  readonly HEADER_BYTES: number;
  readonly STAGING_TIMEOUT_MS: number;
  readonly TTL_MS: number;
};

export const SIZES: Record<string, number>;
export const OFFSETS: Record<string, Record<string, number>>;
export const CHANNEL_COUNT: number;
export const KEY_COUNT: number;
export const LED_COUNT: number;

export function crc16(bytes: Uint8Array, start?: number, end?: number): number;
export function crc32(bytes: Uint8Array, start?: number, end?: number): number;

export function encodeFrame(cmd: number, payload?: Uint8Array): Uint8Array;

/** A complete frame as handed back by FrameDecoder.next(). */
export interface DecodedFrame {
  cmd: number;
  /** Protocol version byte from the header. */
  ver: number;
  payload: Uint8Array;
}

export class FrameDecoder {
  constructor();
  frames: DecodedFrame[];
  stats: {
    ok: number;
    badCrc: number;
    badVersion: number;
    badLength: number;
    resync: number;
  };
  /** Feed bytes; returns the (accumulating) frame list. */
  push(chunk: Uint8Array | number[]): DecodedFrame[];
  /** Take the next complete frame, or undefined. */
  next(): DecodedFrame | undefined;
}

/** One KEY_EVENT frame (0xC0): a physical key, a knob detent or a layer change. */
export interface KeyEvent {
  /** 0 = KEY, 1 = KNOB (see eventSource in docs/PROTOCOL.md). */
  source: number;
  /** Key index 0-8, or the knob's index. */
  index: number;
  /** EVENT_KIND value. */
  event: number;
  eventName: string;
  channel: number;
  /** Detent count for rotation events. */
  value: number;
  /** The action type that fired, 0 for an empty slot. */
  action: number;
}

export const EVENT_KIND: Record<string, number>;
export function decodeKeyEvent(payload: Uint8Array): KeyEvent;
export interface OledState { mode: number; epoch: number }
export interface OledFrameAck { seq: number; mode: number }
export interface OledFrameChunk extends OledFrameAck {
  index: number;
  count: number;
  crc32: number;
  pages: Uint8Array;
}
export function encodeOledFrameChunks(pages: Uint8Array, mode: number, seq: number): [Uint8Array, Uint8Array];
export function decodeOledFrameChunk(payload: Uint8Array): OledFrameChunk;
export function decodeOledState(payload: Uint8Array): OledState;
export function decodeOledFrameAck(payload: Uint8Array): OledFrameAck;
export function decodeInfo(payload: Uint8Array): Info;
export function decodeLighting(payload: Uint8Array, offset?: number): Lighting;
export function encodeLighting(channelIndex: number, L: Lighting): Uint8Array;
export function encodeLedTest(rgbArray: ArrayLike<ArrayLike<number>>): Uint8Array;
export function emptyLighting(): Lighting;
/* ── config objects ──────────────────────────────────────────────────────── */
/* Hand-maintained counterpart to the encodeConfig/decodeConfig half of the .mjs.
 * The shapes mirror cfg_action_t / cfg_channel_t / cfg_global_t in
 * firmware/include/config.h; the Node suite proves the C and the JS agree. */

export interface CfgAction {
  /** ACTION_TYPE_* — KEYCODE, MODS, TEXT, MEDIA, CHANNEL, … 0 = empty slot. */
  type: number;
  /** ACTION_FLAG_* ORed. */
  flags: number;
  /** KEYCODE: (modifiers << 8) | HID usage. MEDIA: consumer usage. */
  code: number;
  /** TEXT only, up to TEXT_MAX - 1 bytes. */
  text: string;
}

export interface CfgChannel {
  keys: CfgAction[];
  knobCw: CfgAction;
  knobCcw: CfgAction;
  knobTap: CfgAction;
  knobHold: CfgAction;
  lighting: Lighting;
}

export interface CfgGlobal {
  holdMs: number;
  doubleTapMs: number;
  knobHoldMs: number;
  knobIdleMs: number;
  knobBatch: number;
  holdRepeatMs: number;
  bootChannel: number;
  ledInvertOutput: number;
  usbReportEvents: number;
  oledAutoCycleS: number;
  oledPlaylist: number;
  oledBootMode: number;
  oledContrast: number;
  oledInverted: number;
}

export interface Cfg {
  global: CfgGlobal;
  channels: CfgChannel[];
}

export function emptyAction(): CfgAction;
export function defaultConfig(): Cfg;
export function encodeConfig(cfg: Cfg): Uint8Array;
export function decodeConfig(bytes: Uint8Array): Cfg;
export function encodeChunk(index: number, count: number, bytes: Uint8Array): Uint8Array;
export function decodeChunk(payload: Uint8Array): {
  index: number;
  count: number;
  n: number;
  bytes: Uint8Array;
};
/** Split a config into the SET_CONFIG frames to send, in order. */
export function encodeConfigFrames(cfg: Cfg | Uint8Array): Uint8Array[];
/** Reassemble CONFIG_CHUNK replies; returns the decoded config on the last one. */
export class ConfigAssembler {
  blob: Uint8Array;
  filled: number;
  next: number;
  done: boolean;
  add(payload: Uint8Array): Cfg | null;
  readonly progress: number;
}
export const CHUNK_COUNT: number;
