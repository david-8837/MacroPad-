import React, { useState, useEffect } from 'react';
import { KeyBinding, ActionDefinition } from '../types';
import { playKeyClick } from '../utils/soundEffects';
import { 
  X, 
  Play, 
  Check, 
  CircleDot, 
  Keyboard as KeyboardIcon, 
  Type, 
  Trash2,
  Sparkles
} from 'lucide-react';

interface KeyConfigModalProps {
  keyBinding: KeyBinding;
  onSave: (updated: KeyBinding) => void;
  onClose: () => void;
  onTestAction: (action: ActionDefinition) => void;
}

export interface ModalKeyDef {
  code: string;
  label: string;
  subLabel?: string;
  width?: number; // In units (1u = 28px)
}

// 15u ALPHANUMERIC CLUSTER
const MODAL_MAIN_ROW_0: ModalKeyDef[] = [
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

const MODAL_MAIN_ROW_1: ModalKeyDef[] = [
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

const MODAL_MAIN_ROW_2: ModalKeyDef[] = [
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

const MODAL_MAIN_ROW_3: ModalKeyDef[] = [
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

const MODAL_MAIN_ROW_4: ModalKeyDef[] = [
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

const MODAL_MAIN_ROW_5: ModalKeyDef[] = [
  { code: 'ControlLeft', label: 'Ctrl', width: 1.25 },
  { code: 'MetaLeft', label: 'Win', width: 1.25 },
  { code: 'AltLeft', label: 'Alt', width: 1.25 },
  { code: 'Space', label: 'Space', width: 6.25 },
  { code: 'AltRight', label: 'Alt', width: 1.25 },
  { code: 'MetaRight', label: 'Win', width: 1.25 },
  { code: 'ContextMenu', label: 'Menu', width: 1.25 },
  { code: 'ControlRight', label: 'Ctrl', width: 1.25 },
];

// NAVIGATION & ARROWS
const MODAL_NAV_ROW_0: ModalKeyDef[] = [
  { code: 'PrintScreen', label: 'PrtSc', width: 1 },
  { code: 'ScrollLock', label: 'ScrLk', width: 1 },
  { code: 'Pause', label: 'Pause', width: 1 },
];

const MODAL_NAV_ROW_1: ModalKeyDef[] = [
  { code: 'Insert', label: 'Ins', width: 1 },
  { code: 'Home', label: 'Home', width: 1 },
  { code: 'PageUp', label: 'PgUp', width: 1 },
];

const MODAL_NAV_ROW_2: ModalKeyDef[] = [
  { code: 'Delete', label: 'Del', width: 1 },
  { code: 'End', label: 'End', width: 1 },
  { code: 'PageDown', label: 'PgDn', width: 1 },
];

const MODAL_ARROW_ROW_4: ModalKeyDef[] = [
  { code: 'spacer-1', label: '', width: 1 },
  { code: 'ArrowUp', label: '▲', width: 1 },
  { code: 'spacer-1b', label: '', width: 1 },
];

const MODAL_ARROW_ROW_5: ModalKeyDef[] = [
  { code: 'ArrowLeft', label: '◀', width: 1 },
  { code: 'ArrowDown', label: '▼', width: 1 },
  { code: 'ArrowRight', label: '▶', width: 1 },
];

// NUMPAD GRID
const MODAL_NUMPAD_ROW_0: ModalKeyDef[] = [
  { code: 'Calc', label: 'Calc', width: 1 },
  { code: 'AudioVolumeMute', label: 'Mute', width: 1 },
  { code: 'AudioVolumeDown', label: 'Vol-', width: 1 },
  { code: 'AudioVolumeUp', label: 'Vol+', width: 1 },
];

const MODAL_NUMPAD_GRID: (ModalKeyDef & { gridArea: string })[] = [
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

const MEDIA_KEYS = [
  { name: 'Vol Up', key: 'VolumeUp' },
  { name: 'Vol Down', key: 'VolumeDown' },
  { name: 'Mute', key: 'VolumeMute' },
  { name: 'Play/Pause', key: 'MediaPlayPause' },
  { name: 'Next Track', key: 'MediaNext' },
  { name: 'Prev Track', key: 'MediaPrev' },
];

export const KeyConfigModal: React.FC<KeyConfigModalProps> = ({
  keyBinding,
  onSave,
  onClose,
  onTestAction,
}) => {
  const [editedKey, setEditedKey] = useState<KeyBinding>({ ...keyBinding });
  const [activeTab, setActiveTab] = useState<'keyboard' | 'text' | 'modtap'>('keyboard');
  
  // Macro Recorder & Shortcut State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>(
    editedKey.tapAction?.payload?.keys || ['Ctrl', 'C']
  );
  const [textSnippet, setTextSnippet] = useState(
    editedKey.tapAction?.payload?.command || ''
  );

  // Checks if a visual key item matches any key in recordedKeys
  const isKeyActive = (k: ModalKeyDef, keys: string[]) => {
    return keys.some(recorded => {
      if (recorded === k.code || recorded === k.label) return true;
      if (k.code.startsWith('Key') && recorded.toUpperCase() === k.code.replace('Key', '').toUpperCase()) return true;
      if (k.code.startsWith('Digit') && recorded === k.code.replace('Digit', '')) return true;
      if ((k.code === 'ControlLeft' || k.code === 'ControlRight') && (recorded === 'Ctrl' || recorded === 'Control')) return true;
      if ((k.code === 'ShiftLeft' || k.code === 'ShiftRight') && recorded === 'Shift') return true;
      if ((k.code === 'AltLeft' || k.code === 'AltRight') && recorded === 'Alt') return true;
      if ((k.code === 'MetaLeft' || k.code === 'MetaRight') && (recorded === 'Win' || recorded === 'Meta')) return true;
      if (k.code === 'Escape' && (recorded === 'Esc' || recorded === 'Escape')) return true;
      if (k.code === 'ArrowUp' && (recorded === '▲' || recorded === 'ArrowUp' || recorded === 'Up')) return true;
      if (k.code === 'ArrowDown' && (recorded === '▼' || recorded === 'ArrowDown' || recorded === 'Down')) return true;
      if (k.code === 'ArrowLeft' && (recorded === '◀' || recorded === 'ArrowLeft' || recorded === 'Left')) return true;
      if (k.code === 'ArrowRight' && (recorded === '▶' || recorded === 'ArrowRight' || recorded === 'Right')) return true;
      if (k.code.startsWith('Numpad')) {
        const sub = k.code.replace('Numpad', '');
        return recorded === k.code || recorded === sub || recorded === `Num ${sub}` || recorded === `NumPad${sub}`;
      }
      return false;
    });
  };

  // Physical keyboard typing listener - Active when in keyboard tab OR when recording
  useEffect(() => {
    if (!isRecording && activeTab !== 'keyboard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      playKeyClick('down');

      const pressed: string[] = [];
      if (e.ctrlKey) pressed.push('Ctrl');
      if (e.shiftKey) pressed.push('Shift');
      if (e.altKey) pressed.push('Alt');
      if (e.metaKey) pressed.push('Win');

      let primaryKey = e.key;
      // Normalization of key names
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
      } else if (primaryKey === 'Escape') {
        primaryKey = 'Esc';
      } else if (['Control', 'Shift', 'Alt', 'Meta'].includes(primaryKey)) {
        primaryKey = ''; // Handled by modifiers above
      } else if (primaryKey.length === 1) {
        primaryKey = primaryKey.toUpperCase();
      }

      if (primaryKey && !pressed.includes(primaryKey)) {
        pressed.push(primaryKey);
      }

      if (pressed.length > 0) {
        setRecordedKeys(pressed);
        const comboString = pressed.join(' + ');
        setEditedKey(prev => ({
          ...prev,
          label: pressed[pressed.length - 1] || 'Key',
          sublabel: comboString,
          tapAction: {
            id: `act-${Date.now()}`,
            category: 'hotkey',
            name: `Shortcut: ${comboString}`,
            payload: { keys: pressed }
          }
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecording, activeTab]);

  // Click on visual keyboard key
  const handleVirtualKeyClick = (keyName: string) => {
    if (!keyName) return;
    playKeyClick('down');
    setRecordedKeys(prev => {
      const next = prev.includes(keyName) 
        ? prev.filter(k => k !== keyName) 
        : [...prev, keyName];
      
      const keyString = next.join(' + ');
      setEditedKey(prevKey => ({
        ...prevKey,
        label: next[next.length - 1] || 'Key',
        sublabel: keyString,
        tapAction: {
          id: `act-${Date.now()}`,
          category: 'hotkey',
          name: `Shortcut: ${keyString}`,
          payload: { keys: next }
        }
      }));

      return next;
    });
  };

  const clearShortcut = () => {
    setRecordedKeys([]);
    setEditedKey(prev => ({
      ...prev,
      sublabel: '',
      tapAction: null
    }));
  };

  // Save handler
  const handleSave = () => {
    // If text snippet was edited in text tab
    if (activeTab === 'text' && textSnippet) {
      editedKey.tapAction = {
        id: `text-${Date.now()}`,
        category: 'script',
        name: `Type: "${textSnippet.slice(0, 15)}..."`,
        payload: { command: textSnippet }
      };
      editedKey.label = textSnippet.slice(0, 8);
      editedKey.sublabel = 'Text Macro';
    }

    onSave(editedKey);
    onClose();
  };

  // Helper to render a keycap button
  const renderModalKey = (k: ModalKeyDef, customHeight = '28px') => {
    if (k.code.startsWith('spacer-')) {
      const uWidth = (k.width || 1) * 28;
      return <div key={k.code} style={{ width: `${uWidth}px` }} className="pointer-events-none" />;
    }

    const isSelected = isKeyActive(k, recordedKeys);
    const uWidth = (k.width || 1) * 28;

    return (
      <button
        key={k.code}
        type="button"
        onClick={() => handleVirtualKeyClick(k.label || k.code)}
        style={{
          width: `${uWidth}px`,
          height: customHeight
        }}
        className={`rounded flex flex-col items-center justify-between p-0.5 font-mono text-[9px] font-bold border transition-all select-none ${
          isSelected
            ? 'bg-[#FF5E00] text-black border-[#FF5E00] font-bold shadow-[0_0_12px_#FF5E00] scale-95 z-10'
            : 'bg-[#151923] text-white/70 border-white/10 hover:border-white/40 hover:bg-[#1E2330] hover:text-white'
        }`}
      >
        <span className="truncate leading-tight px-0.5">{k.label}</span>
        {k.subLabel && <span className="text-[7px] text-white/40 leading-none">{k.subLabel}</span>}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-[#13161F] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-[#181C26]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-sm text-black shadow-xs"
              style={{ backgroundColor: editedKey.accentColor || '#FF5E00' }}
            >
              #{editedKey.keyIndex + 1}
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">
                Assign Switch #{editedKey.keyIndex + 1}
              </h3>
              <p className="text-xs text-white/50">
                Full-Size Keyboard Picker • Live Typing Detection • Text Typer • Safety Locks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="flex px-5 border-b border-white/10 bg-[#10131B] text-xs font-mono">
          <button
            onClick={() => { setActiveTab('keyboard'); setIsRecording(false); }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'keyboard'
                ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <KeyboardIcon className="w-3.5 h-3.5" />
            1. Keyboard Picker (Full Size)
          </button>

          <button
            onClick={() => { setActiveTab('text'); setIsRecording(false); }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'text'
                ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            2. Text Typer
          </button>

        </div>

        {/* Tab Body Content */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
          
          {/* TAB 1: FULL SIZE KEYBOARD PICKER & LIVE TYPING */}
          {activeTab === 'keyboard' && (
            <div className="space-y-3">
              {/* Active Shortcut Preview Bar */}
              <div className="p-3 bg-[#0B0D13] rounded-xl border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-ping" />
                  <span className="text-xs font-mono text-[#38EF7D] font-bold uppercase tracking-wider">
                    Live Keyboard Listener:
                  </span>
                  <span className="text-xs text-white/60">
                    Press any keys on your physical keyboard or click keys below:
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#181C26] border border-white/20 font-mono text-xs font-bold text-[#FF5E00]">
                    {recordedKeys.length === 0 ? (
                      <span className="text-white/30 italic">None</span>
                    ) : (
                      recordedKeys.join(' + ')
                    )}
                  </div>
                  {recordedKeys.length > 0 && (
                    <button
                      type="button"
                      onClick={clearShortcut}
                      title="Clear Shortcut Combo"
                      className="text-white/40 hover:text-red-400 p-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* VISUAL FULL SIZE KEYBOARD */}
              <div className="p-3 bg-[#080A0E] rounded-xl border border-white/10 shadow-inner overflow-x-auto select-none flex justify-center">
                <div className="inline-flex gap-3">
                  
                  {/* ALPHANUMERIC CLUSTER */}
                  <div className="space-y-[3px]">
                    {/* Function Row */}
                    <div className="flex gap-[3px] mb-1.5">
                      {MODAL_MAIN_ROW_0.map(k => renderModalKey(k))}
                    </div>

                    {/* Number Row */}
                    <div className="flex gap-[3px]">
                      {MODAL_MAIN_ROW_1.map(k => renderModalKey(k))}
                    </div>

                    {/* QWERTY Row */}
                    <div className="flex gap-[3px]">
                      {MODAL_MAIN_ROW_2.map(k => renderModalKey(k))}
                    </div>

                    {/* Home Row */}
                    <div className="flex gap-[3px]">
                      {MODAL_MAIN_ROW_3.map(k => renderModalKey(k))}
                    </div>

                    {/* Shift Row */}
                    <div className="flex gap-[3px]">
                      {MODAL_MAIN_ROW_4.map(k => renderModalKey(k))}
                    </div>

                    {/* Bottom Space Row */}
                    <div className="flex gap-[3px]">
                      {MODAL_MAIN_ROW_5.map(k => renderModalKey(k))}
                    </div>
                  </div>

                  {/* NAVIGATION & ARROWS CLUSTER */}
                  <div className="space-y-[3px] flex flex-col justify-between">
                    {/* PrtSc, ScrLk, Pause */}
                    <div className="flex gap-[3px] mb-1.5">
                      {MODAL_NAV_ROW_0.map(k => renderModalKey(k))}
                    </div>

                    {/* Ins, Home, PgUp */}
                    <div className="flex gap-[3px]">
                      {MODAL_NAV_ROW_1.map(k => renderModalKey(k))}
                    </div>

                    {/* Del, End, PgDn */}
                    <div className="flex gap-[3px]">
                      {MODAL_NAV_ROW_2.map(k => renderModalKey(k))}
                    </div>

                    {/* Blank spacer */}
                    <div className="h-[28px]" />

                    {/* Up Arrow */}
                    <div className="flex gap-[3px]">
                      {MODAL_ARROW_ROW_4.map(k => renderModalKey(k))}
                    </div>

                    {/* Left, Down, Right Arrow */}
                    <div className="flex gap-[3px]">
                      {MODAL_ARROW_ROW_5.map(k => renderModalKey(k))}
                    </div>
                  </div>

                  {/* FULL NUMPAD CLUSTER */}
                  <div className="space-y-[3px]">
                    {/* Media Row 0 */}
                    <div className="flex gap-[3px] mb-1.5">
                      {MODAL_NUMPAD_ROW_0.map(k => renderModalKey(k))}
                    </div>

                    {/* 4x5 CSS Grid */}
                    <div
                      className="grid gap-[3px]"
                      style={{
                        gridTemplateColumns: 'repeat(4, 28px)',
                        gridTemplateRows: 'repeat(5, 28px)'
                      }}
                    >
                      {MODAL_NUMPAD_GRID.map(k => {
                        const isSelected = isKeyActive(k, recordedKeys);
                        return (
                          <button
                            key={k.code}
                            type="button"
                            onClick={() => handleVirtualKeyClick(k.label || k.code)}
                            style={{ gridArea: k.gridArea }}
                            className={`rounded flex flex-col items-center justify-between p-0.5 font-mono text-[9px] font-bold border transition-all select-none ${
                              isSelected
                                ? 'bg-[#FF5E00] text-black border-[#FF5E00] font-bold shadow-[0_0_12px_#FF5E00] scale-95 z-10'
                                : 'bg-[#151923] text-white/70 border-white/10 hover:border-white/40 hover:bg-[#1E2330] hover:text-white'
                            }`}
                          >
                            <span className="truncate leading-none">{k.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              {/* Media & Hotkey Shortcuts Row */}
              <div className="pt-1">
                <label className="text-[10px] font-mono text-white/40 uppercase block mb-1">
                  Media & Playback Hotkeys
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {MEDIA_KEYS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleVirtualKeyClick(m.name)}
                      className={`py-1.5 px-2 rounded-lg border text-center font-mono text-xs transition-colors ${
                        recordedKeys.includes(m.name)
                          ? 'bg-[#FF5E00] text-black border-[#FF5E00] font-bold'
                          : 'bg-[#141824] text-white/80 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TEXT SNIPPET MACRO */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <div className="text-xs text-white/60">
                Enter any text string, email, or script command to be typed out automatically when pressing this switch:
              </div>

              <textarea
                rows={4}
                value={textSnippet}
                onChange={(e) => setTextSnippet(e.target.value)}
                placeholder="e.g. Hello world! Or git status && git log -n 5"
                className="w-full p-3 rounded-xl bg-[#0B0D13] border border-white/10 text-white font-mono text-xs focus:border-[#FF5E00] focus:outline-hidden"
              />

              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <Check className="w-3.5 h-3.5 text-[#38EF7D]" />
                <span>Text is typed with simulated keystrokes directly into active application.</span>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between bg-[#181C26]">
          <button
            type="button"
            onClick={() => {
              if (editedKey.tapAction) {
                onTestAction(editedKey.tapAction);
              }
            }}
            className="flex items-center gap-1.5 text-xs text-[#38EF7D] hover:underline font-mono"
          >
            <Play className="w-3.5 h-3.5" /> Test Key Action
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-[#FF5E00] text-black text-xs font-bold hover:bg-[#FF6A00] flex items-center gap-1.5 shadow-md transition-transform active:scale-95"
            >
              <Check className="w-3.5 h-3.5" /> Save Switch Config
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
