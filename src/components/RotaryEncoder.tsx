import React, { useState, useRef, useEffect } from 'react';
import { DialBinding } from '../types';
import { playDetentClick, playKeyClick } from '../utils/soundEffects';
import { RotateCw, RotateCcw } from 'lucide-react';

interface RotaryEncoderProps {
  dial: DialBinding;
  channelIndex?: number;
  onTriggerAction: (actionId: string, actionName: string, category: string) => void;
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
  const [isPressed, setIsPressed] = useState(false);
  const [velocityMultiplier, setVelocityMultiplier] = useState(1);
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

  // Derive active channel (0, 1, or 2)
  const channels = [
    dial.availableModes[0] || 'CH 1: Master Volume',
    dial.availableModes[1] || 'CH 2: Timeline Scrub',
    dial.availableModes[2] || 'CH 3: Focused App Audio',
  ];
  
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

    setVelocityMultiplier(mult);
    playDetentClick(direction);

    if (direction === 'cw') {
      setRotationAngle(prev => prev + 15);
      onTriggerAction(dial.cwAction.id, `${dial.cwAction.name} [CH ${currentChannelIdx + 1}] (${mult}x)`, dial.cwAction.category);
    } else {
      setRotationAngle(prev => prev - 15);
      onTriggerAction(dial.ccwAction.id, `${dial.ccwAction.name} [CH ${currentChannelIdx + 1}] (${mult}x)`, dial.ccwAction.category);
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
    setIsPressed(true);
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
        // Threshold reached -> SWITCH CHANNEL via HOLD
        didTriggerHoldRef.current = true;
        setIsHolding(false);
        setHoldProgress(100);
        setHoldSuccess(true);
        playDetentClick('cw');

        // Hold is strictly reserved for cycling through the 3 channels (CH 1 -> CH 2 -> CH 3)
        const nextChannel = (currentChannelIdx + 1) % 3;
        onCycleMode(nextChannel);

        setTimeout(() => {
          setHoldSuccess(false);
          setIsPressed(false);
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
    setIsPressed(false);

    if (wasHolding && !didTriggerHoldRef.current) {
      // Released before hold duration -> Trigger TAP action!
      playKeyClick('up');
      onTriggerAction(
        dial.pressAction.id,
        `${dial.pressAction.name} [CH ${currentChannelIdx + 1}]`,
        dial.pressAction.category
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
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#00F0FF] text-black text-[8px] font-mono font-black shadow-[0_0_12px_#00F0FF] whitespace-nowrap z-30 flex items-center gap-1 animate-pulse pointer-events-none">
            <span>HOLD TO SWITCH CH... {Math.round(holdProgress)}%</span>
          </div>
        )}

        {/* Floating Channel Switched Toast */}
        {holdSuccess && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#38EF7D] text-black text-[8.5px] font-mono font-black shadow-[0_0_14px_#38EF7D] whitespace-nowrap z-30 pointer-events-none">
            ★ SWITCHED TO CH {((currentChannelIdx + 1) % 3) + 1}!
          </div>
        )}

        {/* Outer Knurled Bezel */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          title={`Scroll or Drag to rotate.\n• Tap switch: ${dial.pressAction.name}\n• Hold (${holdThresholdMs}ms): Switch Channel`}
          className={`w-[60px] h-[60px] rounded-full p-[3px] bg-gradient-to-b from-[#7e8594] via-[#414652] to-[#252830] shadow-knob cursor-grab active:cursor-grabbing transition-transform ${
            isPressed ? 'scale-95' : 'hover:scale-[1.03]'
          }`}
        >
          {/* Rotating Cap */}
          <div
            className="w-full h-full rounded-full knob-metal relative flex items-center justify-center shadow-inner border border-white/20"
            style={{ transform: `rotate(${rotationAngle}deg)` }}
          >
            {/* Visual Detent Notch */}
            <div className="absolute top-1 w-1.5 h-3 bg-[#FF5E00] rounded-full shadow-[0_0_6px_#FF5E00]" />
            
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
                    stroke="rgba(0, 240, 255, 0.2)"
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
                    stroke="#00F0FF"
                    strokeWidth="3"
                    strokeDasharray="94.25"
                    strokeDashoffset={94.25 - (94.25 * holdProgress) / 100}
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_6px_#00F0FF]"
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
                title={`Tap: ${dial.pressAction.name} | Hold ${holdThresholdMs}ms: Switch Channel`}
                className={`w-7 h-7 rounded-full bg-gradient-to-b from-[#2b2f38] to-[#15171c] border flex items-center justify-center text-[7.5px] font-mono font-bold transition-all shadow-md z-20 ${
                  isHolding
                    ? 'border-[#00F0FF] text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.6)] scale-90'
                    : 'border-white/20 text-white/80 hover:text-white hover:border-[#FF5E00]/60 active:scale-90'
                }`}
              >
                CH {currentChannelIdx + 1}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stepper Buttons on side */}
        <div className="absolute -left-5 flex flex-col gap-1">
          <button
            onClick={() => stepDetent('ccw')}
            title="Step Counter-Clockwise"
            className="w-4 h-4 rounded bg-[#1A1D24] border border-white/10 hover:border-[#FF5E00] text-white/70 hover:text-[#FF5E00] flex items-center justify-center text-[8px] transition-colors"
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="absolute -right-5 flex flex-col gap-1">
          <button
            onClick={() => stepDetent('cw')}
            title="Step Clockwise"
            className="w-4 h-4 rounded bg-[#1A1D24] border border-white/10 hover:border-[#FF5E00] text-white/70 hover:text-[#FF5E00] flex items-center justify-center text-[8px] transition-colors"
          >
            <RotateCw className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
