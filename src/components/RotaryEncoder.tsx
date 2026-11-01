import React, { useState, useRef, useEffect } from 'react';
import { DialBinding, ActionDefinition } from '../types';
import { playDetentClick, playKeyClick } from '../utils/soundEffects';
import { RotateCw, RotateCcw } from 'lucide-react';
import { DIAL_MODES } from '../utils/channelLayers';

interface RotaryEncoderProps {
  dial: DialBinding;
  channelIndex?: number;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: ActionDefinition['payload']) => void;
  onCycleMode: (channelIndex?: number) => void;
}

export const RotaryEncoder: React.FC<RotaryEncoderProps> = ({
  dial,
  channelIndex,
  onTriggerAction,
  onCycleMode,
}) => {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastDetentAngle = useRef(0);
  const lastTurnTime = useRef(Date.now());
  const dragStartY = useRef(0);
  const startAngle = useRef(0);

  // Hold Mechanics State
  const holdThresholdMs = dial.channelHoldThresholdMs || 800;
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdSuccess, setHoldSuccess] = useState(false);
  const holdStartTimeRef = useRef(0);
  const didTriggerHoldRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  /* One dial mode per layer — four of them, numbered from zero. The list comes
   * from the deck so a renamed mode shows here too. */
  const channels = dial.availableModes?.length ? [...dial.availableModes] : [...DIAL_MODES];
  const [switchedTo, setSwitchedTo] = useState<number | null>(null);

  
  let currentChannelIdx = channelIndex !== undefined
    ? channelIndex
    : channels.findIndex(m => m === dial.activeModeName);
  if (currentChannelIdx === -1) currentChannelIdx = 0;

  // Trigger CW or CCW step
  const stepDetent = (direction: 'cw' | 'ccw') => {
    const now = Date.now();
    const dt = Math.max(16, now - lastTurnTime.current);
    lastTurnTime.current = now;

    let mult = 1;
    if (dial.accelerationCurve === 'exponential') {
      mult = dt < 50 ? 8 : dt < 100 ? 4 : dt < 180 ? 2 : 1;
    } else if (dial.accelerationCurve === 'precision_nudge') {
      mult = 1;
    } else {
      mult = dt < 80 ? 2 : 1;
    }

    playDetentClick(direction);

    if (direction === 'cw') {
      setRotationAngle(prev => prev + 15);
      onTriggerAction(dial.cwAction.id, `${dial.cwAction.name} [CH ${currentChannelIdx}] (${mult}x)`, dial.cwAction.category, dial.cwAction.payload);
    } else {
      setRotationAngle(prev => prev - 15);
      onTriggerAction(dial.ccwAction.id, `${dial.ccwAction.name} [CH ${currentChannelIdx}] (${mult}x)`, dial.ccwAction.category, dial.ccwAction.payload);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      stepDetent('cw');
    } else {
      stepDetent('ccw');
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartY.current = e.clientY;
    startAngle.current = rotationAngle;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.clientY;
      const newAngle = startAngle.current + deltaY * 2.5;
      
      if (Math.abs(newAngle - lastDetentAngle.current) >= 15) {
        const dir = newAngle > lastDetentAngle.current ? 'cw' : 'ccw';
        lastDetentAngle.current = newAngle;
        stepDetent(dir);
      }
      setRotationAngle(newAngle);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Clean up any running hold animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // HOLD & TAP HANDLERS FOR KNOB SWITCH
  const handleHoldStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsHolding(true);
    setHoldProgress(0);
    setHoldSuccess(false);
    didTriggerHoldRef.current = false;
    holdStartTimeRef.current = Date.now();
    playKeyClick('down');

    const checkProgress = () => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, (elapsed / holdThresholdMs) * 100);
      setHoldProgress(progress);

      if (elapsed >= holdThresholdMs) {
        // Simulator threshold reached -> preview next layer, not a pad command.
        didTriggerHoldRef.current = true;
        setIsHolding(false);
        setHoldProgress(100);
        setHoldSuccess(true);
        playDetentClick('cw');

        // Simulated hold cycles the editor preview (0 → 1 → 2 → 3).
        // On a real pad, only a physical hold switches its channel.
        const nextChannel = (currentChannelIdx + 1) % channels.length;
        setSwitchedTo(nextChannel);
        onCycleMode(nextChannel);

        setTimeout(() => {
          setHoldSuccess(false);
        }, 350);
        return;
      }

      animFrameRef.current = requestAnimationFrame(checkProgress);
    };

    animFrameRef.current = requestAnimationFrame(checkProgress);
  };

  const handleHoldEnd = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const wasHolding = isHolding;
    setIsHolding(false);
    setHoldProgress(0);

    if (wasHolding && !didTriggerHoldRef.current) {
      // Released before hold duration -> Trigger TAP action!
      playKeyClick('up');
      onTriggerAction(
        dial.pressAction.id,
        `${dial.pressAction.name} [CH ${currentChannelIdx}]`,
        dial.pressAction.category,
        dial.pressAction.payload
      );
    }

    didTriggerHoldRef.current = false;
  };

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Knob Container */}
      <div className="relative flex items-center justify-center">
        {/* Floating Hold Progress Banner */}
        {isHolding && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#1351AA] text-[#E3E2DE] text-[8px] font-mono font-bold tracking-[0.1em] uppercase whitespace-nowrap z-30 flex items-center gap-1 pointer-events-none">
            <span>HOLD TO PREVIEW... {Math.round(holdProgress)}%</span>
          </div>
        )}

        {/* Floating Channel Switched Toast */}
        {holdSuccess && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-[#1351AA] text-[#E3E2DE] text-[8.5px] font-mono font-black whitespace-nowrap z-30 pointer-events-none">
            ★ PREVIEWING LAYER {switchedTo ?? currentChannelIdx}
          </div>
        )}

        {/* Outer Knurled Bezel */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          title={`Scroll or Drag to rotate.\n• Tap switch: ${dial.pressAction.name}\n• Simulator hold (${holdThresholdMs}ms): preview next layer; physical knob hold switches pad`}
          className="w-[58px] h-[58px] p-0 bg-[#E3E2DE] border border-[#E3E2DE] cursor-grab active:cursor-grabbing transition-transform duration-300"
        >
          {/* Rotating Cap */}
          <div
            className="w-full h-full knob-metal relative flex items-center justify-center"
            style={{ transform: `rotate(${rotationAngle}deg)` }}
          >
            {/* Visual Detent Notch */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-[2px] h-2.5 bg-[#E3E2DE]" />
            
            {/* Center Push Switch with Hold Progress Ring */}
            <div className="relative w-7 h-7 flex items-center justify-center">
              {/* Animated Circular Hold Arc */}
              <svg
                className="absolute -inset-1 w-9 h-9 -rotate-90 pointer-events-none z-10"
                viewBox="0 0 36 36"
              >
                {/* Background track when holding */}
                {isHolding && (
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="rgba(19, 81, 170, 0.2)"
                    strokeWidth="3"
                  />
                )}
                {/* Progress arc */}
                {isHolding && (
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#1351AA"
                    strokeWidth="3"
                    strokeDasharray="94.25"
                    strokeDashoffset={94.25 - (94.25 * holdProgress) / 100}
                    strokeLinecap="butt"
                    className=""
                  />
                )}
              </svg>

              <button
                type="button"
                onMouseDown={handleHoldStart}
                onMouseUp={handleHoldEnd}
                onMouseLeave={handleHoldEnd}
                onTouchStart={handleHoldStart}
                onTouchEnd={handleHoldEnd}
                title={`Tap: ${dial.pressAction.name} | Simulator hold ${holdThresholdMs}ms: edit/preview next layer only`}
                className={`w-7 h-7 flex items-center justify-center font-mono text-[8px] font-bold tracking-[0.06em] transition-colors z-20 ${
 isHolding
 ? 'bg-[#1351AA] text-[#E3E2DE]'
 : 'bg-[#E3E2DE] text-[#141414] hover:bg-[#1351AA] hover:text-[#E3E2DE]'
 }`}
              >
                L{currentChannelIdx}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stepper Buttons on side */}
        <div className="absolute -left-5 flex flex-col gap-1">
          <button
            onClick={() => stepDetent('ccw')}
            title="Step Counter-Clockwise"
            className="w-4 h-4 bg-[#E3E2DE] border border-[#E3E2DE] hover:bg-[#1351AA] hover:text-[#E3E2DE] text-[#444343] flex items-center justify-center transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="absolute -right-5 flex flex-col gap-1">
          <button
            onClick={() => stepDetent('cw')}
            title="Step Clockwise"
            className="w-4 h-4 bg-[#E3E2DE] border border-[#E3E2DE] hover:bg-[#1351AA] hover:text-[#E3E2DE] text-[#444343] flex items-center justify-center transition-colors"
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
