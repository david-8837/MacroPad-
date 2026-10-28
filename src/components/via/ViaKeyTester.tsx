import React, { useState, useEffect } from 'react';
import { playKeyClick } from '../../utils/soundEffects';
import { 
  Keyboard as KeyboardIcon, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Activity
} from 'lucide-react';

interface TestedKeyInfo {
  code: string;
  name: string;
  pressCount: number;
  lastDownTimestamp: number;
  lastUpTimestamp: number;
  latencyMs: number;
  isChattering?: boolean;
}

export interface KeyDef {
  code: string;
  label: string;
  subLabel?: string;
  width?: number; // In units (1 = 1u = 32px)
  height?: number; // In units (1 = 1u = 32px)
  rowSpan?: number;
  colSpan?: number;
}

// MAIN 60% ALPHANUMERIC CLUSTER
const MAIN_ROW_0: KeyDef[] = [
  { code: 'Escape', label: 'Esc', width: 1 },
  { code: 'spacer-0.5', label: '', width: 0.5 },
  { code: 'F1', label: 'F1', width: 1 },
  { code: 'F2', label: 'F2', width: 1 },
  { code: 'F3', label: 'F3', width: 1 },
  { code: 'F4', label: 'F4', width: 1 },
  { code: 'spacer-0.5', label: '', width: 0.5 },
  { code: 'F5', label: 'F5', width: 1 },
  { code: 'F6', label: 'F6', width: 1 },
  { code: 'F7', label: 'F7', width: 1 },
  { code: 'F8', label: 'F8', width: 1 },
  { code: 'spacer-0.5', label: '', width: 0.5 },
  { code: 'F9', label: 'F9', width: 1 },
  { code: 'F10', label: 'F10', width: 1 },
  { code: 'F11', label: 'F11', width: 1 },
  { code: 'F12', label: 'F12', width: 1 },
];

const MAIN_ROW_1: KeyDef[] = [
  { code: 'Backquote', label: '`', subLabel: '~', width: 1 },
  { code: 'Digit1', label: '1', subLabel: '!', width: 1 },
  { code: 'Digit2', label: '2', subLabel: '@', width: 1 },
  { code: 'Digit3', label: '3', subLabel: '#', width: 1 },
  { code: 'Digit4', label: '4', subLabel: '$', width: 1 },
  { code: 'Digit5', label: '5', subLabel: '%', width: 1 },
  { code: 'Digit6', label: '6', subLabel: '^', width: 1 },
  { code: 'Digit7', label: '7', subLabel: '&', width: 1 },
  { code: 'Digit8', label: '8', subLabel: '*', width: 1 },
  { code: 'Digit9', label: '9', subLabel: '(', width: 1 },
  { code: 'Digit0', label: '0', subLabel: ')', width: 1 },
  { code: 'Minus', label: '-', subLabel: '_', width: 1 },
  { code: 'Equal', label: '=', subLabel: '+', width: 1 },
  { code: 'Backspace', label: 'Backspace', width: 2 },
];

const MAIN_ROW_2: KeyDef[] = [
  { code: 'Tab', label: 'Tab', width: 1.5 },
  { code: 'KeyQ', label: 'Q', width: 1 },
  { code: 'KeyW', label: 'W', width: 1 },
  { code: 'KeyE', label: 'E', width: 1 },
  { code: 'KeyR', label: 'R', width: 1 },
  { code: 'KeyT', label: 'T', width: 1 },
  { code: 'KeyY', label: 'Y', width: 1 },
  { code: 'KeyU', label: 'U', width: 1 },
  { code: 'KeyI', label: 'I', width: 1 },
  { code: 'KeyO', label: 'O', width: 1 },
  { code: 'KeyP', label: 'P', width: 1 },
  { code: 'BracketLeft', label: '[', subLabel: '{', width: 1 },
  { code: 'BracketRight', label: ']', subLabel: '}', width: 1 },
  { code: 'Backslash', label: '\\', subLabel: '|', width: 1.5 },
];

const MAIN_ROW_3: KeyDef[] = [
  { code: 'CapsLock', label: 'Caps', width: 1.75 },
  { code: 'KeyA', label: 'A', width: 1 },
  { code: 'KeyS', label: 'S', width: 1 },
  { code: 'KeyD', label: 'D', width: 1 },
  { code: 'KeyF', label: 'F', width: 1 },
  { code: 'KeyG', label: 'G', width: 1 },
  { code: 'KeyH', label: 'H', width: 1 },
  { code: 'KeyJ', label: 'J', width: 1 },
  { code: 'KeyK', label: 'K', width: 1 },
  { code: 'KeyL', label: 'L', width: 1 },
  { code: 'Semicolon', label: ';', subLabel: ':', width: 1 },
  { code: 'Quote', label: "'", subLabel: '"', width: 1 },
  { code: 'Enter', label: 'Enter', width: 2.25 },
];

const MAIN_ROW_4: KeyDef[] = [
  { code: 'ShiftLeft', label: 'Shift', width: 2.25 },
  { code: 'KeyZ', label: 'Z', width: 1 },
  { code: 'KeyX', label: 'X', width: 1 },
  { code: 'KeyC', label: 'C', width: 1 },
  { code: 'KeyV', label: 'V', width: 1 },
  { code: 'KeyB', label: 'B', width: 1 },
  { code: 'KeyN', label: 'N', width: 1 },
  { code: 'KeyM', label: 'M', width: 1 },
  { code: 'Comma', label: ',', subLabel: '<', width: 1 },
  { code: 'Period', label: '.', subLabel: '>', width: 1 },
  { code: 'Slash', label: '/', subLabel: '?', width: 1 },
  { code: 'ShiftRight', label: 'Shift', width: 2.75 },
];

const MAIN_ROW_5: KeyDef[] = [
  { code: 'ControlLeft', label: 'Ctrl', width: 1.25 },
  { code: 'MetaLeft', label: 'Win', width: 1.25 },
  { code: 'AltLeft', label: 'Alt', width: 1.25 },
  { code: 'Space', label: 'Space', width: 6.25 },
  { code: 'AltRight', label: 'Alt', width: 1.25 },
  { code: 'MetaRight', label: 'Win', width: 1.25 },
  { code: 'ContextMenu', label: 'Menu', width: 1.25 },
  { code: 'ControlRight', label: 'Ctrl', width: 1.25 },
];

// NAVIGATION & ARROWS CLUSTER
const NAV_ROW_0: KeyDef[] = [
  { code: 'PrintScreen', label: 'PrtSc', width: 1 },
  { code: 'ScrollLock', label: 'ScrLk', width: 1 },
  { code: 'Pause', label: 'Pause', width: 1 },
];

const NAV_ROW_1: KeyDef[] = [
  { code: 'Insert', label: 'Ins', width: 1 },
  { code: 'Home', label: 'Home', width: 1 },
  { code: 'PageUp', label: 'PgUp', width: 1 },
];

const NAV_ROW_2: KeyDef[] = [
  { code: 'Delete', label: 'Del', width: 1 },
  { code: 'End', label: 'End', width: 1 },
  { code: 'PageDown', label: 'PgDn', width: 1 },
];

const ARROW_ROW_4: KeyDef[] = [
  { code: 'spacer-1', label: '', width: 1 },
  { code: 'ArrowUp', label: '▲', width: 1 },
  { code: 'spacer-1b', label: '', width: 1 },
];

const ARROW_ROW_5: KeyDef[] = [
  { code: 'ArrowLeft', label: '◀', width: 1 },
  { code: 'ArrowDown', label: '▼', width: 1 },
  { code: 'ArrowRight', label: '▶', width: 1 },
];

// NUMPAD CLUSTER
const NUMPAD_ROW_0: KeyDef[] = [
  { code: 'Calc', label: 'Calc', width: 1 },
  { code: 'AudioVolumeMute', label: 'Mute', width: 1 },
  { code: 'AudioVolumeDown', label: 'Vol-', width: 1 },
  { code: 'AudioVolumeUp', label: 'Vol+', width: 1 },
];

const NUMPAD_GRID_KEYS: (KeyDef & { gridArea: string })[] = [
  { code: 'NumLock', label: 'Num', gridArea: '1 / 1 / 2 / 2' },
  { code: 'NumpadDivide', label: '/', gridArea: '1 / 2 / 2 / 3' },
  { code: 'NumpadMultiply', label: '*', gridArea: '1 / 3 / 2 / 4' },
  { code: 'NumpadSubtract', label: '-', gridArea: '1 / 4 / 2 / 5' },
  
  { code: 'Numpad7', label: '7', gridArea: '2 / 1 / 3 / 2' },
  { code: 'Numpad8', label: '8', gridArea: '2 / 2 / 3 / 3' },
  { code: 'Numpad9', label: '9', gridArea: '2 / 3 / 3 / 4' },
  { code: 'NumpadAdd', label: '+', gridArea: '2 / 4 / 4 / 5' },
  
  { code: 'Numpad4', label: '4', gridArea: '3 / 1 / 4 / 2' },
  { code: 'Numpad5', label: '5', gridArea: '3 / 2 / 4 / 3' },
  { code: 'Numpad6', label: '6', gridArea: '3 / 3 / 4 / 4' },
  
  { code: 'Numpad1', label: '1', gridArea: '4 / 1 / 5 / 2' },
  { code: 'Numpad2', label: '2', gridArea: '4 / 2 / 5 / 3' },
  { code: 'Numpad3', label: '3', gridArea: '4 / 3 / 5 / 4' },
  { code: 'NumpadEnter', label: 'Enter', gridArea: '4 / 4 / 6 / 5' },
  
  { code: 'Numpad0', label: '0', gridArea: '5 / 1 / 6 / 3' },
  { code: 'NumpadDecimal', label: '.', gridArea: '5 / 3 / 6 / 4' },
];

export const ViaKeyTester: React.FC = () => {
  const [layoutMode, setLayoutMode] = useState<'full' | 'tkl' | '60'>('full');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [testedKeys, setTestedKeys] = useState<{ [code: string]: TestedKeyInfo }>({});
  const [soundProfile, setSoundProfile] = useState<'thock' | 'click' | 'silent'>('thock');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [totalKeypresses, setTotalKeypresses] = useState(0);
  const [chatterWarnings, setChatterWarnings] = useState(0);
  const [lastActuatedKey, setLastActuatedKey] = useState<string>('None');

  // Key normalization matching DOM Level 3 e.code
  const normalizeKey = (e: KeyboardEvent): string => {
    if (e.code) return e.code;
    // Fallbacks for older browsers
    if (e.key === ' ') return 'Space';
    if (e.key === 'Escape') return 'Escape';
    if (e.key === 'Enter') return 'Enter';
    return e.key;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser shortcuts like Tab navigation, F-keys, or Space scroll while testing
      e.preventDefault();
      
      const code = normalizeKey(e);
      const now = performance.now();

      setActiveKeys(prev => {
        const next = new Set(prev);
        next.add(code);
        return next;
      });

      setTestedKeys(prev => {
        const existing = prev[code];
        const lastDown = existing?.lastDownTimestamp || 0;
        const timeSinceLastDown = now - lastDown;

        // Switch chatter threshold: consecutive presses under 25ms indicate switch bounce/defect
        const isChatter = existing && timeSinceLastDown < 25;
        if (isChatter) {
          setChatterWarnings(c => c + 1);
        }

        return {
          ...prev,
          [code]: {
            code,
            name: e.key || code,
            pressCount: (existing?.pressCount || 0) + 1,
            lastDownTimestamp: now,
            lastUpTimestamp: existing?.lastUpTimestamp || 0,
            latencyMs: existing ? Math.round(timeSinceLastDown) : 0,
            isChattering: isChatter,
          }
        };
      });

      setLastActuatedKey(e.code || e.key);
      setTotalKeypresses(c => c + 1);

      if (soundEnabled) {
        if (soundProfile === 'thock') playKeyClick('heavy');
        else if (soundProfile === 'click') playKeyClick('down');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = normalizeKey(e);
      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });

      if (soundEnabled && soundProfile !== 'silent') {
        playKeyClick('up');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [soundEnabled, soundProfile]);

  const resetTester = () => {
    setActiveKeys(new Set());
    setTestedKeys({});
    setTotalKeypresses(0);
    setChatterWarnings(0);
    setLastActuatedKey('None');
  };

  const testedCount = Object.keys(testedKeys).length;

  // Render a standard key button
  const renderKey = (k: KeyDef, customHeight?: string) => {
    if (k.code.startsWith('spacer-')) {
      const uWidth = (k.width || 1) * 32;
      return <div key={k.code} style={{ width: `${uWidth}px` }} className="pointer-events-none" />;
    }

    const isDown = activeKeys.has(k.code);
    const info = testedKeys[k.code];
    const wasTested = !!info;
    const uWidth = (k.width || 1) * 32;

    return (
      <div
        key={k.code}
        style={{
          width: `${uWidth}px`,
          height: customHeight || '32px'
        }}
        className={` flex flex-col items-center justify-between p-1 font-mono text-[10px] font-bold border transition-all duration-75 relative select-none ${
 isDown
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA] scale-95 z-10'
 : wasTested
 ? 'bg-[#EDECE8] text-[#1351AA] border-[#1351AA]'
 : 'bg-[#FFFFFF] text-[#646464] border-[#E3E2DE] hover:border-[#C7C7C7]'
 }`}
      >
        <div className="flex items-center justify-between w-full leading-none px-0.5">
          <span className="truncate">{k.label}</span>
          {k.subLabel && <span className="text-[8px] text-[#646464]">{k.subLabel}</span>}
        </div>
        {wasTested && (
          <span className="text-[7px] text-[#444343] font-mono leading-none font-normal">
            {info.pressCount}x
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="panel p-5 border border-[#E3E2DE] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E3E2DE]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#EDECE8] border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
            <KeyboardIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-[#141414] text-base flex items-center gap-2">
              VIA Key Matrix & Switch Tester
              <span className="text-[10px] font-mono text-[#1351AA] bg-[#EDECE8] px-2 py-0.5 border border-[#C7C7C7]">
                LIVE 1000Hz POLLING
              </span>
            </h3>
            <p className="text-xs text-[#646464]">
              Full-Size 104-Key ANSI Matrix — Press any switch to verify registration, latency, and switch chatter
            </p>
          </div>
        </div>

        {/* Top Controls: Layout Selector, Sound, Reset */}
        <div className="flex items-center gap-2.5">
          {/* Layout Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#EDECE8] border border-[#E3E2DE] text-xs font-mono">
            <button
              onClick={() => setLayoutMode('full')}
              className={`px-2.5 py-1 transition-colors ${
 layoutMode === 'full' ? 'bg-[#1351AA] text-[#E3E2DE] font-bold' : 'text-[#444343] hover:text-[#141414]'
 }`}
            >
              Full Size (100%)
            </button>
            <button
              onClick={() => setLayoutMode('tkl')}
              className={`px-2.5 py-1 transition-colors ${
 layoutMode === 'tkl' ? 'bg-[#1351AA] text-[#E3E2DE] font-bold' : 'text-[#444343] hover:text-[#141414]'
 }`}
            >
              TKL (80%)
            </button>
            <button
              onClick={() => setLayoutMode('60')}
              className={`px-2.5 py-1 transition-colors ${
 layoutMode === '60' ? 'bg-[#1351AA] text-[#E3E2DE] font-bold' : 'text-[#444343] hover:text-[#141414]'
 }`}
            >
              60%
            </button>
          </div>

          {/* Sound Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#EDECE8] border border-[#E3E2DE] text-xs font-mono">
            <button
              onClick={() => setSoundProfile('thock')}
              className={`px-2 py-1 transition-colors ${
 soundProfile === 'thock' ? 'bg-[#1351AA] text-[#E3E2DE] font-bold' : 'text-[#444343] hover:text-[#141414]'
 }`}
            >
              Thock
            </button>
            <button
              onClick={() => setSoundProfile('click')}
              className={`px-2 py-1 transition-colors ${
 soundProfile === 'click' ? 'bg-[#1351AA] text-[#E3E2DE] font-bold' : 'text-[#444343] hover:text-[#141414]'
 }`}
            >
              Clicky
            </button>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title="Toggle Audio Feedback"
              className={`p-1 transition-colors ${
 soundEnabled ? 'text-[#1351AA]' : 'text-[#646464]'
 }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetTester}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] border border-[#E3E2DE] text-xs text-[#444343] hover:text-[#141414] font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Matrix</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Bar */}
      <div className="grid grid-cols-4 gap-3 text-center font-mono">
        <div className="p-2.5 bg-[#FFFFFF] border border-[#E3E2DE]">
          <div className="text-[10px] text-[#646464] uppercase">Keys Registered</div>
          <div className="text-sm font-bold text-[#1351AA]">{testedCount} Keys</div>
        </div>
        <div className="p-2.5 bg-[#FFFFFF] border border-[#E3E2DE]">
          <div className="text-[10px] text-[#646464] uppercase">Total Actuations</div>
          <div className="text-sm font-bold text-[#141414]">{totalKeypresses}</div>
        </div>
        <div className="p-2.5 bg-[#FFFFFF] border border-[#E3E2DE]">
          <div className="text-[10px] text-[#646464] uppercase">Active Down</div>
          <div className="text-sm font-bold text-[#1351AA]">{activeKeys.size} Keys</div>
        </div>
        <div className="p-2.5 bg-[#FFFFFF] border border-[#E3E2DE]">
          <div className="text-[10px] text-[#646464] uppercase">Switch Chatter</div>
          <div className={`text-sm font-bold ${chatterWarnings > 0 ? 'text-[#141414]' : 'text-[#1351AA]'}`}>
            {chatterWarnings > 0 ? `${chatterWarnings} Warnings` : 'Clean (0 Bounces)'}
          </div>
        </div>
      </div>

      {/* VISUAL FULL SIZE KEYBOARD MATRIX */}
      <div className="p-4 bg-[#FFFFFF] border border-[#E3E2DE] overflow-x-auto select-none flex justify-center">
        <div className="inline-flex gap-4">
          
          {/* SECTION 1: MAIN ALPHANUMERIC CLUSTER (15u) */}
          <div className="space-y-[3px]">
            {/* Function Row */}
            <div className="flex gap-[3px] mb-2">
              {MAIN_ROW_0.map(k => renderKey(k))}
            </div>

            {/* Row 1: Number Row */}
            <div className="flex gap-[3px]">
              {MAIN_ROW_1.map(k => renderKey(k))}
            </div>

            {/* Row 2: QWERTY */}
            <div className="flex gap-[3px]">
              {MAIN_ROW_2.map(k => renderKey(k))}
            </div>

            {/* Row 3: Home Row */}
            <div className="flex gap-[3px]">
              {MAIN_ROW_3.map(k => renderKey(k))}
            </div>

            {/* Row 4: Shift Row */}
            <div className="flex gap-[3px]">
              {MAIN_ROW_4.map(k => renderKey(k))}
            </div>

            {/* Row 5: Space Row */}
            <div className="flex gap-[3px]">
              {MAIN_ROW_5.map(k => renderKey(k))}
            </div>
          </div>

          {/* SECTION 2: NAVIGATION & ARROWS (TKL & FULL) */}
          {layoutMode !== '60' && (
            <div className="space-y-[3px] flex flex-col justify-between">
              {/* PrtSc, ScrLk, Pause */}
              <div className="flex gap-[3px] mb-2">
                {NAV_ROW_0.map(k => renderKey(k))}
              </div>

              {/* Ins, Home, PgUp */}
              <div className="flex gap-[3px]">
                {NAV_ROW_1.map(k => renderKey(k))}
              </div>

              {/* Del, End, PgDn */}
              <div className="flex gap-[3px]">
                {NAV_ROW_2.map(k => renderKey(k))}
              </div>

              {/* Blank Gap */}
              <div className="h-[32px]" />

              {/* Up Arrow */}
              <div className="flex gap-[3px]">
                {ARROW_ROW_4.map(k => renderKey(k))}
              </div>

              {/* Left, Down, Right Arrow */}
              <div className="flex gap-[3px]">
                {ARROW_ROW_5.map(k => renderKey(k))}
              </div>
            </div>
          )}

          {/* SECTION 3: FULL NUMERIC KEYPAD (NUMPAD) */}
          {layoutMode === 'full' && (
            <div className="space-y-[3px]">
              {/* Media/Aux Row 0 */}
              <div className="flex gap-[3px] mb-2">
                {NUMPAD_ROW_0.map(k => renderKey(k))}
              </div>

              {/* Numpad 4x5 CSS Grid */}
              <div 
                className="grid gap-[3px]"
                style={{
                  gridTemplateColumns: 'repeat(4, 32px)',
                  gridTemplateRows: 'repeat(5, 32px)'
                }}
              >
                {NUMPAD_GRID_KEYS.map(k => {
                  const isDown = activeKeys.has(k.code);
                  const info = testedKeys[k.code];
                  const wasTested = !!info;

                  return (
                    <div
                      key={k.code}
                      style={{ gridArea: k.gridArea }}
                      className={` flex flex-col items-center justify-between p-1 font-mono text-[10px] font-bold border transition-all duration-75 relative select-none ${
 isDown
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA] scale-95 z-10'
 : wasTested
 ? 'bg-[#EDECE8] text-[#1351AA] border-[#1351AA]'
 : 'bg-[#FFFFFF] text-[#646464] border-[#E3E2DE] hover:border-[#C7C7C7]'
 }`}
                    >
                      <span className="truncate leading-none">{k.label}</span>
                      {wasTested && (
                        <span className="text-[7px] text-[#444343] font-mono leading-none font-normal">
                          {info.pressCount}x
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Key Actuation Feed Ticker */}
      <div className="p-3 bg-[#FFFFFF] border border-[#E3E2DE] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-[#444343]">
          <Activity className="w-4 h-4 text-[#1351AA]" />
          <span>Last Actuated Switch:</span>
          <span className="font-bold text-[#141414] px-2 py-0.5 bg-[#F4F3F0] border border-[#E3E2DE]">
            {lastActuatedKey}
          </span>
        </div>
        <div className="text-[11px] text-[#646464]">
          Actuation counter increments on every switch press • Bounce latency tracked in real-time
        </div>
      </div>
    </div>
  );
};

