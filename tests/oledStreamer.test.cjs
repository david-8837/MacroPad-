// The physical runtime producer is a timer, NOT the preview canvas's RAF.
// A fake monotonic clock tests the five-Hz cap, live snapshots, baked autonomy,
// backoff and cancellation without ever mounting a React component.
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function load() {
  const tmp = mkdtempSync(join(tmpdir(), 'oled-streamer-'));
  try {
    const outfile = join(tmp, 'entry.mjs');
    await build({ entryPoints: [join(__dirname, '..', 'src/oled/streamer.ts')],
      bundle: true, platform: 'neutral', format: 'esm', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function fakeClock() {
  let now = 0;
  let serial = 0;
  const jobs = new Map();
  const scheduler = {
    now: () => now,
    schedule(fn, ms) {
      assert.ok(ms >= 200, 'never schedule more than five frames per second');
      const id = ++serial;
      jobs.set(id, { at: now + ms, fn, ms });
      return id;
    },
    cancel(id) { jobs.delete(id); },
  };
  async function flush() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }
  async function advance(ms) {
    const target = now + ms;
    await flush();
    for (;;) {
      const due = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!due || due[1].at > target) break;
      jobs.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await flush();
    }
    now = target;
  }
  return { scheduler, jobs, flush, advance };
}

const state = {
  mode: 'system', cpuLoad: 20, gpuLoad: 30, ramUsage: 40, cpuTemp: 35,
  nowPlayingTrack: null, nowPlayingArtist: null, isPlaying: false, trackProgress: null,
};
const current = () => ({ state, deckName: 'DESK', layerName: 'EDIT', layerIndex: 1, layerCount: 4 });

async function main() {
  const { startOledStreaming } = await load();
  const clock = fakeClock();
  const sent = [];
  // Running with no document and no requestAnimationFrame is intentional.
  const stop = startOledStreaming(current, async (mode, pages) => {
    sent.push({ mode, pages: Uint8Array.from(pages) });
    return true;
  }, () => assert.fail('unexpected stream error'), clock.scheduler);
  await clock.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].mode, 'system');
  assert.equal(sent[0].pages.length, 512);
  assert.ok(sent[0].pages.some(Boolean), 'real runtime renderer drew pixels');
  await clock.advance(199);
  assert.equal(sent.length, 1, 'not faster than five Hz');
  state.cpuLoad = 86;
  await clock.advance(1);
  assert.equal(sent.length, 2);
  assert.notDeepEqual(sent[0].pages, sent[1].pages, 'fresh metrics, not a captured old snapshot');
  state.mode = 'loader';
  await clock.advance(400);
  assert.equal(sent.length, 2, 'baked frames must stay autonomous on the pad');
  state.mode = 'media';
  state.nowPlayingTrack = 'REAL SESSION';
  await clock.advance(200);
  assert.equal(sent.length, 3);
  assert.equal(sent[2].mode, 'media');
  stop();
  await clock.advance(1000);
  assert.equal(sent.length, 3, 'stop cancels the next frame');

  // Never replace the pad's actual layer with an editor-only selection.
  const layerClock = fakeClock();
  let physicalLayer = null;
  const layerState = { ...state, mode: 'channel' };
  const layerFrames = [];
  const stopLayer = startOledStreaming(() => ({ state: layerState, deckName:'DESK', layerName:'', layerIndex:physicalLayer, layerCount:4 }), async (mode, pages) => {
    layerFrames.push({mode, pages:Uint8Array.from(pages)}); return true;
  }, () => assert.fail('unexpected layer stream error'), layerClock.scheduler);
  await layerClock.flush();
  assert.equal(layerFrames.length, 0, 'unknown physical layer uses the firmware fallback');
  layerState.mode = 'kadowaz'; await layerClock.advance(200);
  assert.equal(layerFrames.length, 0, 'deck status also waits for a physical layer report');
  physicalLayer = 3; await layerClock.advance(200);
  assert.equal(layerFrames.length, 1, 'reported physical layer can be streamed');
  const firstLayerFrame = layerFrames[0].pages;
  physicalLayer = 1; await layerClock.advance(200);
  assert.notDeepEqual(layerFrames[1].pages, firstLayerFrame, 'fresh reported layer changes the frame');
  physicalLayer = null; await layerClock.advance(200);
  assert.equal(layerFrames.length, 2, 'stream stops again if layer becomes unknown');
  layerState.mode = 'system'; await layerClock.advance(200);
  assert.equal(layerFrames.length, 3, 'unrelated live data does not need a layer report');
  stopLayer();

  const retryClock = fakeClock();
  let calls = 0;
  const errors = [];
  const halt = startOledStreaming(current, async () => {
    calls++;
    if (calls === 1) throw new Error('USB unplugged');
    return calls !== 2; // skip one busy frame without treating it as an error
  }, (err) => errors.push(err.message), retryClock.scheduler);
  await retryClock.flush();
  assert.deepEqual(errors, ['USB unplugged']);
  assert.equal([...retryClock.jobs.values()][0].ms, 500);
  await retryClock.advance(500);
  assert.equal(calls, 2);
  assert.equal([...retryClock.jobs.values()][0].ms, 200);
  await retryClock.advance(200);
  assert.equal(calls, 3);
  halt();

  const pendingClock = fakeClock();
  let release;
  let count = 0;
  const stopPending = startOledStreaming(current, () => {
    count++;
    return new Promise(resolve => { release = resolve; });
  }, () => {}, pendingClock.scheduler);
  await pendingClock.advance(1000);
  assert.equal(count, 1, 'an unresolved USB write cannot start overlapping frames');
  stopPending();
  release(true);
  await pendingClock.flush();
  await pendingClock.advance(1000);
  assert.equal(count, 1, 'an in-flight write cannot restart a stopped stream');
  console.log('OLED timer streamer: snapshots, baked autonomy, backoff, no overlap and cancellation passed');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
