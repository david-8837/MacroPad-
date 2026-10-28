/*
 * useLedFrame.ts — the animated 9-pixel preview, driven by the real engine.
 *
 * One rule: the colours shown here come from `computeFrame()`, the same function
 * the parity test checks against the firmware, fed by the same config object that
 * gets pushed to the device. Nothing is faked per-mode for looks; if an animation
 * looks wrong here it will look wrong on the pad.
 */
import { useEffect, useRef, useState } from 'react';
import { computeFrame, createEngine, frameToHex, LED_COUNT } from './engine';
import { getChannel, subscribe } from './store';

const FRAME_MS = 33; /* ~30 fps: fast enough for the flares, cheap for the DOM */

export interface LedPreview {
  /** 9 CSS colours, index = key index, in pad order. */
  hex: string[];
  /** Simulate a key hit so REACTIVE can be seen without the pad. */
  hit: (keyIndex: number) => void;
}

export function useLedFrame(channel: number): LedPreview {
  const [hex, setHex] = useState<string[]>(() => new Array<string>(LED_COUNT).fill('#000000'));
  const engineRef = useRef(createEngine());
  const hitRef = useRef(0);
  const channelRef = useRef(channel);
  channelRef.current = channel;

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const started = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      const cfg = getChannel(channelRef.current);
      const frame = computeFrame(engineRef.current, cfg, {
        keyDownMask: hitRef.current,
        keyHitMask: hitRef.current,
        channel: channelRef.current,
        nowMs: Math.round(now - started),
        masterBrightness: 255,
        idleOverride: 255,
      });
      /* Only re-render when the colours actually changed: the twin is on the same
       * page as everything else and a static mode should cost nothing. */
      const next = frameToHex(frame);
      setHex((prev) => (prev.every((v, i) => v === next[i]) ? prev : next));
    };
    raf = requestAnimationFrame(tick);

    const unsubscribe = subscribe(() => {
      /* Config changed: recompute on the next frame with a fresh decay state so a
       * mode switch does not inherit the previous mode's flare levels. */
      engineRef.current = createEngine();
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, []);

  const hit = (keyIndex: number) => {
    hitRef.current |= 1 << keyIndex;
    window.setTimeout(() => {
      hitRef.current &= ~(1 << keyIndex);
    }, 90);
  };

  return { hex, hit };
}
