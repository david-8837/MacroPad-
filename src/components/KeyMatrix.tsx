import React, { useState, useRef, useEffect } from 'react';
import { KeyBinding } from '../types';
import { playKeyClick } from '../utils/soundEffects';
import { keyDisplayText } from '../utils/shortcutBindings';
import { watchPointerGesture } from '../utils/watchPointerGesture';
import { Copy, Clipboard, Scissors, RotateCcw, RotateCw, Save, Search, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Globe, Home, ArrowLeft, ArrowRight, Keyboard, Star, Heart, Film, Code, Music, Sparkles, Square, Rocket } from 'lucide-react';

const commonIcons: Record<string, React.ElementType> = { Copy, Clipboard, Scissors, RotateCcw, RotateCw, Save, Search, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Globe, Home, ArrowLeft, ArrowRight, Keyboard, Star, Heart, Film, Code, Music, Sparkles, Square, Rocket };
// Rare legacy icon names remain supported, but their full catalogue is lazy.
const LegacyKeyIcon = React.lazy(() => import('./LegacyKeyIcon'));

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
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickCountRef = useRef<Record<number, number>>({});
  const clickTimerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const cleanupPointerRef = useRef<(() => void) | null>(null);
  const pressed = useRef<{ index: number; source: string; held: boolean; safety: boolean } | null>(null);

  // Do not let delayed gestures from a previous layer execute after a switch
  // or an unmount. The bindings in these callbacks belong to that old layer.
  useEffect(() => {
    setActiveDownKey(null); setHoldingKeyIndex(null); setHoldProgress(0);
    return () => {
      cleanupPointerRef.current?.(); cleanupPointerRef.current = null;
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      Object.values(clickTimerRef.current).forEach(clearTimeout);
      clickTimerRef.current = {};
      clickCountRef.current = {};
      pressed.current = null;
    };
  }, [keys]);

  const renderIcon = (iconName: string, className = 'w-5 h-5') => {
    const Icon = Object.prototype.hasOwnProperty.call(commonIcons, iconName) ? commonIcons[iconName] : null;
    if (Icon) return <Icon className={className} />;
    return <React.Suspense fallback={<Square className={className} />}><LegacyKeyIcon name={iconName} className={className} /></React.Suspense>;
  };

  const startPress = (binding: KeyBinding, source: string) => {
    if (pressed.current) return;
    const safety = Boolean(binding.isDestructiveSafety && binding.safetyConfirmAction);
    const current = { index: binding.keyIndex, source, held: false, safety };
    pressed.current = current;
    onSelectKey(binding.keyIndex);
    setActiveDownKey(binding.keyIndex);
    playKeyClick('down');
    if (safety) {
      setHoldingKeyIndex(binding.keyIndex);
      setHoldProgress(0);
      const threshold = binding.longPressThresholdMs || 1500;
      const started = Date.now();
      holdIntervalRef.current = setInterval(() => setHoldProgress(Math.min(100, (Date.now() - started) / threshold * 100)), 25);
      holdTimerRef.current = setTimeout(() => {
        if (pressed.current !== current || !binding.safetyConfirmAction) return;
        current.held = true;
        playKeyClick('heavy'); setHoldProgress(100);
        onTriggerAction(binding.safetyConfirmAction.id, `[SAFETY UNLOCKED] ${binding.safetyConfirmAction.name}`,
          binding.safetyConfirmAction.category, binding.safetyConfirmAction.payload);
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      }, threshold);
    } else if (binding.holdAction) {
      holdTimerRef.current = setTimeout(() => {
        if (pressed.current !== current || !binding.holdAction) return;
        current.held = true;
        playKeyClick('heavy');
        onTriggerAction(binding.holdAction.id, `[HOLD] ${binding.holdAction.name}`, binding.holdAction.category, binding.holdAction.payload);
      }, 250);
    }
  };

  const finishPress = (binding: KeyBinding, source: string, cancelled = false) => {
    const current = pressed.current;
    if (!current || current.index !== binding.keyIndex || current.source !== source) return;
    pressed.current = null;
    cleanupPointerRef.current?.(); cleanupPointerRef.current = null;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    holdTimerRef.current = null; holdIntervalRef.current = null;
    setActiveDownKey(null); setHoldingKeyIndex(null); setHoldProgress(0);
    playKeyClick('up');
    if (cancelled) return;
    if (current.safety) {
      if (!current.held) onTriggerAction('safety-aborted', 'Hold cancelled (Threshold not met)', 'info');
      return;
    }
    // A hold is an alternative to a tap, never both.
    if (current.held) return;
    // Without a double-tap binding there is no ambiguity to resolve: every
    // tap must fire, even when the user presses the same key rapidly.
    if (!binding.doubleTapAction) {
      if (binding.tapAction) onTriggerAction(binding.tapAction.id, binding.tapAction.name, binding.tapAction.category, binding.tapAction.payload);
      return;
    }
    const idx = binding.keyIndex;
    clickCountRef.current[idx] = (clickCountRef.current[idx] || 0) + 1;
    if (clickCountRef.current[idx] === 1) {
      clickTimerRef.current[idx] = setTimeout(() => {
        if (binding.tapAction) onTriggerAction(binding.tapAction.id, binding.tapAction.name, binding.tapAction.category, binding.tapAction.payload);
        clickCountRef.current[idx] = 0;
        delete clickTimerRef.current[idx];
      }, 220);
    } else {
      clearTimeout(clickTimerRef.current[idx]);
      delete clickTimerRef.current[idx];
      clickCountRef.current[idx] = 0;
      const action = binding.doubleTapAction || binding.tapAction;
      if (action) onTriggerAction(action.id, binding.doubleTapAction ? `[DOUBLE TAP] ${action.name}` : action.name, action.category, action.payload);
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
          const display = keyDisplayText(k);

          return (
            <div
              key={k.keyIndex}
              className="relative"
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                type="button"
                title={[display.label, display.sublabel].filter(Boolean).join(' — ')}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  const source = `pointer:${e.pointerId}`;
                  startPress(k, source);
                  if (pressed.current?.source === source) {
                    cleanupPointerRef.current?.();
                    cleanupPointerRef.current = watchPointerGesture(e.currentTarget, e.pointerId, cancelled => finishPress(k, source, cancelled));
                  }
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* browser may not support capture */ }
                }}
                onPointerUp={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
                  finishPress(k, `pointer:${e.pointerId}`, outside);
                }}
                onPointerMove={(e) => {
                  if (pressed.current?.source !== `pointer:${e.pointerId}`) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) finishPress(k, `pointer:${e.pointerId}`, true);
                }}
                onPointerCancel={(e) => finishPress(k, `pointer:${e.pointerId}`, true)}
                onLostPointerCapture={(e) => finishPress(k, `pointer:${e.pointerId}`, true)}
                onPointerLeave={(e) => finishPress(k, `pointer:${e.pointerId}`, true)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (!e.repeat) startPress(k, `key:${e.key}`);
                }}
                onKeyUp={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  finishPress(k, `key:${e.key}`);
                }}
                onBlur={() => {
                  const current = pressed.current;
                  if (current?.source.startsWith('key:')) finishPress(k, current.source, true);
                }}
                onClick={(e) => {
                  // Screen readers can activate buttons without key or pointer events.
                  if (e.detail === 0) { startPress(k, 'assistive'); finishPress(k, 'assistive'); }
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
                    {display.label}
                  </span>
                  {display.sublabel && (
                    <span
                      className={`block font-mono text-[7.5px] truncate mt-[2px] ${
                        isDown ? 'text-[#C7C7C7]' : 'text-[#646464]'
                      }`}
                    >
                      {display.sublabel}
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
