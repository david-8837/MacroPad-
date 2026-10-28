// How much animation the panel can actually hold.
//
// Every number here is derived from the hardware and the flash map, not picked
// because it felt round. The chain is:
//
//   RP2040-Zero flash                  2 MiB    = 2 097 152 B   (board.h)
//   - config sectors (2 x 4 KiB)                     -8 192 B   (0x1FE000..0x1FFFFF)
//   - application image ceiling                   0x1E0000 B   (see below)
//   = frame region                     120 KiB   = 122 880 B   (0x1E0000..0x1FDFFF)
//   / 512 B per frame (128 x 32, 4 pages)          = 240 frame slots
//
// Why the frame region ends where it does:
//  - it must sit directly below the config sectors, so a reflash can never
//    clobber saved frames and saving frames can never clobber config;
//  - it must start on a 4 KiB sector boundary, because that is the flash erase
//    granularity (W25Q16JV) — 0x1E0000 is aligned, 26 sectors of address space;
//  - it must be an exact multiple of the 512 B frame, or the last frame would
//    straddle the erase-sector that holds config — 122 880 / 512 = 240 exactly;
//  - it leaves the application image 1 965 824 B (1.87 MiB) before 0x1E0000.
//    This firmware (TinyUSB composite + PIO LED engine + gesture state machine)
//    is tens of KiB, so the image is not the binding constraint; the region
//    boundary is enforced at build time instead of being trusted.
//
// What is NOT a constraint, despite looking like one:
//  - RAM: frames are `const` and live in XIP flash, so one 512 B staging buffer
//    plus the 512 B SSD1306 shadow is the whole cost (about 1.1 KiB), whatever
//    the number of modes. RAM never limits the mode count.
//  - I2C bandwidth: 400 kHz at 10 bit-times per byte is 40 000 B/s; a full-frame
//    flush costs 512 data + 4 control + 8 addressing = 524 B, so the absolute
//    ceiling is ~76 full-frame updates per second. The catalogue's fastest loop
//    is 15 fps = 7 860 B/s, about 20 % of the bus. Also not limiting.
//  - Config blob: a mode is a bit in `cfg_global_t.oled_playlist`, which fits in
//    the padding the 16 B struct already had. No per-mode bytes are stored.
//
// So flash is the only real limit, and it is a byte budget, not a mode count —
// modes cost wildly different amounts (6 144 B for a 12-frame loop, 16 384 B for
// a 32-frame one). `formatCapacity()` converts the byte budget into the number
// of extra loops of the current average size that still fit.

import { FRAME_BYTES } from './frame'; // 512: 128 x 32 / 8, one SSD1306 frame
import { OLED_MODES, type OLEDMode } from './modes';

/** W25Q16JV on the RP2040-Zero, as declared in firmware/include/board.h. */
export const FLASH_TOTAL_BYTES = 2 * 1024 * 1024;

/** Two 4 KiB sectors: the A/B config pair at 0x1FE000 and 0x1FF000. */
export const CONFIG_REGION_BYTES = 2 * 4096;

/** Flash erase granularity. Every region boundary must be a multiple of this. */
export const FLASH_SECTOR_BYTES = 4096;

/** Offset of the frame region: directly below the config sectors. */
export const FRAME_REGION_OFFSET = 0x1e0000; // 1 966 080

/** Bytes reserved for baked animation tables. */
export const FRAME_REGION_BYTES = 0x1fe000 - FRAME_REGION_OFFSET; // 122 880 = 120 KiB

/** How many 512 B frames that region holds. */
export const FRAME_SLOTS = FRAME_REGION_BYTES / FRAME_BYTES; // 240

/** The application image must end before the frame region starts. */
export const APP_IMAGE_CEILING = FRAME_REGION_OFFSET;

/** SSD1306 ACK-inclusive byte time on a 400 kHz bus. */
export const I2C_HZ = 400_000;
export const I2C_BIT_TIMES_PER_BYTE = 10;
export const I2C_BYTES_PER_SEC = I2C_HZ / I2C_BIT_TIMES_PER_BYTE; // 40 000

/** Wire cost of one full-frame update: data plus control and addressing bytes. */
export const FRAME_WIRE_BYTES = FRAME_BYTES + 12; // 524

/** Absolute upper bound on full-frame refreshes per second. */
export const MAX_FULL_FRAME_FPS = Math.floor(I2C_BYTES_PER_SEC / FRAME_WIRE_BYTES); // 76

/**
 * Auto-cycle bounds.
 *
 * MIN is derived: a mode must be on screen for at least two full plays of the
 * shortest loop in the catalogue (loader, 12 frames at 8 fps = 1.5 s), otherwise
 * switching turns every animation into a flicker.
 *
 * MAX is the width of the field that stores it — `oled_auto_cycle_s` is one byte
 * in `cfg_global_t`, so 255 s. 0 means "off".
 */
export const MIN_AUTO_CYCLE_S = 3;
export const MAX_AUTO_CYCLE_S = 255;
export const AUTO_CYCLE_DEFAULT_S = 30;

export interface ModeFootprint {
  id: OLEDMode;
  /** Frames stored in flash. Runtime screens bake nothing. */
  frames: number;
  /** Bytes of flash. */
  bytes: number;
  fps: number;
}

/** What one mode costs in flash. */
export function footprint(id: OLEDMode): ModeFootprint {
  const spec = OLED_MODES.find((m) => m.id === id);
  if (!spec) return { id, frames: 0, bytes: 0, fps: 0 };
  // Runtime screens read live values (clock, telemetry, media, layer track) and
  // are drawn from host/firmware data, so they store no frames at all.
  const frames = spec.runtime ? 0 : spec.frames;
  return { id, frames, bytes: frames * FRAME_BYTES, fps: spec.fps };
}

export interface Capacity {
  /** Bytes the given playlist's baked loops occupy. */
  usedBytes: number;
  /** Hard limit. */
  limitBytes: number;
  freeBytes: number;
  usedFrames: number;
  totalFrames: number;
  /** 0..1 */
  fraction: number;
  /** Playlist entries that cost no flash (runtime screens). */
  freeModes: number;
  /** Average bytes per baked loop currently in the playlist. */
  averageLoopBytes: number;
  /** Extra baked loops of that average size that still fit. */
  headroomLoops: number;
  fits: boolean;
}

/**
 * Capacity accounting for a set of playlist entries.
 *
 * `limitBytes` exists so tests can exercise the over-budget path: with the
 * shipping catalogue (53 % used) no combination of real modes can overflow, and
 * an untestable guard is a guard nobody knows still works.
 */
export function capacityFor(
  ids: readonly OLEDMode[],
  limitBytes: number = FRAME_REGION_BYTES,
): Capacity {
  const prints = ids.map(footprint);
  const baked = prints.filter((p) => p.bytes > 0);
  const usedBytes = baked.reduce((n, p) => n + p.bytes, 0);
  const usedFrames = usedBytes / FRAME_BYTES;
  const freeBytes = limitBytes - usedBytes;
  const averageLoopBytes = baked.length ? usedBytes / baked.length : 0;
  return {
    usedBytes,
    limitBytes,
    freeBytes,
    usedFrames,
    totalFrames: limitBytes / FRAME_BYTES,
    fraction: usedBytes / limitBytes,
    freeModes: prints.length - baked.length,
    averageLoopBytes,
    headroomLoops: averageLoopBytes ? Math.max(0, Math.floor(freeBytes / averageLoopBytes)) : 0,
    fits: usedBytes <= limitBytes,
  };
}

/** Highest fps the catalogue may use, kept clear of the bus ceiling. */
export function fpsIsRenderable(fps: number): boolean {
  return fps > 0 && fps <= MAX_FULL_FRAME_FPS;
}

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;

/** `63.5 / 120.0 KiB · 113 frames free · 6 loops of headroom` */
export function formatCapacity(cap: Capacity): string {
  return (
    `${kib(cap.usedBytes)} / ${kib(cap.limitBytes)} · ` +
    `${cap.totalFrames - cap.usedFrames} / ${cap.totalFrames} frames free · ` +
    `${cap.headroomLoops} loop${cap.headroomLoops === 1 ? '' : 's'} headroom`
  );
}

/** Short form for a card badge: `9.0 KiB` for a baked loop, `0 B` for runtime. */
export function formatFootprint(id: OLEDMode): string {
  const { bytes, frames } = footprint(id);
  return bytes ? `${frames} FR · ${kib(bytes)}` : 'RUNTIME · 0 B';
}
