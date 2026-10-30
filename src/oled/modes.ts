// The OLED mode catalogue.
//
// Everything the panel can display lives here as a pure function that draws into
// a 128x32 `Frame`. The React canvas, the drawer previews and the firmware frame
// exporter all call `renderPanel()` — there is no second implementation, so the
// miniature preview, the simulator and the baked firmware frames cannot drift.
//
// Rules every mode follows, because the physical panel is 128x32 and monochrome:
//  - 1-bit only (no greys, no gradients);
//  - 5x7 text, uppercase, 6 px advance — 21 characters per line at scale 1;
//  - motion is a clean loop with a known frame count, so it bakes into frames.

import type { OLEDState } from '../types';
import { Frame, PANEL_H, PANEL_W } from './frame';
import { textWidth } from './font';
import {
  CREATURE_BLINK,
  CREATURE_IDLE,
  CREATURE_LOOK,
  HEART,
  KEYCAP,
  PAUSE_GLYPH,
  PLAY_GLYPH,
  ROUNDED_SQUARE,
} from './sprites';

export type OLEDMode =
  | 'kadowaz'
  | 'system'
  | 'media'
  | 'channel'
  | 'loader'
  | 'creature'
  | 'wave'
  | 'starfield'
  | 'rain'
  | 'clock'
  | 'radar'
  | 'pulse';

/** Layer-change choreography. The track is drawn for this long in total. */
export const TRACK_TIMING = {
  /** The track paints before anything moves, so the move reads. */
  wakeMs: 120,
  /** Square travel time between stops. */
  slideMs: 320,
} as const;

export interface TrackState {
  /** Stop the square is sliding from. */
  from: number;
  /** Stop it is sliding to. */
  to: number;
  /** Milliseconds since the layer change began. */
  elapsed: number;
}

/** A running layer-change animation, as handed to the canvas by its owner. */
export interface TrackRun {
  from: number;
  to: number;
  /** `performance.now()` when the change started. */
  startedAt: number;
}

export interface RenderContext {
  /** Milliseconds since this screen started animating. */
  time: number;
  /** Frame index at the mode's own fps — what the firmware will step through. */
  frame: number;
  state: OLEDState;
  deckName: string;
  layerName: string;
  /** 0-based active layer. */
  layerIndex: number;
  layerCount: number;
  /**
   * When set the panel shows the layer track instead of the mode's own layout:
   * during a layer change, and permanently in Layer Indicator mode.
   */
  track: TrackState | null;
}

export interface OLEDModeSpec {
  id: OLEDMode;
  /** Card title — the only text on a mode card. */
  label: string;
  /** Frames in one loop. 1 for static screens. */
  frames: number;
  /** Playback rate, shared by the preview and the firmware table. */
  fps: number;
  /**
   * True when the screen depends on live data (clock, telemetry, media), so the
   * firmware has to render it on the fly instead of stepping through frames.
   */
  runtime: boolean;
  render(fb: Frame, ctx: RenderContext): void;
}

// ── small drawing helpers ───────────────────────────────────────────────────

const trunc = (value: string, chars: number) =>
  value.length > chars ? value.slice(0, Math.max(0, chars)) : value;

/** Percentages arrive from the OS; clamp them before they reach a meter. */
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Right-align text, leaving one pixel of margin at the panel edge. */
function flushRight(fb: Frame, y: number, value: string, scale = 1, invert = false) {
  fb.text(PANEL_W - 1 - textWidth(value, scale), y, value, { scale, invert });
}

/** Draw text centred on the panel width. */
function centre(fb: Frame, y: number, value: string, scale = 1, invert = false) {
  const x = Math.round((PANEL_W - textWidth(value, scale)) / 2);
  fb.text(x, y, value, { scale, invert });
}

/** True for one half of each period — used for blink and pulse effects. */
const blink = (timeMs: number, periodMs = 1000) => (timeMs % periodMs) < periodMs / 2;

/** Deterministic 0..1 noise: same value in the preview and on the hardware. */
function hash(n: number): number {
  let t = (n + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Bar: a hairline track with a solid fill on top. At 5 px tall an outline plus a
 * fill reads as two nested boxes, so the track is a single baseline instead.
 */
function meter(fb: Frame, x: number, y: number, w: number, h: number, pct: number) {
  const p = Math.max(0, Math.min(1, pct));
  fb.hline(x, y + h - 1, w, true);
  const fill = Math.round(w * p);
  if (fill > 0) fb.fillRect(x, y, fill, h);
}

// ── kept modes ──────────────────────────────────────────────────────────────

const deckStatus: OLEDModeSpec = {
  id: 'kadowaz',
  label: 'Deck Status',
  frames: 2,
  fps: 2,
  runtime: true,
  render(fb, ctx) {
    // Reserve separate regions so a long user title cannot collide with the badge.
    const title = (ctx.state.customTitle || 'MACROPAD').toUpperCase();
    const subtitle = trunc((ctx.state.customSubtitle || 'READY').toUpperCase(), 8);
    const badgeW = textWidth(subtitle) + 4;
    const badgeX = PANEL_W - badgeW - 1;
    if (blink(ctx.time, 1000)) fb.fillRect(1, 2, 3, 3);
    fb.clip({ x: 7, y: 0, w: Math.max(0, badgeX - 9), h: 8 });
    fb.text(7, 0, trunc(title, Math.max(0, Math.floor((badgeX - 9) / 6))));
    fb.noClip();
    fb.fillRect(badgeX, 0, badgeW, 8);
    fb.text(badgeX + 2, 0, subtitle, { invert: true });
    fb.hline(0, 9, PANEL_W);
    centre(fb, 12, `LAYER ${ctx.layerIndex}`, 2);
    const count = Math.max(1, Math.min(4, ctx.layerCount));
    const width = count * 12 - 3;
    const start = Math.floor((PANEL_W - width) / 2);
    for (let i = 0; i < count; i += 1) {
      if (i === ctx.layerIndex) fb.fillRect(start + i * 12, 29, 9, 2);
      else fb.hline(start + i * 12, 30, 9);
    }
  },
};

const system: OLEDModeSpec = {
  id: 'system',
  label: 'System Telemetry',
  frames: 1,
  fps: 4,
  runtime: true,
  render(fb, ctx) {
    // Null is "not measured", so it prints as -- instead of a plausible number.
    const pctOf = (v: number | null): number | null =>
      v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(clampPct(v));

    const temp = ctx.state.cpuTemp == null || !Number.isFinite(ctx.state.cpuTemp)
      ? '--'
      : `${Math.round(ctx.state.cpuTemp)}°C`;
    fb.text(0, 0, 'SYSTEM');
    flushRight(fb, 0, temp);

    const rows: [string, number | null][] = [
      ['CPU', ctx.state.cpuLoad],
      ['RAM', ctx.state.ramUsage],
      ['GPU', ctx.state.gpuLoad],
    ];
    rows.forEach(([label, value], i) => {
      const y = 9 + i * 8;
      const pct = pctOf(value);
      fb.text(0, y, label);
      if (pct === null) {
        // No bar at all: a half-drawn meter would read as a real reading.
        fb.text(24, y, '--');
        return;
      }
      meter(fb, 22, y, 68, 5, pct / 100);
      flushRight(fb, y, `${pct}%`);
    });
  },
};

const nowPlaying: OLEDModeSpec = {
  id: 'media',
  label: 'Now Playing',
  frames: 32,
  fps: 10,
  runtime: true,
  render(fb, ctx) {
    const title = (ctx.state.nowPlayingTrack || '').trim();
    if (!title) {
      fb.text(1, 0, 'NOW PLAYING');
      centre(fb, 12, 'NO MEDIA', 2);
      return;
    }

    fb.sprite(ctx.state.isPlaying ? PLAY_GLYPH : PAUSE_GLYPH, 1, 0);
    fb.text(10, 0, 'NOW PLAYING');
    const rawPct = ctx.state.trackProgress;
    const pct = rawPct == null || !Number.isFinite(rawPct) ? null : Math.round(clampPct(rawPct));
    if (pct !== null) flushRight(fb, 0, `${pct}%`);

    // Short titles stay still. Long titles pause before scrolling and wrap with
    // a second copy so the title never disappears for a whole marquee cycle.
    const upper = title.toUpperCase();
    const titleWidth = textWidth(upper);
    fb.clip({ x: 0, y: 9, w: PANEL_W, h: 7 });
    if (titleWidth <= PANEL_W) fb.text(0, 9, upper);
    else {
      const period = titleWidth + 24;
      const offset = Math.floor(Math.max(0, ctx.time - 900) / 55) % period;
      fb.text(-offset, 9, upper);
      fb.text(period - offset, 9, upper);
    }
    fb.noClip();
    fb.text(0, 18, trunc((ctx.state.nowPlayingArtist || 'UNKNOWN ARTIST').toUpperCase(), 21));
    if (pct !== null) meter(fb, 0, 27, PANEL_W, 4, pct / 100);
  },
};

// ── the layer track (kept: keycap silhouette + rounded square) ───────────────

const KEYCAP_W = KEYCAP[0].length;
const SQUARE_W = ROUNDED_SQUARE[0].length;

function drawTrack(fb: Frame, ctx: RenderContext, track: TrackState) {
  const slots = Math.max(2, ctx.layerCount);
  fb.text(1, 1, 'LAYER');
  flushRight(fb, 1, `${ctx.layerIndex} / ${Math.max(0, ctx.layerCount - 1)}`);
  fb.hline(0, 10, PANEL_W);
  const slotW = PANEL_W / slots;
  const centreOf = (n: number, w: number) => Math.round(slotW * (n + 0.5) - w / 2);

  const moving = track.from !== track.to;
  const slide = moving
    ? Math.max(0, Math.min(1, (track.elapsed - TRACK_TIMING.wakeMs) / TRACK_TIMING.slideMs))
    : 1;
  const settled = !moving || slide >= 1;

  // Every stop the square is not standing on shows a keycap silhouette. They are
  // painted for the wake beat, dropped for the slide so the travelling square
  // never collides with one, and brought back once it lands.
  const keycapsVisible = !moving || settled || slide === 0;
  if (keycapsVisible) {
    for (let s = 0; s < slots; s += 1) {
      if (s === track.to) continue;
      fb.sprite(KEYCAP, centreOf(s, KEYCAP_W), 19);
    }
  }

  const x = Math.round(
    centreOf(track.from, SQUARE_W) +
      (centreOf(track.to, SQUARE_W) - centreOf(track.from, SQUARE_W)) * slide,
  );
  const y = 16;
  fb.sprite(ROUNDED_SQUARE, x, y);

  // The layer number is knocked out of the square. A 7 px tall roll cannot be
  // read at this resolution, so the digits swap as the square passes the middle
  // of its travel: old number on the way out, new one as it arrives.
  const label = String((settled || slide >= 0.5 ? track.to : track.from)).padStart(2, '0');
  fb.text(x + Math.round((SQUARE_W - textWidth(label)) / 2), y + 3, label, { invert: true });
}

const layerIndicator: OLEDModeSpec = {
  id: 'channel',
  label: 'Layer Indicator',
  frames: 1,
  fps: 2,
  runtime: true,
  render(fb, ctx) {
    drawTrack(fb, ctx, { from: ctx.layerIndex, to: ctx.layerIndex, elapsed: 0 });
  },
};

// ── the new collection ──────────────────────────────────────────────────────

const loader: OLEDModeSpec = {
  id: 'loader', label: 'Progress Loader', frames: 12, fps: 8, runtime: false,
  render(fb, ctx) {
    fb.text(2, 1, 'LOADING');
    flushRight(fb, 1, 'ANIMATION');
    fb.hline(0, 10, PANEL_W);
    const count = 10;
    const step = ctx.frame % 12;
    for (let i = 0; i < count; i += 1) {
      const x = 4 + i * 12;
      fb.rect(x, 15, 9, 10);
      if (i < Math.min(step, count)) fb.fillRect(x + 2, 17, 5, 6);
    }
    fb.hline(4, 29, 117);
  },
};

const creature: OLEDModeSpec = {
  id: 'creature', label: 'Pixel Buddy', frames: 16, fps: 6, runtime: false,
  render(fb, ctx) {
    const f = ctx.frame % 16;
    const bitmap = f === 6 || f === 7 ? CREATURE_BLINK : f === 12 ? CREATURE_LOOK : CREATURE_IDLE;
    const bob = f === 3 || f === 4 || f === 11 ? 1 : 0;
    fb.sprite(bitmap, 4, 8 + bob);
    fb.hline(2, 27, 20);
    fb.text(28, 1, 'PIXEL BUDDY');
    fb.hline(28, 10, 98);
    fb.rect(28, 14, 67, 13);
    fb.text(32, 17, 'HELLO');
    for (let i = 0; i < 3; i += 1) if (i <= Math.floor(f / 4) % 4) fb.fillRect(69 + i * 6, 21, 2, 2);
  },
};

const wave: OLEDModeSpec = {
  id: 'wave', label: 'Signal Wave', frames: 15, fps: 15, runtime: false,
  render(fb, ctx) {
    fb.text(1, 0, 'SIGNAL WAVE');
    fb.hline(0, 9, PANEL_W);
    // A decorative trace, not a voltage measurement.
    for (let x = 0; x < PANEL_W; x += 6) fb.pixel(x, 20);
    const phase = ((ctx.frame % 15) / 15) * Math.PI * 2;
    let previous = Math.round(20 - Math.sin((-1 / PANEL_W) * Math.PI * 4 + phase) * 8);
    for (let x = 0; x < PANEL_W; x += 1) {
      const y = Math.round(20 - Math.sin((x / PANEL_W) * Math.PI * 4 + phase) * 8);
      fb.vline(x, Math.min(y, previous), Math.abs(y - previous) + 1);
      previous = y;
    }
  },
};

const starfield: OLEDModeSpec = {
  id: 'starfield', label: 'Starfield', frames: 24, fps: 12, runtime: false,
  render(fb, ctx) {
    // Every depth makes an integer number of screen widths per loop.
    const t = (ctx.frame % 24) / 24;
    for (let i = 0; i < 40; i += 1) {
      const depth = 1 + Math.floor(hash(i * 7 + 1) * 3);
      const startX = hash(i * 31 + 9) * PANEL_W;
      const x = Math.floor((startX - t * PANEL_W * depth + PANEL_W * 4) % PANEL_W);
      const y = Math.floor(hash(i * 13 + 5) * PANEL_H);
      fb.pixel(x, y);
      if (depth >= 2 && x > 0) fb.pixel(x - 1, y);
      if (depth === 3 && y < PANEL_H - 1) fb.pixel(x, y + 1);
    }
  },
};

const rain: OLEDModeSpec = {
  id: 'rain', label: 'Digital Rain', frames: 24, fps: 12, runtime: false,
  render(fb, ctx) {
    const t = (ctx.frame % 24) / 24;
    for (let col = 0; col < 16; col += 1) {
      const x = col * 8 + 2;
      const speed = 1 + Math.floor(hash(col * 5 + 3) * 2);
      const len = 5 + Math.floor(hash(col * 11 + 7) * 8);
      const head = Math.floor((t * PANEL_H * speed + hash(col) * PANEL_H) % PANEL_H);
      for (let k = 0; k < len; k += 1) {
        const y = (head - k + PANEL_H) % PANEL_H;
        if (k === 0) fb.fillRect(x, y, 3, 1);
        else if (k < 3 || (k + col) % 2 === 0) fb.pixel(x + 1, y);
      }
    }
  },
};

const clock: OLEDModeSpec = {
  id: 'clock', label: 'Clock', frames: 60, fps: 1, runtime: true,
  render(fb) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    centre(fb, 0, `${hh}:${mm}`, 2);
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    centre(fb, 17, `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`);
    // One tick for each five seconds; no RTC is assumed on the pad itself.
    for (let i = 0; i < 12; i += 1) {
      const x = 17 + i * 8;
      if (i < Math.floor(now.getSeconds() / 5)) fb.fillRect(x, 27, 5, 3);
      else fb.hline(x, 29, 5);
    }
  },
};

const radar: OLEDModeSpec = {
  id: 'radar', label: 'Radar Sweep', frames: 24, fps: 12, runtime: false,
  render(fb, ctx) {
    const cx = 16, cy = 16, r = 14;
    const angle = ((ctx.frame % 24) / 24) * Math.PI * 2;
    for (const rr of [5, 10, 14]) for (let a = 0; a < 360; a += 15) {
      const rad = (a * Math.PI) / 180;
      fb.pixel(Math.round(cx + Math.cos(rad) * rr), Math.round(cy + Math.sin(rad) * rr));
    }
    for (let radius = 1; radius <= r; radius += 1) {
      fb.pixel(Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius));
    }
    for (const [bx, by] of [[8, 9], [22, 12], [14, 24], [26, 20]]) {
      const ba = Math.atan2(by - cy, bx - cx);
      const d = ((angle - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (d < Math.PI * 0.65) fb.fillRect(bx, by, 2, 2);
    }
    fb.vline(35, 1, 30);
    fb.text(41, 2, 'RADAR');
    fb.text(41, 12, 'SWEEP');
    for (let i = 0; i < 8; i += 1) {
      if (i <= Math.floor((ctx.frame % 24) / 3)) fb.fillRect(41 + i * 10, 24, 7, 3);
      else fb.hline(41 + i * 10, 26, 7);
    }
  },
};

const pulse: OLEDModeSpec = {
  id: 'pulse', label: 'Heartbeat', frames: 12, fps: 12, runtime: false,
  render(fb, ctx) {
    const width = 91;
    const shift = (ctx.frame % 12) * 5; // exactly one 60-pixel cycle per loop
    const baseline = 16;
    const sample = (x: number) => {
      const p = (x + shift + 60) % 60;
      let v = 0;
      if (p >= 4 && p <= 7) v = (p - 4) * 0.7;
      if (p >= 8 && p <= 9) v = -1;
      if (p >= 14 && p <= 16) v = -3;
      if (p >= 17 && p <= 18) v = 11;
      if (p >= 19 && p <= 21) v = -5;
      if (p >= 30 && p <= 36) v = 3;
      return Math.round(baseline - v);
    };
    let prev = sample(-1);
    for (let x = 0; x < width; x += 1) {
      const y = sample(x);
      fb.vline(x, Math.min(prev, y), Math.abs(y - prev) + 1);
      prev = y;
    }
    fb.vline(94, 1, 30);
    if (ctx.frame % 12 < 4) fb.sprite(HEART, 106, 2);
    else fb.sprite(HEART, 106, 3);
    fb.text(97, 13, 'PULSE');
    fb.text(102, 23, 'DEMO');
  },
};

// ── registry ────────────────────────────────────────────────────────────────

/** Order used by every cycler: the deck's own screens first, then the collection. */
export const OLED_MODES: OLEDModeSpec[] = [
  deckStatus,
  system,
  nowPlaying,
  layerIndicator,
  loader,
  creature,
  wave,
  starfield,
  rain,
  clock,
  radar,
  pulse,
];

export const OLED_MODE_IDS = OLED_MODES.map((m) => m.id);

export const isOLEDMode = (value: unknown): value is OLEDMode =>
  typeof value === 'string' && OLED_MODE_IDS.includes(value as OLEDMode);

export const getOLEDMode = (id: OLEDMode): OLEDModeSpec =>
  OLED_MODES.find((m) => m.id === id) ?? deckStatus;

/** Next mode in catalogue order — used by previews and by tests. The live
 *  rotation goes through `nextInPlaylist()` in ./playlist so the panel only ever
 *  shows the screens the user left enabled. */
export const nextOLEDMode = (id: OLEDMode): OLEDMode => {
  const i = OLED_MODE_IDS.indexOf(id);
  return OLED_MODE_IDS[(i + 1) % OLED_MODE_IDS.length];
};

/**
 * Draw one panel frame: the layer track wins when one is running, otherwise the
 * selected mode's own layout.
 */
export function renderPanel(fb: Frame, mode: OLEDMode, ctx: RenderContext): void {
  fb.clear();
  if (ctx.track) {
    drawTrack(fb, ctx, ctx.track);
    return;
  }
  getOLEDMode(mode).render(fb, ctx);
}

/** Frame index for a point in time at a given rate. */
export const frameAt = (timeMs: number, fps: number) => Math.floor((timeMs / 1000) * fps);
