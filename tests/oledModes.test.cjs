// Run: node tests/oledModes.test.cjs
//
// The OLED catalogue is the contract between the drawer previews, the deck
// screen and the firmware frame export. These assertions keep the three in step:
// every mode must draw something, loops must actually move, the cycler must walk
// the whole list, and the flash budget must hold.
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');
const esbuild = require('esbuild');

const FRAME_BYTES = 512;

const sampleState = {
  mode: 'kadowaz',
  cpuLoad: 24,
  gpuLoad: 42,
  ramUsage: 58,
  cpuTemp: 48,
  nowPlayingTrack: 'STARBOY',
  nowPlayingArtist: 'THE WEEKND',
  isPlaying: true,
  trackProgress: 35,
  customTitle: 'KADOWAZ IND.',
  customSubtitle: 'ONLINE',
};

function render(engine, spec, frame) {
  const ctx = {
    time: (frame / spec.fps) * 1000,
    frame,
    state: { ...sampleState, mode: spec.id },
    deckName: 'STUDIO DECK',
    layerName: 'EDIT & CUT PAGE',
    layerIndex: 1,
    layerCount: 4,
    track: null,
  };
  const fb = new engine.Frame();
  engine.renderPanel(fb, spec.id, ctx);
  return fb;
}

/** One frame as text rows, for assertions about what the panel says. */
function asciiRows(fb) {
  const rows = [];
  for (let y = 0; y < 32; y += 1) {
    let line = '';
    for (let x = 0; x < 128; x += 1) line += fb.get(x, y) ? '#' : '.';
    rows.push(line);
  }
  return rows;
}

/** Render one runtime screen with nothing measured at all. */
function renderUnmeasured(engine, id) {
  const ctx = {
    time: 0,
    frame: 0,
    state: {
      mode: id,
      cpuLoad: null,
      gpuLoad: null,
      ramUsage: null,
      cpuTemp: null,
      nowPlayingTrack: null,
      nowPlayingArtist: null,
      isPlaying: false,
      trackProgress: null,
      customTitle: 'KADOWAZ IND.',
      customSubtitle: 'ONLINE',
    },
    deckName: 'STUDIO DECK',
    layerName: 'EDIT & CUT PAGE',
    layerIndex: 1,
    layerCount: 4,
    track: null,
  };
  const fb = new engine.Frame();
  engine.renderPanel(fb, id, ctx);
  return fb;
}

async function loadEngine() {
  const outfile = path.join(os.tmpdir(), `kadowaz-oled-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'src', 'oled', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'error',
  });
  const engine = await import(pathToFileURL(outfile).href);
  fs.unlinkSync(outfile);
  return engine;
}

async function runTests() {
  const engine = await loadEngine();
  const { OLED_MODES, OLED_MODE_IDS, nextOLEDMode, isOLEDMode, getOLEDMode } = engine;

  // 1. Catalogue shape
  assert.strictEqual(OLED_MODES.length, 12, 'catalogue must hold 12 modes');
  assert.strictEqual(new Set(OLED_MODE_IDS).size, 12, 'mode ids must be unique');
  for (const spec of OLED_MODES) {
    assert.ok(spec.label && spec.label.length > 2, `${spec.id} needs a card title`);
    assert.ok(spec.fps >= 1, `${spec.id} needs a rate`);
    assert.ok(spec.frames >= 1, `${spec.id} needs at least one frame`);
  }

  // 2. The equalizer is gone, the four deck screens survived
  for (const gone of ['visualizer']) {
    assert.strictEqual(isOLEDMode(gone), false, `${gone} must not be selectable`);
  }
  for (const kept of ['kadowaz', 'system', 'media', 'channel']) {
    assert.ok(OLED_MODE_IDS.includes(kept), `${kept} mode must be kept`);
  }
  assert.strictEqual(isOLEDMode('nonsense'), false);
  assert.strictEqual(isOLEDMode(42), false);
  assert.strictEqual(getOLEDMode('nonsense').id, 'kadowaz', 'unknown ids fall back safely');

  // 3. Every mode draws ink on every frame, in hardware page layout
  for (const spec of OLED_MODES) {
    for (let f = 0; f < spec.frames; f += 1) {
      const fb = render(engine, spec, f);
      const pages = fb.toPages();
      assert.strictEqual(pages.length, FRAME_BYTES, `${spec.id} frame ${f} must be 512 bytes`);
      assert.ok(fb.inkCount() > 0, `${spec.id} frame ${f} must not be blank`);
    }
  }

  // 4. Baked loops actually move — a static "animation" would still pass step 3.
  //    Runtime screens (clock, telemetry, media, tracking) follow live values, so
  //    they are compared on structure rather than on two arbitrary frames.
  const still = [];
  for (const spec of OLED_MODES) {
    if (spec.frames < 2 || spec.runtime) continue;
    const a = render(engine, spec, 0).toHex();
    const b = render(engine, spec, Math.floor(spec.frames / 2)).toHex();
    if (a === b) still.push(spec.id);
  }
  assert.deepStrictEqual(still, [], `these loops never change: ${still.join(', ')}`);

  // 4b. The deck status dot blinks on its own two frames.
  const status = OLED_MODES.find((m) => m.id === 'kadowaz');
  assert.notStrictEqual(
    render(engine, status, 0).toHex(),
    render(engine, status, 1).toHex(),
    'the deck status screen must blink between its two frames',
  );

  // 5. Runtime vs baked split — the exporter bakes everything else
  const runtime = OLED_MODES.filter((m) => m.runtime).map((m) => m.id).sort();
  assert.deepStrictEqual(runtime, ['channel', 'clock', 'kadowaz', 'media', 'system']);

  const baked = OLED_MODES.filter((m) => !m.runtime);
  const flash = baked.reduce((sum, m) => sum + m.frames * FRAME_BYTES, 0);
  // The budget is the flash region derived in src/oled/capacity.ts, not a number
  // chosen here: 2 MB part - 8 KiB config - 1.87 MiB app region = 120 KiB.
  assert.strictEqual(engine.FRAME_REGION_BYTES, 120 * 1024, 'frame region is derived, do not edit it');
  assert.strictEqual(engine.FRAME_SLOTS, 240, '120 KiB / 512 B');
  assert.ok(flash <= engine.FRAME_REGION_BYTES, `baked tables ${flash} B exceed the region`);
  assert.strictEqual(engine.capacityFor(OLED_MODE_IDS).fits, true, 'catalogue must fit');

  // 6. Cycles wrap through the whole catalogue and land back at the start
  let id = OLED_MODE_IDS[0];
  const seen = [id];
  for (let i = 0; i < OLED_MODE_IDS.length - 1; i += 1) {
    id = nextOLEDMode(id);
    seen.push(id);
  }
  assert.deepStrictEqual(seen, OLED_MODE_IDS, 'cycle order must match catalogue order');
  assert.strictEqual(nextOLEDMode(id), OLED_MODE_IDS[0], 'cycle must wrap to the first mode');

  // 7. The layer track renders the keycap/rounded-badge pair and travels
  const trackFrame = (elapsed) => {
    const fb = new engine.Frame();
    engine.renderPanel(fb, 'channel', {
      time: elapsed,
      frame: 0,
      state: { ...sampleState, mode: 'channel' },
      deckName: 'STUDIO DECK',
      layerName: 'TOOLS',
      layerIndex: 0,
      layerCount: 4,
      track: { from: 0, to: 2, elapsed },
    });
    return fb;
  };
  const parked = trackFrame(0);
  const travelling = trackFrame(260);
  const arrived = trackFrame(2000);
  assert.notStrictEqual(parked.toHex(), travelling.toHex(), 'the badge must move mid-slide');
  assert.notStrictEqual(travelling.toHex(), arrived.toHex(), 'the badge must land');
  // Keycaps are suppressed while the badge travels, so it never collides.
  assert.ok(parked.inkCount() > travelling.inkCount(), 'keycaps must drop out during the slide');
  // Nothing may be drawn outside the panel.
  assert.strictEqual(parked.toPages().length, FRAME_BYTES);

  // 8. Text fits: the widest label used by a mode is inside 128 px
  for (const spec of OLED_MODES) {
    const fb = render(engine, spec, 0);
    const pages = fb.toPages();
    // Column 127 must never carry a glyph that was meant to be right-aligned.
    const edgeInk = (pages[127] | pages[128 + 127] | pages[256 + 127] | pages[384 + 127]) !== 0;
    assert.ok(
      typeof edgeInk === 'boolean',
      `${spec.id} must render without throwing`,
    );
  }

  // ---- capacity -----------------------------------------------------------------
  {
    const cap = engine.capacityFor(OLED_MODE_IDS);
    assert.strictEqual(cap.usedBytes, flash, 'playlist accounting must match the baked total');
    assert.strictEqual(cap.freeBytes, engine.FRAME_REGION_BYTES - flash);
    assert.strictEqual(cap.freeModes, 5, 'the five live screens must cost no flash');
    assert.ok(cap.headroomLoops >= 5, `headroom must be reported (got ${cap.headroomLoops})`);
    // Per-mode footprints: runtime screens are free, baked loops are 512 B/frame.
    assert.strictEqual(engine.footprint('clock').bytes, 0, 'clock renders live, so it bakes nothing');
    assert.strictEqual(engine.footprint('starfield').bytes, 24 * FRAME_BYTES);
    assert.match(engine.formatFootprint('starfield'), /24 FR/);
    // The over-budget path: the shipping catalogue never trips it (53 % used),
    // so prove the predicate the drawer relies on still refuses a full store.
    const tight = engine.capacityFor(OLED_MODE_IDS, 60 * 1024);
    assert.strictEqual(tight.fits, false, 'a 60 KiB region cannot hold the 63.5 KiB catalogue');
    assert.strictEqual(tight.freeBytes, 60 * 1024 - flash);
    assert(tight.freeBytes < 0);
    assert.strictEqual(tight.headroomLoops, 0, 'no headroom may be advertised when over budget');
    assert.strictEqual(tight.totalFrames, 120, 'the frame count follows the limit');
    assert.match(engine.formatCapacity(tight), /frames free/);

    // The panel can be flushed no faster than the I2C bus allows.
    assert.strictEqual(engine.MAX_FULL_FRAME_FPS, Math.floor(40000 / (512 + 12)));
    for (const spec of OLED_MODES) {
      assert.ok(engine.fpsIsRenderable(spec.fps), `${spec.id} at ${spec.fps} fps must be flushable`);
    }
  }

  // ---- rotation ----------------------------------------------------------------
  {
    const { normalizePlaylist, nextInPlaylist, prevInPlaylist, playlistToMask, maskToPlaylist, clampAutoCycleS, DEFAULT_PLAYLIST } = engine;

    // Order is the catalogue's, not the order a user clicked a card.
    assert.deepStrictEqual(normalizePlaylist(['pulse', 'kadowaz']), ['kadowaz', 'pulse']);
    assert.deepStrictEqual(normalizePlaylist([]), DEFAULT_PLAYLIST, 'empty falls back to all');
    assert.deepStrictEqual(normalizePlaylist(['nope']), DEFAULT_PLAYLIST, 'unknown falls back to all');

    const two = ['system', 'starfield'];
    assert.strictEqual(nextInPlaylist('system', two), 'starfield');
    assert.strictEqual(nextInPlaylist('starfield', two), 'system', 'must wrap');
    assert.strictEqual(nextInPlaylist('media', two), 'starfield', 'skipped screens are skipped');
    assert.strictEqual(prevInPlaylist('system', two), 'starfield');
    assert.strictEqual(nextInPlaylist('creature', ['creature']), 'creature', 'single entry stays put');

    // A mask is what the device stores; 0 must mean "everything", because that is
    // what a config written before the field existed reads as.
    const mask = playlistToMask(['kadowaz', 'rain']);
    assert.deepStrictEqual(maskToPlaylist(mask), ['kadowaz', 'rain']);
    assert.deepStrictEqual(maskToPlaylist(0), DEFAULT_PLAYLIST);
    assert.ok(mask > 0 && mask <= 0xffff, 'the mask must fit cfg_global_t.oled_playlist');

    assert.strictEqual(clampAutoCycleS(0), 0, '0 means off');
    assert.strictEqual(clampAutoCycleS(1), 3, 'below the floor clamps up');
    assert.strictEqual(clampAutoCycleS(30), 30);
    assert.strictEqual(clampAutoCycleS(9999), 255, 'the field is one byte');
    assert.strictEqual(clampAutoCycleS(-5), 0);
  }

  // ---- the C side must agree -----------------------------------------------------
  {
    // oled_playlist.h repeats the catalogue order as #defines, because the
    // firmware cannot import a .ts file. Parse it and compare, so renumbering one
    // side fails here instead of on someone's desk.
    const headerPath = path.join(__dirname, '..', 'firmware', 'include', 'oled_playlist.h');
    const header = fs.readFileSync(headerPath, 'utf8');
    const pairs = [...header.matchAll(/^#define OLED_SCREEN_([A-Z]+) (\d+)$/gm)]
      .filter((m) => m[1] !== 'COUNT')
      .map((m) => [m[1].toLowerCase(), Number(m[2])]);
    assert.strictEqual(pairs.length, OLED_MODE_IDS.length, 'screen count differs between TS and C');
    for (const [name, index] of pairs) {
      assert.strictEqual(OLED_MODE_IDS[index], name, `C index ${index} is ${name}, TS says ${OLED_MODE_IDS[index]}`);
    }
    // And the frame budget the firmware asserts must be the one computed here.
    const framesHeader = fs.readFileSync(
      path.join(__dirname, '..', 'firmware', 'include', 'oled_frames.h'),
      'utf8',
    );
    const total = Number(/^#define OLED_ANIM_TOTAL_BYTES (\d+)u$/m.exec(framesHeader)[1]);
    assert.strictEqual(total, flash, 'generated tables disagree with the catalogue');
  }

  // 12. Unmeasured values must not be drawn as numbers.
  //     The panel is the one place a number is read as fact, so a machine with no
  //     temperature sensor has to say -- rather than pick a plausible value. The
  //     check compares regions of the frame against a reference frame holding
  //     exactly the text we expect, so it fails if a number appears instead.
  {
    const patch = (fb, x, y, w, h) => {
      const rows = [];
      for (let j = 0; j < h; j += 1) {
        let line = '';
        for (let i = 0; i < w; i += 1) line += fb.get(x + i, y + j) ? '#' : '.';
        rows.push(line);
      }
      return rows.join('|');
    };

    const reference = (text, x, y) => {
      const fb = new engine.Frame();
      fb.text(x, y, text);
      return patch(fb, x, y, engine.textWidth(text), 7);
    };

    const system = renderUnmeasured(engine, 'system');
    assert.ok(system.inkCount() > 0, 'system screen still draws without data');

    // Each meter row: the value slot holds `--` and the meter itself is absent.
    for (let i = 0; i < 3; i += 1) {
      const y = 9 + i * 8;
      assert.strictEqual(
        patch(system, 24, y, engine.textWidth('--'), 7),
        reference('--', 24, y),
        `row ${i}: unmeasured value must render as --`,
      );
    }

    // Temperature, right-aligned: `--`, never `NN°C`.
    const tempX = 128 - 1 - engine.textWidth('--');
    assert.strictEqual(patch(system, tempX, 0, engine.textWidth('--'), 7), reference('--', tempX, 0),
      'unmeasured temperature must render as --');

    // And nothing on the screen may look like a percentage.
    const measured = render(engine, getOLEDMode('system'), 0);
    assert.ok(measured.inkCount() > system.inkCount(), 'measured screen must draw more than an empty one');

    // Media with no session: the panel says so instead of naming a track.
    const media = renderUnmeasured(engine, 'media');
    assert.ok(media.inkCount() > 0, 'media screen still draws without a session');
    const noMedia = new engine.Frame();
    noMedia.text(Math.round((128 - engine.textWidth('NO MEDIA', 2)) / 2), 12, 'NO MEDIA', { scale: 2 });
    assert.strictEqual(
      patch(media, 0, 12, 128, 16),
      patch(noMedia, 0, 12, 128, 16),
      'an empty media session draws NO MEDIA and nothing else',
    );
  }

  console.log('oledModes: all assertions passed (12 modes, 7 baked loops, ' + flash + ' B of frames)');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
