import React, { useState, useEffect, useRef } from 'react';
import { DialBinding, ActionDefinition } from '../types';
import { playDetentClick, playKeyClick } from '../utils/soundEffects';
import { DIAL_MODES } from '../utils/channelLayers';
import {
  X,
  Check,
  RotateCw,
  RotateCcw,
  Sparkles,
  Zap,
  Trash2,
} from 'lucide-react';
import {
  DRAWER_MEDIA_KEYS,
  SHORTCUT_PRESETS
} from './KeyConfigDrawer';

interface KnobConfigDrawerProps {
  dial: DialBinding;
  onSave: (updatedDial: DialBinding) => void;
  onClose: () => void;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: ActionDefinition['payload']) => void;
}

export const KnobConfigDrawer: React.FC<KnobConfigDrawerProps> = ({
  dial,
  onSave,
  onClose,
  onTriggerAction,
}) => {
  /* Four modes, one per layer, straight from the deck. */
  const channelList = dial?.availableModes?.length ? [...dial.availableModes] : [...DIAL_MODES];

  const initialChannelIdx = Math.max(
    0,
    channelList.findIndex(m => m === dial?.activeModeName)
  );

  const [activeChannel, setActiveChannel] = useState<number>(initialChannelIdx);
  const [channelNames, setChannelNames] = useState<string[]>([...channelList]);

  // 4 Rotary Actions
  const [cwAction, setCwAction] = useState<ActionDefinition>({
    id: dial?.cwAction?.id || 'cw-def',
    category: dial?.cwAction?.category || 'hotkey',
    name: dial?.cwAction?.name || 'Turn Right (CW)',
    payload: { ...(dial?.cwAction?.payload || { keys: ['AudioVolumeUp'] }) },
  });
  const [ccwAction, setCcwAction] = useState<ActionDefinition>({
    id: dial?.ccwAction?.id || 'ccw-def',
    category: dial?.ccwAction?.category || 'hotkey',
    name: dial?.ccwAction?.name || 'Turn Left (CCW)',
    payload: { ...(dial?.ccwAction?.payload || { keys: ['AudioVolumeDown'] }) },
  });
  const [pressAction, setPressAction] = useState<ActionDefinition>({
    id: dial?.pressAction?.id || 'press-def',
    category: dial?.pressAction?.category || 'hotkey',
    name: dial?.pressAction?.name || 'Toggle Mute',
    payload: { ...(dial?.pressAction?.payload || { keys: ['AudioVolumeMute'] }) },
  });
  const [holdAction, setHoldAction] = useState<ActionDefinition>({
    id: dial?.holdAction?.id || 'hold-def',
    category: dial?.holdAction?.category || 'navigation',
    name: dial?.holdAction?.name || 'Cycle Layers (Layer 1 → 2 → 3)',
    payload: { ...(dial?.holdAction?.payload || {}) },
  });

  // Selected rotary key: 'cw', 'ccw', or 'press' (Hold is strictly for layer switching)
  const [selectedRotaryKey, setSelectedRotaryKey] = useState<'cw' | 'ccw' | 'press'>('cw');

  // Settings & Dynamics
  const [channelHoldThresholdMs, setChannelHoldThresholdMs] = useState<number>(
    dial?.channelHoldThresholdMs || 800
  );
  const [accelerationCurve, setAccelerationCurve] = useState<'linear' | 'exponential' | 'precision_nudge'>(
    dial?.accelerationCurve || 'exponential'
  );
  const [sensitivity, setSensitivity] = useState<number>(dial?.sensitivity || 5);
  const [hasChanges, setHasChanges] = useState(false);

  // Live Test Rig States for Tap vs Hold
  const [testHolding, setTestHolding] = useState(false);
  const [testHoldProgress, setTestHoldProgress] = useState(0);
  const [testLog, setTestLog] = useState<{ message: string; type: 'tap' | 'hold' } | null>(null);
  const testHoldStartRef = useRef(0);
  const testAnimRef = useRef<number | null>(null);
  const testDidHoldRef = useRef(false);

  useEffect(() => {
    return () => {
      if (testAnimRef.current) {
        cancelAnimationFrame(testAnimRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const list = dial.availableModes?.length ? [...dial.availableModes] : [...DIAL_MODES];
    setChannelNames(list);
    const idx = list.findIndex(m => m === dial.activeModeName);
    if (idx !== -1) setActiveChannel(idx);
    setCwAction({ ...dial.cwAction });
    setCcwAction({ ...dial.ccwAction });
    setPressAction({ ...dial.pressAction });
    setHoldAction(dial.holdAction || {
      id: 'hold-def',
      category: 'navigation',
      name: 'Cycle Layers (Layer 0 → 1 → 2 → 3)',
      payload: {},
    });
    setChannelHoldThresholdMs(dial.channelHoldThresholdMs || 800);
    setAccelerationCurve(dial.accelerationCurve || 'exponential');
    setSensitivity(dial.sensitivity || 5);
  }, [dial]);

  // Get active Action Definition and Setter based on selected rotary key
  const getActiveAction = (): ActionDefinition => {
    if (selectedRotaryKey === 'cw') return cwAction;
    if (selectedRotaryKey === 'ccw') return ccwAction;
    return pressAction;
  };

  const activeAction = getActiveAction();
  const recordedKeys = activeAction?.payload?.keys || [];

  // Helper to commit updated key sequence to active rotary action (Strictly 1 shortcut)
  const commitUpdatedKeys = (newKeys: string[], customName?: string) => {
    const defaultName = newKeys.length > 0
      ? `Shortcut: ${newKeys.join(' + ')}`
      : 'Unassigned';

    const updater = (prev: ActionDefinition): ActionDefinition => ({
      ...prev,
      category: 'hotkey',
      name: customName || (
        (!prev.name || prev.name.startsWith('Shortcut:') || prev.name === 'Turn Right (CW)' || prev.name === 'Turn Left (CCW)' || prev.name === 'Action name')
          ? defaultName
          : prev.name
      ),
      payload: {
        ...(prev.payload || {}),
        keys: newKeys,
      },
    });

    if (selectedRotaryKey === 'cw') setCwAction(updater);
    else if (selectedRotaryKey === 'ccw') setCcwAction(updater);
    else if (selectedRotaryKey === 'press') setPressAction(updater);

    setHasChanges(true);
  };

  // Handle clicking on shortcut key / media hotkey (Strictly 1 shortcut: replaces previous)
  const handleVirtualKeyClick = (keyName: string) => {
    if (!keyName) return;
    playKeyClick('down');
    commitUpdatedKeys([keyName]);
  };

  // Remove individual key badge from combo
  const removeKeyFromCombo = (indexToRemove: number) => {
    playKeyClick('up');
    const next = recordedKeys.filter((_, i) => i !== indexToRemove);
    commitUpdatedKeys(next);
  };

  // Clear shortcut
  const clearShortcut = () => {
    playKeyClick('up');
    commitUpdatedKeys([]);
  };

  // Toggle quick modifier (Ctrl, Shift, Alt, Win) on the single shortcut
  const toggleModifier = (mod: 'Ctrl' | 'Shift' | 'Alt' | 'Win') => {
    playKeyClick('down');
    const nonModKeys = recordedKeys.filter(k => !['Ctrl', 'Shift', 'Alt', 'Win'].includes(k));
    const currentMods = recordedKeys.filter(k => ['Ctrl', 'Shift', 'Alt', 'Win'].includes(k));

    let nextMods: string[];
    if (currentMods.includes(mod)) {
      nextMods = currentMods.filter(m => m !== mod);
    } else {
      nextMods = [...currentMods, mod];
    }

    commitUpdatedKeys([...nextMods, ...nonModKeys]);
  };

  // Apply preset (Strictly 1 shortcut)
  const applyPreset = (presetKeys: string[], defaultLabel: string, defaultName: string) => {
    playKeyClick('down');
    commitUpdatedKeys(presetKeys, `${defaultName} (${defaultLabel})`);
  };

  // Live Physical Keyboard Typing Listener (Captures 1 single shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      playKeyClick('down');

      // Backspace or Escape: clear the shortcut
      if (e.key === 'Backspace' || e.key === 'Escape') {
        clearShortcut();
        return;
      }

      // Detect keys in the current keydown event
      const detectedKeys: string[] = [];
      if (e.ctrlKey) detectedKeys.push('Ctrl');
      if (e.shiftKey) detectedKeys.push('Shift');
      if (e.altKey) detectedKeys.push('Alt');
      if (e.metaKey) detectedKeys.push('Win');

      let primaryKey = e.key;
      if (e.code.startsWith('Numpad')) {
        const sub = e.code.replace('Numpad', '');
        primaryKey = sub === 'Enter' ? 'Num Enter' : `Num ${sub}`;
      } else if (e.code === 'ArrowUp') {
        primaryKey = '▲';
      } else if (e.code === 'ArrowDown') {
        primaryKey = '▼';
      } else if (e.code === 'ArrowLeft') {
        primaryKey = '◀';
      } else if (e.code === 'ArrowRight') {
        primaryKey = '▶';
      } else if (primaryKey === ' ') {
        primaryKey = 'Space';
      } else if (['Control', 'Shift', 'Alt', 'Meta'].includes(primaryKey)) {
        primaryKey = '';
      } else if (primaryKey === 'AudioVolumeUp' || e.code === 'AudioVolumeUp' || primaryKey === 'VolumeUp') {
        primaryKey = 'AudioVolumeUp';
      } else if (primaryKey === 'AudioVolumeDown' || e.code === 'AudioVolumeDown' || primaryKey === 'VolumeDown') {
        primaryKey = 'AudioVolumeDown';
      } else if (primaryKey === 'AudioVolumeMute' || e.code === 'AudioVolumeMute' || primaryKey === 'VolumeMute') {
        primaryKey = 'AudioVolumeMute';
      } else if (primaryKey.length === 1) {
        primaryKey = primaryKey.toUpperCase();
      }

      if (primaryKey && !detectedKeys.includes(primaryKey)) {
        detectedKeys.push(primaryKey);
      }

      if (detectedKeys.length === 0) return;

      // Only 1 shortcut for the knob: replace with detectedKeys
      commitUpdatedKeys(detectedKeys);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [selectedRotaryKey, recordedKeys]);



  // Test Hold Handlers
  const handleTestHoldStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setTestHolding(true);
    setTestHoldProgress(0);
    setTestLog(null);
    testDidHoldRef.current = false;
    testHoldStartRef.current = Date.now();
    playKeyClick('down');

    const update = () => {
      const elapsed = Date.now() - testHoldStartRef.current;
      const progress = Math.min(100, (elapsed / channelHoldThresholdMs) * 100);
      setTestHoldProgress(progress);

      if (elapsed >= channelHoldThresholdMs) {
        testDidHoldRef.current = true;
        setTestHolding(false);
        setTestHoldProgress(100);
        playDetentClick('cw');
        setTestLog({
          message: `★ SIMULATED HOLD (${elapsed}ms) -> Pad unchanged; physical hold switches layer`,
          type: 'hold'
        });
        onTriggerAction('test-hold', `[TEST RIG HOLD] Pad not switched (${elapsed}ms)`, 'navigation');
        return;
      }

      testAnimRef.current = requestAnimationFrame(update);
    };

    testAnimRef.current = requestAnimationFrame(update);
  };

  const handleTestHoldEnd = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    if (testAnimRef.current) {
      cancelAnimationFrame(testAnimRef.current);
      testAnimRef.current = null;
    }

    const wasHolding = testHolding;
    setTestHolding(false);
    setTestHoldProgress(0);

    if (wasHolding && !testDidHoldRef.current) {
      const elapsed = Date.now() - testHoldStartRef.current;
      playKeyClick('up');
      setTestLog({
        message: `✓ TAP FIRED (${elapsed}ms) -> Triggered "${pressAction.name}"`,
        type: 'tap'
      });
      onTriggerAction(pressAction.id, `[TEST RIG TAP] ${pressAction.name} (${elapsed}ms)`, pressAction.category, pressAction.payload);
    }

    testDidHoldRef.current = false;
  };

  const handleSave = () => {
    const updatedDial: DialBinding = {
      ...dial,
      cwAction,
      ccwAction,
      pressAction,
      holdAction,
      channelHoldThresholdMs,
      accelerationCurve,
      sensitivity,
      availableModes: channelNames,
      activeModeName: channelNames[activeChannel] || dial.activeModeName,
    };
    onSave(updatedDial);
    setHasChanges(false);
    playKeyClick('up');
    onClose();
  };

  // Rotary Key Metadata for the 3 Macro Switches
  const ROTARY_KEY_ITEMS = [
    {
      id: 'cw' as const,
      keyTag: '#R',
      badge: 'RIGHT (CW)',
      title: 'Turn Clockwise',
      action: cwAction,
      accent: '#1351AA',
      icon: RotateCw,
    },
    {
      id: 'ccw' as const,
      keyTag: '#L',
      badge: 'LEFT (CCW)',
      title: 'Turn Counter-CW',
      action: ccwAction,
      accent: '#1351AA',
      icon: RotateCcw,
    },
    {
      id: 'press' as const,
      keyTag: '#T',
      badge: 'TAP (PRESS)',
      title: 'Knob Push / Click',
      action: pressAction,
      accent: '#1351AA',
      icon: Zap,
    },
  ];

  const activeKeyMeta = ROTARY_KEY_ITEMS.find(k => k.id === selectedRotaryKey) || ROTARY_KEY_ITEMS[0];

  // Tailored presets for the active rotary action
  const getContextualPresets = () => {
    if (selectedRotaryKey === 'cw') {
      return [
        { name: 'Vol Up', keys: ['AudioVolumeUp'], label: 'Vol+' },
        { name: 'Right Arrow', keys: ['ArrowRight'], label: '▶ Right' },
        { name: 'Up Arrow', keys: ['ArrowUp'], label: '▲ Up' },
        { name: 'Zoom In', keys: ['Ctrl', '='], label: 'Ctrl++' },
        { name: 'Brush Size +', keys: [']'], label: ']' },
        { name: 'Next Tab', keys: ['Ctrl', 'Tab'], label: 'Ctrl+Tab' },
        { name: 'Page Down', keys: ['PageDown'], label: 'PgDn' },
        { name: 'Redo', keys: ['Ctrl', 'Y'], label: 'Ctrl+Y' },
      ];
    } else if (selectedRotaryKey === 'ccw') {
      return [
        { name: 'Vol Down', keys: ['AudioVolumeDown'], label: 'Vol-' },
        { name: 'Left Arrow', keys: ['ArrowLeft'], label: '◀ Left' },
        { name: 'Down Arrow', keys: ['ArrowDown'], label: '▼ Down' },
        { name: 'Zoom Out', keys: ['Ctrl', '-'], label: 'Ctrl+-' },
        { name: 'Brush Size -', keys: ['['], label: '[' },
        { name: 'Prev Tab', keys: ['Ctrl', 'Shift', 'Tab'], label: 'Ctrl+Shift+Tab' },
        { name: 'Page Up', keys: ['PageUp'], label: 'PgUp' },
        { name: 'Undo', keys: ['Ctrl', 'Z'], label: 'Ctrl+Z' },
      ];
    } else {
      return [
        { name: 'Toggle Mute', keys: ['AudioVolumeMute'], label: 'Mute' },
        { name: 'Play/Pause', keys: ['MediaPlayPause'], label: 'Play/Pause' },
        { name: 'Reset 100%', keys: ['Ctrl', '0'], label: 'Ctrl+0' },
        { name: 'Enter', keys: ['Enter'], label: 'Enter' },
        { name: 'Space', keys: ['Space'], label: 'Space' },
        { name: 'Close Tab', keys: ['Ctrl', 'W'], label: 'Ctrl+W' },
      ];
    }
  };

  const contextualPresets = getContextualPresets();

  return (
    <div className="w-full h-full flex flex-col  border-l border-[#E3E2DE] select-none overflow-hidden editor-slide-in">
      
      {/* DRAWER TOP BAR: Switch Navigator & Direct Switch Selector */}
      <div className="px-4 py-2.5 border-b border-[#E3E2DE] bg-[#FFFFFF] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Key Index Badge */}
          <div
            className="w-7 h-7 flex items-center justify-center font-mono font-black text-xs text-[#E3E2DE] shrink-0"
            style={{ backgroundColor: activeKeyMeta.accent }}
          >
            {activeKeyMeta.keyTag}
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#141414] text-xs tracking-wide">
                {activeKeyMeta.badge} • {activeKeyMeta.title}
              </span>
              <span className="text-[10px] text-[#646464] font-mono truncate max-w-[140px]">
                ({activeAction.name || 'Empty'})
              </span>
            </div>
            <p className="text-[9.5px] text-[#646464]">
              Rotary Macro Key • Click keys below or type on your keyboard to build combo
            </p>
          </div>
        </div>

        {/* Top Bar Actions */}
        <div className="flex items-center gap-2">

          {/* Save Button if changes */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              className="px-2.5 py-1 bg-[#1351AA] hover:bg-[#1351AA] text-[#E3E2DE] font-mono text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close Drawer"
            className="w-7 h-7 text-[#646464] hover:text-[#141414] hover:bg-[#EDECE8] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3 ROTARY KEYCAPS (TACTILE DISH MATRIX) */}
      <div className="p-3 bg-[#FFFFFF] border-b border-[#E3E2DE] shrink-0">
        <div className="grid grid-cols-3 gap-2.5">
          {ROTARY_KEY_ITEMS.map((item) => {
            const isSelected = selectedRotaryKey === item.id;
            const Icon = item.icon;
            const keys = item.action?.payload?.keys || [];
            const shortcutString = keys.length > 0
              ? keys.join('+')
              : (item.action?.name || 'Unassigned');

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedRotaryKey(item.id);
                  playKeyClick('down');
                }}
                className={`relative p-2.5 flex flex-col justify-between items-center transition-all cursor-pointer select-none group border text-left ${
 isSelected
 ? 'border-2 scale-[1.02]  '
 : 'border-[#FFFFFF] hover:border-[#141414] hover:scale-[1.01]  '
 }`}
                style={{
                  borderColor: isSelected ? item.accent : undefined,
                  boxShadow: isSelected
                    ? `0 4px 0 #FFFFFF, 0 8px 18px rgba(0,0,0,0.85), 0 0 14px ${item.accent}40, inset 0 1px 0 rgba(255,255,255,0.25)`
                    : `0 4px 0 #FFFFFF, 0 6px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)`,
                }}
              >
                {/* Underglow LED */}
                <div
                  className={`absolute inset-0 pointer-events-none transition-opacity ${
 isSelected ? 'opacity-35' : 'opacity-10 group-hover:opacity-20'
 }`}
                  style={{
                    boxShadow: `inset 0 0 12px ${item.accent}, 0 0 12px ${item.accent}`,
                  }}
                />

                {/* Top Row: Key Tag */}
                <div className="w-full flex items-center justify-between text-[9.5px] font-mono font-bold text-[#646464] z-10">
                  <span style={{ color: isSelected ? item.accent : undefined }}>{item.keyTag}</span>
                  <span className="text-[8px] text-[#646464] uppercase">Macro</span>
                </div>

                {/* Center Icon */}
                <div
                  className="w-8 h-8 flex items-center justify-center my-1.5 transition-transform group-hover:scale-110 z-10"
                  style={{
                    backgroundColor: `${item.accent}15`,
                    color: item.accent,
                    border: `1px solid ${item.accent}40`,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {/* Bottom Labels */}
                <div className="w-full text-center z-10">
                  <div className="text-[10.5px] font-mono font-bold text-[#141414] truncate">
                    {item.badge}
                  </div>
                  <div
                    className="text-[8.5px] font-mono truncate px-1 mt-0.5"
                    style={{
                      color: item.accent,
                      backgroundColor: `${item.accent}15`,
                    }}
                  >
                    {shortcutString}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DRAWER BODY */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3">

        {/* DEDICATED HOLD LAYER SWITCH CARD (Hold is only for Layer Switch) */}
        <div className="p-3  /40 border border-[#C7C7C7]/30 space-y-2">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#1351AA] animate-pulse" />
              <span className="text-[#141414] font-bold tracking-wide">HOLD KNOB TO SWITCH LAYERS:</span>
              <span className="text-[10px] text-[#646464] hidden sm:inline">
                (Hold knob down to cycle Layer 0 → Layer 1 → Layer 2 → Layer 3)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#444343]/70 font-mono">Hold Threshold:</span>
              <span className="font-bold text-[#444343] text-xs bg-[#EDECE8] px-2 py-0.5 border border-[#444343]">
                {channelHoldThresholdMs} ms
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={300}
              max={2500}
              step={50}
              value={channelHoldThresholdMs}
              onChange={(e) => {
                setChannelHoldThresholdMs(Number(e.target.value));
                setHasChanges(true);
              }}
              className="flex-1 accent-[#444343] cursor-pointer"
            />
            {/* Live Hold Test Button */}
            <button
              type="button"
              onMouseDown={handleTestHoldStart}
              onMouseUp={handleTestHoldEnd}
              onMouseLeave={handleTestHoldEnd}
              onTouchStart={handleTestHoldStart}
              onTouchEnd={handleTestHoldEnd}
              className={`px-3 py-1 font-mono text-xs font-bold border transition-all cursor-pointer shrink-0 select-none ${
 testHolding
 ? 'bg-[#EDECE8] text-[#141414] border-[#C7C7C7] scale-95'
 : 'bg-[#FFFFFF] hover:bg-[#FFFFFF] text-[#444343] border-[#C7C7C7]/30'
 }`}
            >
              {testHolding ? `Holding (${Math.round(testHoldProgress)}%)...` : 'Test Hold'}
            </button>
          </div>

          <div className="flex justify-between items-center text-[9px] font-mono text-[#646464]">
            <span>300ms (Fast)</span>
            <span>800ms (Default)</span>
            <span>1500ms</span>
            <span>2500ms (Long)</span>
          </div>

          {testLog && (
            <div className={`text-[10px] font-mono px-2 py-1 border ${
 testLog.type === 'hold'
 ? 'bg-[#EDECE8]/60 text-[#444343] border-[#C7C7C7]/40'
 : 'bg-[#EDECE8]/60 text-[#1351AA] border-[#C7C7C7]/40'
 }`}>
              {testLog.message}
            </div>
          )}
        </div>

        <div className="space-y-3">
            
            {/* SINGLE SHORTCUT DISPLAY */}
            <div className="p-3  border border-[#E3E2DE] space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#1351AA] animate-ping shrink-0" />
                  <span className="text-[11px] font-mono text-[#1351AA] font-bold tracking-wider">
                    ASSIGNED SHORTCUT (1 ACTION):
                  </span>
                  <span className="text-[10px] text-[#646464] hidden sm:inline">
                    Click any shortcut below or type on your keyboard
                  </span>
                </div>

                <div className="text-[10px] font-mono text-[#646464] bg-[#EDECE8] px-2 py-0.5 border border-[#E3E2DE]">
                  1 shortcut per rotary key
                </div>
              </div>

              {/* Active Recorded Keys Interactive Pills */}
              <div className="min-h-[46px] p-2 bg-[#FFFFFF] border border-[#E3E2DE] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {recordedKeys.length === 0 ? (
                    <span className="text-[#646464] text-xs italic font-mono pl-1">
                      No keys assigned — click any key below or type to add
                    </span>
                  ) : (
                    recordedKeys.map((keyName, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-[#646464] text-xs font-bold font-mono">+</span>}
                        <div className="inline-flex items-center gap-1 px-2.5 py-1  border border-[#1351AA] font-mono text-xs font-bold text-[#141414] group">
                          <span className="text-[#1351AA]">{keyName}</span>
                          <button
                            type="button"
                            onClick={() => removeKeyFromCombo(idx)}
                            className="text-[#646464] hover:text-[#141414] p-0.5 transition-colors cursor-pointer"
                            title={`Remove ${keyName}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </React.Fragment>
                    ))
                  )}
                </div>

                {recordedKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={clearShortcut}
                    title="Clear All Keys"
                    className="px-2 py-1 bg-[#EDECE8]/10 hover:bg-[#EDECE8]/20 text-[#141414] border border-[#C7C7C7]/20 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {/* Quick Modifier Toggle Badges */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E3E2DE] text-[10px] font-mono">
                <span className="text-[#646464] uppercase tracking-wider text-[9px]">Add Modifiers:</span>
                <div className="flex items-center gap-1.5">
                  {(['Ctrl', 'Shift', 'Alt', 'Win'] as const).map(mod => {
                    const isActive = recordedKeys.includes(mod);
                    return (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => toggleModifier(mod)}
                        className={`px-2 py-0.5 border font-bold text-[10px] transition-all cursor-pointer ${
 isActive
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA]'
 : 'bg-[#FFFFFF] text-[#444343] border-[#E3E2DE] hover:border-[#141414] hover:text-[#141414]'
 }`}
                      >
                        {isActive ? `✓ ${mod}` : `+ ${mod}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Presets Toolbar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#646464]">
                <span className="uppercase tracking-wider text-[9px] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#1351AA]" />
                  Popular Rotary Shortcuts:
                </span>
                <span className="text-[9px] text-[#646464]">1-click assign</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {contextualPresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p.keys, p.label, p.name)}
                    className="px-2 py-1 bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-[#E3E2DE] hover:border-[#141414] text-[#444343] hover:text-[#141414] text-[10px] font-mono whitespace-nowrap transition-all shrink-0 cursor-pointer active:scale-95"
                  >
                    <span className="font-bold text-[#1351AA]">{p.name}</span>
                    <span className="text-[#646464] ml-1 text-[9px]">({p.label})</span>
                  </button>
                ))}
                {SHORTCUT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p.keys, p.label, p.name)}
                    className="px-2 py-1 bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-[#E3E2DE] hover:border-[#C7C7C7] text-[#444343] hover:text-[#141414] text-[10px] font-mono whitespace-nowrap transition-all shrink-0 cursor-pointer active:scale-95"
                  >
                    <span>{p.name}</span>
                    <span className="text-[#646464] ml-1 text-[9px]">({p.label})</span>
                  </button>
                ))}
              </div>
            </div>



            {/* Quick Media Keys */}
            <div>
              <label className="text-[10px] font-mono text-[#646464] uppercase block mb-1">
                Media Hotkeys
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {DRAWER_MEDIA_KEYS.map((m) => {
                  const isSelected = recordedKeys.includes(m.key) || recordedKeys.includes(m.name);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleVirtualKeyClick(m.key)}
                      className={`py-1.5 px-1 border text-center font-mono text-[10px] transition-all truncate cursor-pointer ${
 isSelected
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA] font-bold '
 : 'bg-[#FFFFFF] text-[#444343] border-[#E3E2DE] hover:border-[#141414] hover:bg-[#FFFFFF]'
 }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>


          </div>

      </div>

      {/* FOOTER SAVE BAR */}
      <div className="p-3 border-t border-[#E3E2DE] bg-[#FFFFFF] flex items-center justify-between shrink-0">
        <div className="text-[10px] font-mono text-[#646464]">
          Configuring <span className="text-[#141414] font-bold">{activeKeyMeta.badge}</span> on {`Layer ${activeChannel}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-[#E3E2DE] hover:bg-[#EDECE8] text-[#444343] hover:text-[#141414] font-mono text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 bg-[#1351AA] hover:bg-[#1351AA] text-[#E3E2DE] font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Save Knob Bindings</span>
          </button>
        </div>
      </div>

    </div>
  );
};
