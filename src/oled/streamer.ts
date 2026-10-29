/*
 * The physical OLED's runtime frame producer. Deliberately NOT the preview's
 * requestAnimationFrame: a hidden preview, scrolled-off drawer or closed canvas
 * does not itself stop the producer (a fully suspended browser may still throttle
 * timers, in which case the pad falls back locally). Same Frame/mode engine,
 * sends at most five complete canvases per second, and never queues old frames.
 * Firmware plays baked animations itself and falls back locally when these
 * volatile frames stop. No pixels are written to flash.
 */
import type { OLEDState } from '../types';
import { Frame } from './frame';
import { frameAt, getOLEDMode, renderPanel, type OLEDMode } from './modes';

export interface OledStreamSnapshot {
  state: OLEDState;
  deckName: string;
  layerName: string;
  layerIndex: number;
  layerCount: number;
}

export interface OledStreamScheduler {
  now(): number;
  schedule(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
}

const browserScheduler: OledStreamScheduler = {
  now: () => performance.now(),
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (timer) => clearTimeout(timer),
};

/** Returns a stop function; stopping prevents any future send, even when a
 * pending serial write finishes after the component disconnects/unmounts. */
export function startOledStreaming(
  snapshot: () => OledStreamSnapshot,
  send: (mode: OLEDMode, pages: Uint8Array) => Promise<boolean>,
  onError: (error: unknown) => void = () => {},
  scheduler: OledStreamScheduler = browserScheduler,
): () => void {
  const canvas = new Frame();
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastMode: OLEDMode | null = null;
  let modeStartedAt = scheduler.now();
  let failures = 0;

  const tick = async () => {
    if (!running) return;
    let delay = 200; // <= 5 fps over USB CDC, well below 400 kHz I2C saturation
    try {
      const ctx = snapshot();
      const mode = ctx.state.mode;
      const spec = getOLEDMode(mode);
      if (mode !== lastMode) {
        lastMode = mode;
        modeStartedAt = scheduler.now();
      }
      if (spec.runtime) {
        const elapsed = Math.max(0, scheduler.now() - modeStartedAt);
        renderPanel(canvas, mode, {
          time: elapsed,
          frame: frameAt(elapsed, spec.fps),
          state: ctx.state,
          deckName: ctx.deckName,
          layerName: ctx.layerName,
          layerIndex: ctx.layerIndex,
          layerCount: ctx.layerCount,
          track: null, // pad's local 1.4s layer overlay takes priority
        });
        const accepted = await send(mode, canvas.pages);
        if (accepted) failures = 0;
      }
    } catch (err) {
      failures++;
      if (failures === 1 || failures % 10 === 0) onError(err);
      delay = Math.min(5000, 500 * 2 ** Math.min(failures - 1, 4));
    } finally {
      if (running) timer = scheduler.schedule(() => { void tick(); }, delay);
    }
  };

  void tick();
  return () => {
    running = false;
    if (timer !== null) scheduler.cancel(timer);
  };
}
