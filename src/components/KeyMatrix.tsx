import React, { useState, useRef } from 'react';
import { KeyBinding } from '../types';
import { playKeyClick } from '../utils/soundEffects';
import * as LucideIcons from 'lucide-react';

interface KeyMatrixProps {
  keys: KeyBinding[];
  /**
   * Nine CSS colours from the lighting engine, index = key index. Rendered as a
   * flat 3 px bar along the bottom of each cap — the key's own light, not a glow,
   * so the chassis still reads as an ink slab.
   */
  ledColors?: string[];
  selectedKeyIndex: number | null;
  onSelectKey: (keyIndex: number) => void;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: any) => void;
}

export const KeyMatrix: React.FC<KeyMatrixProps> = ({
  keys,
  ledColors,
  selectedKeyIndex,
  onSelectKey,
  onTriggerAction,
}) => {
  const [activeDownKey, setActiveDownKey] = useState<number | null>(null);
  const [holdingKeyIndex, setHoldingKeyIndex] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = useRef<{ [keyIndex: number]: number }>({});
  const clickTimerRef = useRef<{ [keyIndex: number]: NodeJS.Timeout }>({});

  // Dynamic Lucide icon renderer
  const renderIcon = (iconName: string, className="w-5 h-5") => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Square;
    return <IconComponent className={className} />;
  };

  const handlePointerDown = (keyBinding: KeyBinding, e: React.PointerEvent) => {
    e.preventDefault();
    const idx = keyBinding.keyIndex;
    onSelectKey(idx);
    setActiveDownKey(idx);
    playKeyClick('down');

    // Long-Press Safety Isolation
    if (keyBinding.isDestructiveSafety && keyBinding.safetyConfirmAction) {
      setHoldingKeyIndex(idx);
      setHoldProgress(0);
      const threshold = keyBinding.longPressThresholdMs || 1500;
      const startTime = Date.now();

      holdIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / threshold) * 100);
        setHoldProgress(progress);
      }, 25);

      holdTimerRef.current = setTimeout(() => {
        // Sustained hold completed!
        playKeyClick('heavy');
        setHoldProgress(100);
        if (keyBinding.safetyConfirmAction) {
          onTriggerAction(
            keyBinding.safetyConfirmAction.id,
            `[SAFETY UNLOCKED] ${keyBinding.safetyConfirmAction.name}`,
            keyBinding.safetyConfirmAction.category,
            keyBinding.safetyConfirmAction.payload
          );
        }
        clearInterval(holdIntervalRef.current!);
      }, threshold);
      return;
    }

    // Mod-Tap check (hold for alternate action)
    if (keyBinding.holdAction) {
      holdTimerRef.current = setTimeout(() => {
        playKeyClick('heavy');
        if (keyBinding.holdAction) {
          onTriggerAction(
            keyBinding.holdAction.id,
            `[HOLD] ${keyBinding.holdAction.name}`,
            keyBinding.holdAction.category,
            keyBinding.holdAction.payload
          );
        }
      }, 250);
    }
  };

  const handlePointerUp = (keyBinding: KeyBinding) => {
    const idx = keyBinding.keyIndex;
    setActiveDownKey(null);
    playKeyClick('up');

    // Clear hold timers
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }

    // If it was a safety hold that was released prematurely
    if (holdingKeyIndex === idx) {
      if (holdProgress < 100) {
        onTriggerAction('safety-aborted', 'Hold cancelled (Threshold not met)', 'info');
      }
      setHoldingKeyIndex(null);
      setHoldProgress(0);
      return;
    }

    // Tap Dance logic (single vs double tap)
    clickCountRef.current[idx] = (clickCountRef.current[idx] || 0) + 1;
    if (clickCountRef.current[idx] === 1) {
      clickTimerRef.current[idx] = setTimeout(() => {
        // Single tap resolved
        if (keyBinding.tapAction) {
          onTriggerAction(
            keyBinding.tapAction.id,
            keyBinding.tapAction.name,
            keyBinding.tapAction.category,
            keyBinding.tapAction.payload
          );
        }
        clickCountRef.current[idx] = 0;
      }, 220);
    } else if (clickCountRef.current[idx] === 2) {
      // Double tap resolved!
      clearTimeout(clickTimerRef.current[idx]);
      clickCountRef.current[idx] = 0;
      if (keyBinding.doubleTapAction) {
        onTriggerAction(
          keyBinding.doubleTapAction.id,
          `[DOUBLE TAP] ${keyBinding.doubleTapAction.name}`,
          keyBinding.doubleTapAction.category,
          keyBinding.doubleTapAction.payload
        );
      } else if (keyBinding.tapAction) {
        // Fallback to tap action if no double-tap assigned
        onTriggerAction(
          keyBinding.tapAction.id,
          keyBinding.tapAction.name,
          keyBinding.tapAction.category,
          keyBinding.tapAction.payload
        );
      }
    }
  };

  return (
    <div className="relative">
      {/* key field: cream caps on the ink chassis, 1px rules, no glow */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => {
          const isSelected = selectedKeyIndex === k.keyIndex;
          const isDown = activeDownKey === k.keyIndex;
          const isSafety = k.isDestructiveSafety;
          const isHoldingThis = holdingKeyIndex === k.keyIndex;

          return (
            <div
              key={k.keyIndex}
              className="relative"
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(k, e)}
                onPointerUp={() => handlePointerUp(k)}
                onPointerLeave={() => {
                  if (activeDownKey === k.keyIndex) handlePointerUp(k);
                }}
                aria-pressed={isSelected}
                className={`macropad-key w-full h-[76px] flex flex-col items-center justify-between p-1.5 select-none relative cursor-pointer overflow-hidden ${
                  isDown
                    ? 'active-down bg-[#141414] border-[#141414] text-[#E3E2DE]'
                    : isSelected
                    ? 'bg-[#FFFFFF] border-[2px] border-[#1351AA]'
                    : 'bg-[#E3E2DE] border border-[#E3E2DE] hover:bg-[#FFFFFF]'
                }`}
              >
                {/* the cap's LED: a flat bar, never a shadow or a gradient */}
                <span
                  className="absolute left-0 right-0 bottom-0 h-[3px] z-20"
                  style={{ backgroundColor: ledColors?.[k.keyIndex] ?? 'transparent' }}
                />

                {/* hold-to-confirm fill: flat ink bar, no radial glow */}
                {isHoldingThis && (
                  <span
                    className="absolute inset-x-0 bottom-0 bg-[#1351AA] pointer-events-none"
                    style={{ height: `${holdProgress}%`, opacity: 0.85 }}
                  />
                )}

                <span className="w-full flex items-center justify-between relative z-10">
                  <span
                    className={`font-mono text-[9px] tracking-[0.06em] ${
                      isDown ? 'text-[#C7C7C7]' : isSelected ? 'text-[#1351AA] font-bold' : 'text-[#646464]'
                    }`}
                  >
                    {`0${k.keyIndex + 1}`}
                  </span>
                  {isSafety && (
                    <span
                      className={`font-mono text-[7px] font-bold tracking-[0.1em] px-[3px] py-[1px] border ${
                        isDown
                          ? 'border-[#E3E2DE] text-[#E3E2DE]'
                          : 'border-[#141414] text-[#141414]'
                      }`}
                    >
                      HOLD
                    </span>
                  )}
                </span>

                <span
                  className={`relative z-10 my-auto flex items-center justify-center ${
                    isDown ? 'text-[#E3E2DE]' : isSelected ? 'text-[#1351AA]' : 'text-[#141414]'
                  }`}
                >
                  {k.iconName && renderIcon(k.iconName, 'w-5 h-5')}
                </span>

                <span className="w-full text-center relative z-10 leading-none">
                  <span
                    className={`block text-[9.5px] font-semibold truncate ${
                      isDown ? 'text-[#E3E2DE]' : isSelected ? 'text-[#1351AA]' : 'text-[#141414]'
                    }`}
                  >
                    {k.label}
                  </span>
                  {k.sublabel && (
                    <span
                      className={`block font-mono text-[7.5px] truncate mt-[2px] ${
                        isDown ? 'text-[#C7C7C7]' : 'text-[#646464]'
                      }`}
                    >
                      {k.sublabel}
                    </span>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
