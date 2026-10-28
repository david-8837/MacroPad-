#!/usr/bin/env node
// Bake the OLED catalogue into firmware frame tables.
//
// The panel is 128x32 monochrome, so one frame is 512 bytes (4 pages x 128
// columns, SSD1306 layout). The preview, the simulator and these frames all come
// from the same `renderPanel()` in src/oled/modes.ts — this script is the only
// place that knows how to get those pixels into C.
//
//   node scripts/export-oled-frames.mjs           write the tables
//   node scripts/export-oled-frames.mjs --check   fail if the committed copy is stale
//
// Modes that read live data (clock, telemetry, media, deck status, layer track)
// are marked `runtime: true` in the catalogue and are NOT baked: they depend on
// values the host or the firmware supplies at draw time. Everything else is a
// pure loop and bakes cleanly.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const tmp = join(root, '.tmp', 'oled-engine.mjs');
mkdirSync(dirname(tmp), { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'oled', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: tmp,
  logLevel: 'error',
});

const engine = await import(pathToFileURL(tmp).href);
const {
  Frame,
  FRAME_BYTES,
  OLED_MODES,
  renderPanel,
  OLED_MODE_IDS,
  // The budget is not a number typed here: it is the flash region derived in
  // src/oled/capacity.ts from the 2 MB part, the 8 KiB config pair and the
  // 512 B frame size. board.h declares the same region and asserts it.
  FRAME_REGION_BYTES,
  FRAME_SLOTS,
  MAX_FULL_FRAME_FPS,
  fpsIsRenderable,
  capacityFor,
} = engine;

/** Neutral sample data so live modes still bake if they ever get exported. */
const sampleState = {
  mode: 'kadowaz',
  cpuLoad: 37,
  gpuLoad: 52,
  ramUsage: 61,
  cpuTemp: 48,
  nowPlayingTrack: 'STARBOY',
  nowPlayingArtist: 'THE WEEKND',
  isPlaying: true,
  trackProgress: 35,
  audioVULeft: 70,
  audioVURight: 65,
  customTitle: 'KADOWAZ IND.',
  customSubtitle: 'ONLINE',
};

const C_IDENT = (id) => id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

function renderFrames(spec) {
  const frames = [];
  for (let f = 0; f < spec.frames; f += 1) {
    const fb = new Frame();
    renderPanel(fb, spec.id, {
      time: (f / spec.fps) * 1000,
      frame: f,
      state: sampleState,
      deckName: 'STUDIO DECK',
      layerName: 'EDIT & CUT PAGE',
      layerIndex: 1,
      layerCount: 4,
      track: null,
    });
    frames.push(fb.toPages());
  }
  return frames;
}

const baked = [];
let totalBytes = 0;
for (const spec of OLED_MODES) {
  if (spec.runtime) continue;
  const frames = renderFrames(spec);
  const bytes = frames.length * 512;
  totalBytes += bytes;
  baked.push({ spec, frames, bytes });
}

for (const { spec } of baked) {
  // A loop faster than the panel can be flushed is a loop that stutters on the
  // real hardware, so a rate that cannot be rendered is a build error, not a
  // note. MAX_FULL_FRAME_FPS comes from the I2C budget in capacity.ts.
  if (!fpsIsRenderable(spec.fps)) {
    console.error(
      `${spec.id}: ${spec.fps} fps cannot be flushed over a 400 kHz I2C bus ` +
        `(ceiling ${MAX_FULL_FRAME_FPS} fps at ${FRAME_BYTES} B/frame)`,
    );
    process.exit(1);
  }
}

const capacity = capacityFor(OLED_MODE_IDS);

if (totalBytes > FRAME_REGION_BYTES) {
  console.error(
    `frame tables are ${totalBytes} B, over the ${FRAME_REGION_BYTES} B flash region ` +
      `(${FRAME_SLOTS} frames) — shorten a loop or drop a mode`,
  );
  process.exit(1);
}
if (!capacity.fits) {
  console.error('catalogue does not fit the flash region: ' + capacity.usedBytes + ' B');
  process.exit(1);
}

const hex = (n) => `0x${n.toString(16).padStart(2, '0')}`;

let header = `/*
 * oled_frames.h — GENERATED FILE, DO NOT EDIT.
 *
 * Source of truth: src/oled/modes.ts (the same renderer the desktop preview and
 * the in-app simulator use). Regenerate with:
 *
 *   node scripts/export-oled-frames.mjs
 *
 * One frame = 128x32 pixels in SSD1306 page order = ${FRAME_BYTES} bytes.
 * Baked loops: ${baked.length}. Total flash: ${totalBytes} B (${(totalBytes / 1024).toFixed(1)} KiB)
 * of the ${FRAME_SLOTS}-frame (${(FRAME_REGION_BYTES / 1024).toFixed(0)} KiB) region reserved for frames
 * at BOARD_OLED_FRAME_REGION_OFFSET. Capacity maths: src/oled/capacity.ts.
 */
#ifndef OLED_FRAMES_H
#define OLED_FRAMES_H

#include <stdint.h>

#define OLED_FRAME_W 128
#define OLED_FRAME_H 32
#define OLED_FRAME_PAGES (OLED_FRAME_H / 8)
#define OLED_FRAME_BYTES (OLED_FRAME_W * OLED_FRAME_PAGES)

/* Mode ids, in catalogue order. Kept in sync by the exporter. */
typedef enum {
`;
for (const id of OLED_MODE_IDS) {
  header += `    OLED_MODE_${C_IDENT(id)} = ${OLED_MODE_IDS.indexOf(id)},\n`;
}
header += `    OLED_MODE_COUNT
} oled_mode_t;

/* One baked loop: a rate, a length, and the frames themselves. */
typedef struct {
    uint8_t mode;   /* oled_mode_t */
    uint8_t fps;
    uint8_t frames;
    const uint8_t *data; /* frames * OLED_FRAME_BYTES, page order */
} oled_anim_t;

extern const oled_anim_t OLED_ANIMS[];
extern const unsigned OLED_ANIM_COUNT;
/* Bytes of flash the tables occupy — checked by the host tests. */
extern const unsigned OLED_ANIM_BYTES;
/* Same value as a preprocessor constant, so oled_playlist.c can assert at
 * compile time that the tables still fit the reserved flash region. */
#define OLED_ANIM_TOTAL_BYTES ${totalBytes}u
#define OLED_ANIM_SLOTS_USED (OLED_ANIM_TOTAL_BYTES / OLED_FRAME_BYTES)
/* Hard ceiling from the flash map, mirrored from board.h. */
#define OLED_FRAME_REGION_TOTAL_BYTES ${FRAME_REGION_BYTES}u

#endif /* OLED_FRAMES_H */
`;

let source = `/*
 * oled_frames.c — GENERATED FILE, DO NOT EDIT.
 *
 * Regenerate with: node scripts/export-oled-frames.mjs
 * Source: src/oled/modes.ts
 */
#include "oled_frames.h"

`;

for (const { spec, frames } of baked) {
  const name = `OLED_FRAMES_${C_IDENT(spec.id)}`;
  source += `/* ${spec.label}: ${frames.length} frames @ ${spec.fps} fps (${(
    frames.length / spec.fps
  ).toFixed(2)} s loop) */\n`;
  source += `static const uint8_t ${name}[${frames.length} * OLED_FRAME_BYTES] = {\n`;
  for (const frame of frames) {
    const row = Array.from(frame, hex);
    // 16 bytes per line keeps the file readable without exploding its width.
    for (let i = 0; i < row.length; i += 16) {
      source += `    ${row.slice(i, i + 16).join(', ')},\n`;
    }
  }
  source += '};\n\n';
}

source += `const oled_anim_t OLED_ANIMS[] = {\n`;
for (const { spec } of baked) {
  source += `    { OLED_MODE_${C_IDENT(spec.id)}, ${spec.fps}, ${spec.frames}, OLED_FRAMES_${C_IDENT(spec.id)} },\n`;
}
source += `};\n\n`;
source += `const unsigned OLED_ANIM_COUNT = sizeof(OLED_ANIMS) / sizeof(OLED_ANIMS[0]);\n`;
source += `const unsigned OLED_ANIM_BYTES = ${totalBytes}u;\n`;

const headerPath = join(root, 'firmware', 'include', 'oled_frames.h');
const sourcePath = join(root, 'firmware', 'src', 'drivers', 'oled_frames.c');

if (checkOnly) {
  const sameHeader = existsSync(headerPath) && readFileSync(headerPath, 'utf8') === header;
  const sameSource = existsSync(sourcePath) && readFileSync(sourcePath, 'utf8') === source;
  if (!sameHeader || !sameSource) {
    console.error('oled frames are stale — run: node scripts/export-oled-frames.mjs');
    process.exit(1);
  }
  console.log(
    `oled frames up to date (${baked.length} loops, ${totalBytes} B, ` +
      `${((totalBytes / FRAME_REGION_BYTES) * 100).toFixed(0)} % of the frame region)`,
  );
} else {
  mkdirSync(dirname(sourcePath), { recursive: true });
  mkdirSync(dirname(headerPath), { recursive: true });
  writeFileSync(headerPath, header);
  writeFileSync(sourcePath, source);
  console.log(
    `wrote ${baked.length} loops, ${totalBytes} B (${(totalBytes / 1024).toFixed(1)} KiB) of ` +
      `${(FRAME_REGION_BYTES / 1024).toFixed(0)} KiB region — ` +
      `${((totalBytes / FRAME_REGION_BYTES) * 100).toFixed(0)} % used, ` +
      `${capacity.headroomLoops} more loops of average size fit`,
  );
  for (const { spec, frames } of baked) {
    console.log(
      `  ${spec.label.padEnd(18)} ${String(frames.length).padStart(3)} frames @ ` +
        `${String(spec.fps).padStart(2)} fps  ${String(frames.length * 512).padStart(6)} B`,
    );
  }
}
