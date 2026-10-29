import React, { useEffect, useRef } from 'react';
import type { OLEDState } from '../types';
import { Frame, PANEL_H, PANEL_W } from '../oled/frame';
import { RenderContext, OLEDMode, TrackRun, frameAt, getOLEDMode, renderPanel } from '../oled/modes';

interface OLEDCanvasProps {
  mode: OLEDMode;
  state: OLEDState;
  deckName: string;
  layerName: string;
  layerIndex: number;
  layerCount: number;
  /** Layer-change animation, if one is running. */
  track?: TrackRun | null;
  className?: string;
  /** Stop the render loop (e.g. while the drawer is closed). */
  paused?: boolean;
  title?: string;
}

/** The panel runs at 30 fps while a layer change is travelling. */
const TRACK_FPS = 30;

/**
 * A 128×32 1-bit preview in SSD1306 page order. The baked animations are
 * generated from this renderer and match the firmware. A separate timer streams
 * runtime frames from the same renderer to a verified physical OLED; this RAF
 * is preview-only and may pause when the drawer is closed or the tab is hidden.
 * Without USB data, firmware draws its truthful offline fallback.
 */
export const OLEDCanvas: React.FC<OLEDCanvasProps> = ({
  mode,
  state,
  deckName,
  layerName,
  layerIndex,
  layerCount,
  track = null,
  className = '',
  paused = false,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<Frame>(new Frame());
  const imageRef = useRef<ImageData | null>(null);
  const startedAtRef = useRef<number>(0);
  const visibleRef = useRef(true);

  // Everything the loop reads, kept in a ref so a prop change never restarts it.
  const ctxRef = useRef({ mode, state, deckName, layerName, layerIndex, layerCount, track, paused });
  ctxRef.current = { mode, state, deckName, layerName, layerIndex, layerCount, track, paused };

  // A new mode or layer change restarts the animation clock so loops begin clean.
  useEffect(() => {
    startedAtRef.current = performance.now();
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    if (!imageRef.current) imageRef.current = g.createImageData(PANEL_W, PANEL_H);
    if (!startedAtRef.current) startedAtRef.current = performance.now();

    let raf = 0;
    let lastDrawn = -1;
    let lastEpoch = -1;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const current = ctxRef.current;
      if (current.paused || !visibleRef.current || document.visibilityState === 'hidden') return;

      // A layer change runs at its own frame rate; the mode's loop stays put.
      const epoch = current.track ? current.track.startedAt : startedAtRef.current;
      if (epoch !== lastEpoch) {
        lastEpoch = epoch;
        startedAtRef.current = epoch;
      }
      const elapsed = now - epoch;
      const spec = getOLEDMode(current.mode);
      const fps = current.track ? TRACK_FPS : spec.fps;
      const frame = frameAt(elapsed, fps);
      if (frame === lastDrawn) return;
      lastDrawn = frame;

      const fb = frameRef.current;
      const renderCtx: RenderContext = {
        time: elapsed,
        frame,
        state: current.state,
        deckName: current.deckName,
        layerName: current.layerName,
        layerIndex: current.layerIndex,
        layerCount: current.layerCount,
        track: current.track
          ? { from: current.track.from, to: current.track.to, elapsed }
          : null,
      };
      renderPanel(fb, current.mode, renderCtx);

      const img = imageRef.current;
      if (img) {
        fb.writeRGBA(img.data);
        g.putImageData(img, 0, 0);
      }
    };

    raf = requestAnimationFrame(draw);

    // Do not animate panels that are scrolled out of view.
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        visibleRef.current = entries.some((e) => e.isIntersecting);
      });
      observer.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={PANEL_W}
      height={PANEL_H}
      title={title}
      aria-label={title}
      className={`oled-canvas block w-full h-full ${className}`}
    />
  );
};
