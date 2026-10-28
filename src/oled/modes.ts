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
    const title = trunc((ctx.state.customTitle || 'KADOWAZ IND.').toUpperCase(), 14);
    const subtitle = trunc((ctx.state.customSubtitle || 'ONLINE').toUpperCase(), 9);
    const badgeW = textWidth(subtitle) + 3;
    const badgeX = PANEL_W - badgeW;

    // Title with a slow status dot.
    if (blink(ctx.time, 1000)) fb.fillRect(2, 3, 3, 3);
    fb.text(8, 1, title);

    // Status badge, knocked out of a lit block.
    fb.fillRect(badgeX, 0, badgeW, 9);
    fb.text(badgeX + 1, 1, subtitle, { invert: true });

    // Hero: the active layer.
    centre(fb, 10, trunc(ctx.layerName.toUpperCase(), 10), 2);

    // Footer: which deck this is, with the layer count on the right.
    fb.text(1, 24, trunc(ctx.deckName.toUpperCase(), 17));
    flushRight(fb, 24, `${ctx.layerIndex + 1}/${ctx.layerCount}`);
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

    const temp = ctx.state.cpuTemp === null || ctx.state.cpuTemp === undefined
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

    // Nothing playing is a state the panel has to be able to say out loud —
    // silence beats an invented track name.
    if (!title) {
      fb.text(1, 0, 'NOW PLAYING');
      centre(fb, 12, 'NO MEDIA', 2);
      return;
    }

    const glyph = ctx.state.isPlaying ? PAUSE_GLYPH : PLAY_GLYPH;
    fb.sprite(glyph, 1, 0);
    fb.text(9, 0, 'NOW PLAYING');

    const pct = ctx.state.trackProgress;
    if (pct !== null && pct !== undefined) flushRight(fb, 0, `${Math.round(pct)}%`);

    // Marquee for the title (it is the part that runs long), artist on its own line.
    const upper = title.toUpperCase();
    const loop = textWidth(upper) + 24;
    const offset = Math.round((ctx.time / 45) % loop);
    fb.clip({ x: 0, y: 8, w: PANEL_W, h: 7 });
    fb.text(-offset, 8, `${upper}${' '.repeat(4)}`);
    fb.noClip();

    fb.text(0, 16, trunc((ctx.state.nowPlayingArtist || '').toUpperCase(), 21));
    // A progress bar without a duration is a bar with no meaning: draw none.
    if (pct !== null && pct !== undefined) meter(fb, 0, 25, PANEL_W, 5, clampPct(pct) / 100);
  },
};

// ── the layer track (kept: keycap silhouette + rounded square) ───────────────

const KEYCAP_W = KEYCAP[0].length;
const SQUARE_W = ROUNDED_SQUARE[0].length;
const SQUARE_H = ROUNDED_SQUARE.length;

function drawTrack(fb: Frame, ctx: RenderContext, track: TrackState) {
  const slots = Math.max(2, ctx.layerCount);
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
      fb.sprite(KEYCAP, centreOf(s, KEYCAP_W), Math.round((PANEL_H - KEYCAP.length) / 2));
    }
  }

  const x = Math.round(
    centreOf(track.from, SQUARE_W) +
      (centreOf(track.to, SQUARE_W) - centreOf(track.from, SQUARE_W)) * slide,
  );
  const y = Math.round((PANEL_H - SQUARE_H) / 2);
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
  id: 'loader',
  label: 'Progress Loader',
  frames: 12,
  fps: 8,
  runtime: false,
  render(fb, ctx) {
    centre(fb, 1, 'LOADING', 2);
    const blocks = 8;
    const bw = 12;
    const gap = 2;
    const total = blocks * bw + (blocks - 1) * gap;
    const x0 = Math.round((PANEL_W - total) / 2);
    const step = ctx.frame % (blocks + 4);
    for (let i = 0; i < blocks; i += 1) {
      const x = x0 + i * (bw + gap);
      if (i < step) {
        fb.fillRect(x, 20, bw, 7);
      } else {
        fb.rect(x, 20, bw, 7);
      }
    }
  },
};

const creature: OLEDModeSpec = {
  id: 'creature',
  label: 'Pixel Buddy',
  frames: 16,
  fps: 6,
  runtime: false,
  render(fb, ctx) {
    const f = ctx.frame % 16;
    const bitmap = f === 6 || f === 7 ? CREATURE_BLINK : f === 12 ? CREATURE_LOOK : CREATURE_IDLE;
    const bob = f === 3 || f === 4 || f === 11 ? 1 : 0;
    fb.sprite(bitmap, 3, 7 + bob);

    fb.text(23, 3, trunc(ctx.layerName.toUpperCase(), 16));
    fb.text(23, 12, blink(ctx.time, 1400) ? 'HELLO' : 'HELLO.');
    fb.text(23, 23, trunc(ctx.deckName.toUpperCase(), 16));
  },
};

const wave: OLEDModeSpec = {
  id: 'wave',
  label: 'Signal Wave',
  frames: 15,
  fps: 15,
  runtime: false,
  render(fb, ctx) {
    fb.text(0, 0, 'SIGNAL');
    flushRight(fb, 0, '1.0V');
    // Dotted axis and graticule.
    for (let x = 0; x < PANEL_W; x += 4) fb.pixel(x, 20, false);
    for (let x = 8; x < PANEL_W; x += 32) fb.vline(x, 10, 20, false);
    for (let x = 0; x < PANEL_W; x += 1) {
      const phase = (ctx.frame / 15) * Math.PI * 2;
      const v = Math.sin((x / PANEL_W) * Math.PI * 4 + phase);
      fb.pixel(x, Math.round(20 - v * 9));
    }
    fb.hline(0, 20, PANEL_W, false);
    for (let x = 0; x < PANEL_W; x += 4) fb.pixel(x, 20);
  },
};

const starfield: OLEDModeSpec = {
  id: 'starfield',
  label: 'Starfield',
  frames: 24,
  fps: 12,
  runtime: false,
  render(fb, ctx) {
    const t = ctx.frame;
    for (let i = 0; i < 46; i += 1) {
      const depth = 1 + Math.floor(hash(i * 7 + 1) * 3); // 1 far .. 3 near
      const speed = depth * 0.9 + 0.4;
      const baseY = hash(i * 13 + 5) * PANEL_H;
      const startX = hash(i * 31 + 9) * PANEL_W;
      const x = Math.round((startX - t * speed * 2 + PANEL_W * 4) % PANEL_W);
      const y = Math.round(baseY + Math.sin((t / 24) * Math.PI * 2 + i) * (depth - 1));
      if (depth === 3) {
        fb.fillRect(x, y, 2, 2);
      } else if (depth === 2) {
        fb.pixel(x, y);
        fb.pixel(x + 1, y);
      } else {
        fb.pixel(x, y);
      }
    }
    // Vanishing point cross.
    fb.pixel(0, 15);
    fb.pixel(0, 16);
  },
};

const rain: OLEDModeSpec = {
  id: 'rain',
  label: 'Digital Rain',
  frames: 24,
  fps: 12,
  runtime: false,
  render(fb, ctx) {
    const t = ctx.frame;
    for (let col = 0; col < 16; col += 1) {
      const x = col * 8 + 1;
      const speed = 1 + Math.floor(hash(col * 5 + 3) * 3);
      const len = 5 + Math.floor(hash(col * 11 + 7) * 8);
      const span = PANEL_H + len + 6;
      const head = Math.round((t * speed + hash(col) * span) % span) - 4;
      for (let k = 0; k < len; k += 1) {
        const y = head - k;
        if (y < 0 || y >= PANEL_H) continue;
        if (k === 0) {
          fb.fillRect(x, y, 3, 2);
        } else if (k < 3) {
          fb.fillRect(x, y, 2, 1);
        } else {
          fb.pixel(x + 1, y);
        }
      }
    }
  },
};

const clock: OLEDModeSpec = {
  id: 'clock',
  label: 'Clock',
  frames: 60,
  fps: 1,
  runtime: true,
  render(fb, ctx) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = now.getSeconds();
    // A blinking colon at 2x just looks like a rendering fault; the seconds
    // blocks below already show the clock is alive.
    centre(fb, 1, `${hh}:${mm}`, 2);
    // Seconds sweep, one block per five seconds.
    const blocks = 12;
    const bw = 6;
    const gap = 2;
    const total = blocks * bw + (blocks - 1) * gap;
    const x0 = Math.round((PANEL_W - total) / 2);
    const lit = Math.floor(ss / 5);
    for (let i = 0; i < blocks; i += 1) {
      const x = x0 + i * (bw + gap);
      if (i < lit) fb.fillRect(x, 19, bw, 4);
      else fb.rect(x, 19, bw, 4);
    }
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    centre(fb, 24, `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`);
  },
};

const radar: OLEDModeSpec = {
  id: 'radar',
  label: 'Radar Sweep',
  frames: 24,
  fps: 12,
  runtime: false,
  render(fb, ctx) {
    const cx = 17;
    const cy = 16;
    const r = 14;
    const angle = (ctx.frame / 24) * Math.PI * 2;
    // Scope rings, dotted so the sweep reads over them.
    for (const rr of [5, 10, 14]) {
      for (let a = 0; a < 360; a += 12) {
        const rad = (a * Math.PI) / 180;
        fb.pixel(Math.round(cx + Math.cos(rad) * rr), Math.round(cy + Math.sin(rad) * rr));
      }
    }
    // Cross hairs.
    fb.pixel(cx, cy - r);
    fb.pixel(cx, cy + r);
    fb.pixel(cx - r, cy);
    fb.pixel(cx + r, cy);
    // Sweep line with a fading tail.
    for (let i = 0; i < 16; i += 1) {
      const a = angle - (i * Math.PI) / 180;
      const rr = r * (1 - i / 40);
      fb.pixel(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr));
    }
    // Blips light up as the sweep passes them.
    const blips: [number, number][] = [
      [8, 9],
      [22, 12],
      [14, 24],
      [26, 20],
    ];
    blips.forEach(([bx, by], i) => {
      const ba = Math.atan2(by - cy, bx - cx);
      let d = ((angle - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (d < Math.PI * 0.9) fb.fillRect(bx, by, 2, 2);
      if (d < 0.02 && i === 0) fb.fillRect(bx - 1, by - 1, 3, 3);
    });
    fb.text(38, 4, 'SCAN');
    fb.text(38, 13, `${(ctx.frame % 24).toString().padStart(2, '0')} / 24`);
    fb.text(38, 22, 'R13.0M');
  },
};

const pulse: OLEDModeSpec = {
  id: 'pulse',
  label: 'Heartbeat',
  frames: 12,
  fps: 12,
  runtime: false,
  render(fb, ctx) {
    const width = PANEL_W - 30; // leave room for the BPM block
    const shift = ctx.frame * 2;
    const baseline = 15;
    let prev = baseline;
    for (let x = 0; x < width; x += 1) {
      const p = (x + shift) % 60;
      let v = 0;
      if (p >= 4 && p <= 7) v = (p - 4) * 0.7; // P wave
      if (p >= 8 && p <= 9) v = -1;
      if (p >= 14 && p <= 16) v = -3; // Q
      if (p >= 17 && p <= 18) v = 11; // R
      if (p >= 19 && p <= 21) v = -5; // S
      if (p >= 30 && p <= 36) v = 3; // T wave
      const y = Math.round(baseline - v);
      // Join samples so the trace is a line, not a dotted field.
      const lo = Math.min(prev, y);
      const hi = Math.max(prev, y);
      fb.vline(x, lo, hi - lo + 1);
      prev = y;
    }
    // Pulse marker on the right, beating with the loop.
    const beat = ctx.frame % 12;
    if (beat < 3) fb.sprite(HEART, PANEL_W - 9, 2);
    else fb.rect(PANEL_W - 9, 2, 8, 7, false);
    flushRight(fb, 12, 'BPM');
    flushRight(fb, 21, String(72 + (beat % 3)));
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
