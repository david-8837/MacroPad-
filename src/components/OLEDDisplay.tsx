import React, { useEffect, useRef, useState } from 'react';
import { OLEDState } from '../types';
import { OLEDCanvas } from './OLEDCanvas';
import { TRACK_TIMING, TrackRun } from '../oled/modes';

interface OLEDDisplayProps {
  state: OLEDState;
  activeLayerName: string;
  deckName: string;
  /** 0-based index of the active layer. */
  channelIndex?: number;
  /** Total layers in the deck — one track stop per layer. */
  layerCount?: number;
}

/** How long the track stays up after the square lands. */
const STEPPER_HOLD_MS = 2000;

export const OLEDDisplay: React.FC<OLEDDisplayProps> = ({
  state,
  activeLayerName,
  deckName,
  channelIndex = 0,
  layerCount = 4,
}) => {
  /** The layer change currently travelling on the panel, if any. */
  const [track, setTrack] = useState<TrackRun | null>(null);
  const prevChannelRef = useRef<number>(channelIndex);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // A layer change paints the track, slides the square, holds, then hands the
  // panel back to whichever screen mode is selected.
  useEffect(() => {
    if (prevChannelRef.current === channelIndex) return;
    const from = prevChannelRef.current;
    prevChannelRef.current = channelIndex;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setTrack({ from, to: channelIndex, startedAt: performance.now() });

    const total = TRACK_TIMING.wakeMs + TRACK_TIMING.slideMs + STEPPER_HOLD_MS;
    timersRef.current.push(setTimeout(() => setTrack(null), total));

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [channelIndex]);

  const pinnedTrack: TrackRun | null =
    !track && state.mode === 'channel'
      ? { from: channelIndex, to: channelIndex, startedAt: 0 }
      : null;

  const brightnessVal = state.brightness !== undefined ? state.brightness / 100 : 1;
  const isInverted = Boolean(state.inverted);

  return (
    <div
      /* No click handler. The physical panel is a display with no touch layer,
         so a click here would teach an interaction the hardware cannot do; the
         screen changes on the rotation timer or on a bound OLED NEXT action. */
      role="img"
      aria-label={`OLED panel showing ${state.mode}`}
      style={{
        filter: `brightness(${brightnessVal}) ${isInverted ? 'invert(1)' : ''}`.trim(),
      }}
      className="oled-screen w-full h-[58px] flex items-center justify-center transition-colors select-none"
    >
      <OLEDCanvas
        mode={state.mode}
        state={state}
        deckName={deckName}
        layerName={activeLayerName}
        layerIndex={channelIndex}
        layerCount={Math.max(layerCount, channelIndex + 1)}
        track={track ?? pinnedTrack}
        title={`OLED 128×32 · ${state.mode}`}
      />
    </div>
  );
};
