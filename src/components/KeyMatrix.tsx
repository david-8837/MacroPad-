import React, { useState, useRef } from 'react';
import { KeyBinding } from '../types';
import { playKeyClick } from '../utils/soundEffects';
import * as LucideIcons from 'lucide-react';

interface KeyMatrixProps {
  keys: KeyBinding[];
  selectedKeyIndex: number | null;
  onSelectKey: (keyIndex: number) => void;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: any) => void;
}

export const KeyMatrix: React.FC<KeyMatrixProps> = ({
  keys,
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
  const renderIcon = (iconName: string, className = "w-5 h-5") => {
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
            keyBinding.safetyConfirmAction.category
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
            keyBinding.holdAction.category
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
        onTriggerAction('safety-aborted', 'Hold cancelled (Threshold not met)', 'hotkey');
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
    <div className="relative p-2 rounded-lg bg-[#0F1217] border border-[#212733] shadow-inner">
      {/* 4 Decorative Corner Screws matching physical hardware CAD */}
      <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-[#D4AF37] border border-[#8C6D1F] flex items-center justify-center opacity-80 shadow-xs">
        <div className="w-1 h-[0.5px] bg-[#423207]" />
      </div>
      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#D4AF37] border border-[#8C6D1F] flex items-center justify-center opacity-80 shadow-xs">
        <div className="w-1 h-[0.5px] bg-[#423207]" />
      </div>
      <div className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-[#D4AF37] border border-[#8C6D1F] flex items-center justify-center opacity-80 shadow-xs">
        <div className="w-1 h-[0.5px] bg-[#423207]" />
      </div>
      <div className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-[#D4AF37] border border-[#8C6D1F] flex items-center justify-center opacity-80 shadow-xs">
        <div className="w-1 h-[0.5px] bg-[#423207]" />
      </div>

      {/* 3x3 Key Matrix Grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {keys.map((k) => {
          const isSelected = selectedKeyIndex === k.keyIndex;
          const isDown = activeDownKey === k.keyIndex;
          const isSafety = k.isDestructiveSafety;
          const isHoldingThis = holdingKeyIndex === k.keyIndex;

          return (
            <div
              key={k.keyIndex}
              className={`relative rounded-xl transition-all duration-150 ${
                isSelected
                  ? 'p-[2px] bg-gradient-to-b from-[#FF8A2A] via-[#FF5E00] to-[#E65100] shadow-[0_0_20px_rgba(255,94,0,0.85)] z-20 scale-[1.03]'
                  : 'p-[1px] bg-transparent'
              }`}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Mechanical Switch Body */}
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(k, e)}
                onPointerUp={() => handlePointerUp(k)}
                onPointerLeave={() => {
                  if (activeDownKey === k.keyIndex) {
                    handlePointerUp(k);
                  }
                }}
                className={`macropad-key w-[74px] h-[74px] rounded-lg flex flex-col items-center justify-between p-2 select-none relative overflow-hidden transition-all duration-75 cursor-pointer ${
                  isDown ? 'active-down scale-95' : 'shadow-key-raised'
                } ${
                  isSelected
                    ? 'border-2 border-[#FF9100] shadow-[inset_0_0_15px_rgba(255,94,0,0.35)]'
                    : 'border border-[#2D3546] hover:border-white/30'
                } ${
                  isSafety
                    ? 'bg-gradient-to-b from-[#251518] to-[#160B0E]'
                    : isSelected
                    ? 'bg-gradient-to-b from-[#2C3345] via-[#202636] to-[#151924]'
                    : 'bg-gradient-to-b from-[#242A38] via-[#1B202B] to-[#12161F]'
                }`}
                style={{
                  boxShadow: isDown
                    ? '0 1px 0 #0D1017, 0 2px 5px rgba(0,0,0,0.5)'
                    : isSelected
                    ? `0 6px 0 #0C0F16, 0 10px 20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.2)`
                    : `0 6px 0 #0C0F16, 0 10px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)`,
                }}
              >
                {/* Key Underglow LED effect */}
                <div
                  className={`absolute inset-0 pointer-events-none rounded-lg transition-opacity ${
                    isSelected ? 'opacity-45' : 'opacity-15 group-hover:opacity-30'
                  }`}
                  style={{
                    backgroundColor: k.accentColor || '#FF5E00',
                    filter: isSelected ? 'blur(10px)' : 'blur(8px)',
                  }}
                />

                {/* Safety Hold Animated Radial / Bar Fill */}
                {isHoldingThis && (
                  <div
                    className="absolute inset-x-0 bottom-0 bg-red-500/40 pointer-events-none transition-all duration-75"
                    style={{ height: `${holdProgress}%` }}
                  />
                )}

                {/* Key Top Dish / Dish Bevel */}
                <div className="w-full flex items-center justify-between text-[9px] font-mono relative z-10">
                  <span
                    className={`transition-colors ${
                      isSelected
                        ? 'font-black text-black bg-[#FF5E00] px-1 py-0.2 rounded shadow-xs'
                        : 'font-semibold text-white/50'
                    }`}
                  >
                    #{k.keyIndex + 1}
                  </span>
                  {isSafety && (
                    <span className="text-[8px] font-bold text-red-400 bg-red-950/80 px-1 rounded border border-red-500/40 animate-pulse">
                      HOLD
                    </span>
                  )}
                </div>

                {/* Center Icon */}
                <div
                  className="relative z-10 my-auto transition-transform group-hover:scale-110 flex items-center justify-center"
                  style={{ color: k.accentColor || '#FF5E00' }}
                >
                  {k.tapAction?.category === 'app_launch' && k.tapAction.payload?.iconDataUrl ? (
                    <img
                      src={k.tapAction.payload.iconDataUrl}
                      alt={k.label}
                      className="w-7 h-7 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] rounded"
                    />
                  ) : (
                    renderIcon(k.iconName, "w-6 h-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]")
                  )}
                </div>

                {/* Bottom Legend */}
                <div className="w-full text-center relative z-10">
                  <div className="text-[10px] font-semibold text-white/90 truncate leading-tight">
                    {k.label}
                  </div>
                  {k.sublabel && (
                    <div className="text-[8px] font-mono text-white/40 truncate">
                      {k.sublabel}
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
