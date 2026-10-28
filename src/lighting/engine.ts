/*
 * engine.ts — the LED frame the pad will show, computed in TypeScript.
 *
 * This is a line-for-line port of `firmware/src/lighting/leds.c`:
 * `led_compute_frame`, `hsv_to_rgb`, `led_gamma_scale` and the 256-entry gamma
 * table. It exists for one reason: the desktop preview and the nine physical
 * LEDs have to agree, and the only way to know they agree is to run both on the
 * same inputs. `tests/ledEngine.test.cjs` does exactly that — it builds the C for
 * the host, dumps frames for a table of scenarios, and asserts this file produces
 * the same bytes.
 *
 * Rules for editing: do not "improve" anything here. The integer division order,
 * the >> 8 shifts, the /3 when reactive is idle and the triangle wave are part of
 * the output. If the firmware changes, change both and let the parity test say
 * whether you got it right.
 */

/** 2.2-ish gamma, generated offline; 256 bytes of flash on the device. */
const GAMMA8 = [
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1,
    1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   2,   2,   2,   2,   2,   2,
    3,   3,   3,   3,   3,   4,   4,   4,   4,   5,   5,   5,   5,   6,   6,   6,
    6,   7,   7,   7,   8,   8,   8,   9,   9,   9,  10,  10,  11,  11,  11,  12,
   12,  13,  13,  13,  14,  14,  15,  15,  16,  16,  17,  17,  18,  18,  19,  19,
   20,  20,  21,  22,  22,  23,  23,  24,  25,  25,  26,  26,  27,  28,  28,  29,
   30,  30,  31,  32,  33,  33,  34,  35,  35,  36,  37,  38,  39,  39,  40,  41,
   42,  43,  43,  44,  45,  46,  47,  48,  49,  49,  50,  51,  52,  53,  54,  55,
   56,  57,  58,  59,  60,  61,  62,  63,  64,  65,  66,  67,  68,  69,  70,  71,
   73,  74,  75,  76,  77,  78,  79,  81,  82,  83,  84,  85,  87,  88,  89,  90,
   91,  93,  94,  95,  97,  98,  99, 100, 102, 103, 105, 106, 107, 109, 110, 111,
  113, 114, 116, 117, 119, 120, 121, 123, 124, 126, 127, 129, 130, 132, 133, 135,
  137, 138, 140, 141, 143, 145, 146, 148, 149, 151, 153, 154, 156, 158, 159, 161,
  163, 165, 166, 168, 170, 172, 173, 175, 177, 179, 181, 182, 184, 186, 188, 190,
  192, 194, 196, 197, 199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219, 221,
  223, 225, 227, 229, 231, 234, 236, 238, 240, 242, 244, 246, 248, 251, 253, 255,
];

import { CHANNEL_COUNT } from '../../host/protocol/mpad3-protocol.mjs';

export const LED_COUNT = 9;

/** Same numbering as `firmware/include/actions.h` and `host/protocol`. */
export const LED_MODE = {
  OFF: 0,
  STATIC: 1,
  PER_KEY: 2,
  BREATH: 3,
  RAINBOW: 4,
  SPECTRUM: 5,
  REACTIVE: 6,
  CHANNEL_TINT: 7,
} as const;

export type LedModeId = (typeof LED_MODE)[keyof typeof LED_MODE];

export type Rgb = { r: number; g: number; b: number };

export interface LightingConfig {
  mode: number;
  brightness: number;
  speed: number;
  r: number;
  g: number;
  b: number;
  /** 9 x [r,g,b]. Only the entries whose mask bit is set are used. */
  perKey: Array<[number, number, number]>;
  perKeyMask: number;
}

export interface LedState {
  keyDownMask: number;
  keyHitMask: number;
  channel: number;
  nowMs: number;
  /** 255 = no extra cap. */
  masterBrightness: number;
  /** 255 = ignored. */
  idleOverride: number;
}

export interface LedEngine {
  level: number[];
  lastMs: number;
}

export function createEngine(): LedEngine {
  return { level: new Array<number>(LED_COUNT).fill(0), lastMs: 0 };
}

export function createLighting(overrides: Partial<LightingConfig> = {}): LightingConfig {
  return {
    mode: LED_MODE.STATIC,
    brightness: 90,
    speed: 128,
    r: 32,
    g: 96,
    b: 255,
    perKey: Array.from({ length: LED_COUNT }, () => [0, 0, 0] as [number, number, number]),
    perKeyMask: 0,
    ...overrides,
  };
}

/** The C writes through pointers; this returns the same three numbers. */
export function hsvToRgb(hue: number, sat: number, val: number): Rgb {
  if (val === 0) return { r: 0, g: 0, b: 0 };
  if (sat === 0) return { r: val, g: val, b: val };

  const h32 = hue & 0xffff;
  const region = Math.floor((h32 * 6) / 65536) & 0xff;
  /* The C divides region*65536 by 6 in *integer* arithmetic before subtracting;
   * doing it in floating point here shifts the remainder by one and produced a
   * visibly different blue. The parity test caught it — do not "simplify". */
  const sextantFloor = Math.floor((region * 65536) / 6);
  const remainder = Math.floor(((h32 - sextantFloor) * 1536) / 65536) & 0xffff;

  const p = (val * (255 - sat)) >> 8;
  const q = (val * (255 - ((sat * remainder) >> 8))) >> 8;
  const t = (val * (255 - ((sat * (255 - remainder)) >> 8))) >> 8;

  switch (region) {
    case 0: return { r: val, g: t, b: p };
    case 1: return { r: q, g: val, b: p };
    case 2: return { r: p, g: val, b: t };
    case 3: return { r: p, g: q, b: val };
    case 4: return { r: t, g: p, b: val };
    default: return { r: val, g: p, b: q };
  }
}

/** Scale in linear space, then gamma — the order matters when dimming. */
export function gammaScale(v: number, brightness: number): number {
  const scaled = Math.floor((v * brightness) / 255) & 0xff;
  return GAMMA8[scaled];
}

/** Triangle wave 0..255..0, integer only. */
function triangle(phase: number): number {
  const p = phase & 0xff;
  return p < 128 ? (p * 2) & 0xff : ((255 - p) * 2) & 0xff;
}

/**
 * Compute one frame. Mutates `eng` for reactive decay, exactly like the C: the
 * decay state is the only mutable part, and it advances once per call rather than
 * once per key (doing it per key was a real bug — only LED 0 ever decayed).
 */
export function computeFrame(eng: LedEngine, L: LightingConfig, st: LedState): Rgb[] {
  const out: Rgb[] = new Array<Rgb>(LED_COUNT);

  let master = L.brightness;
  if (st.idleOverride !== 255 && st.idleOverride < master) master = st.idleOverride;
  if (st.masterBrightness !== 255 && st.masterBrightness < master) master = st.masterBrightness;

  const rate = L.speed ? L.speed : 1;
  const phase = (Math.floor((st.nowMs * rate) / 64) & 0xffffffff) >>> 0;

  const dtMs = (st.nowMs - eng.lastMs) >>> 0;
  eng.lastMs = st.nowMs;

  for (let i = 0; i < LED_COUNT; i++) {
    let r = L.r;
    let g = L.g;
    let b = L.b;

    switch (L.mode) {
      case LED_MODE.OFF:
        r = g = b = 0;
        break;

      case LED_MODE.STATIC:
        break;

      case LED_MODE.PER_KEY:
        if (L.perKeyMask & (1 << i)) {
          const c = L.perKey[i] ?? [0, 0, 0];
          r = c[0];
          g = c[1];
          b = c[2];
        }
        break;

      case LED_MODE.BREATH: {
        const s = triangle(phase);
        r = Math.floor((r * s) / 255);
        g = Math.floor((g * s) / 255);
        b = Math.floor((b * s) / 255);
        break;
      }

      case LED_MODE.RAINBOW: {
        const c = hsvToRgb((phase * 256) & 0xffff, 255, 255);
        r = c.r; g = c.g; b = c.b;
        break;
      }

      case LED_MODE.SPECTRUM: {
        const c = hsvToRgb((((phase * 256) & 0xffff) + Math.floor((i * 65536) / LED_COUNT)) & 0xffff, 255, 255);
        r = c.r; g = c.g; b = c.b;
        break;
      }

      case LED_MODE.REACTIVE: {
        if (st.keyHitMask & (1 << i)) {
          eng.level[i] = 255;
        } else if (dtMs) {
          let drop = Math.floor((dtMs * (L.speed ? L.speed : 64)) / 32);
          if (drop > 255) drop = 255;
          eng.level[i] = drop >= eng.level[i] ? 0 : eng.level[i] - drop;
        }
        const flare = eng.level[i];
        if (flare) {
          const inv = 255 - flare;
          r = Math.floor((r * inv + 255 * flare) / 255);
          g = Math.floor((g * inv + 255 * flare) / 255);
          b = Math.floor((b * inv + 255 * flare) / 255);
        } else {
          r = Math.floor(r / 3);
          g = Math.floor(g / 3);
          b = Math.floor(b / 3);
        }
        break;
      }

      case LED_MODE.CHANNEL_TINT: {
        /* Hue is spread across however many channels the device has. This used
         * to be a literal 3; when the pad grew a fourth page the C moved and
         * this did not, which the parity test caught. Read it from the wire
         * definition so the two cannot disagree again. */
        const c = hsvToRgb(Math.floor((st.channel * 65536) / CHANNEL_COUNT), 220, 220);
        r = c.r; g = c.g; b = c.b;
        break;
      }

      default:
        r = g = b = 0;
        break;
    }

    out[i] = {
      r: gammaScale(r & 0xff, master),
      g: gammaScale(g & 0xff, master),
      b: gammaScale(b & 0xff, master),
    };
  }

  return out;
}

/** The preview wants CSS: 9 hex colours from the same frame the LEDs get. */
export function frameToHex(frame: Rgb[]): string[] {
  return frame.map(({ r, g, b }) =>
    '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''),
  );
}
