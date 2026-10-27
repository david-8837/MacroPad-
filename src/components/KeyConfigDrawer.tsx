import React, { useState, useEffect } from 'react';
import { KeyBinding, ActionDefinition, DiscoveredApp } from '../types';
import { playKeyClick } from '../utils/soundEffects';
import { 
  X, 
  Play, 
  ShieldAlert, 
  Check, 
  CircleDot, 
  Keyboard as KeyboardIcon, 
  Type, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Command,
  Sliders,
  Layers,
  Search,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Monitor,
  CheckCircle2,
  Zap,
} from 'lucide-react';

interface KeyConfigDrawerProps {
  keyBinding: KeyBinding;
  totalKeys?: number;
  onSelectKeyIndex?: (idx: number) => void;
  onSave: (updated: KeyBinding) => void;
  onClose: () => void;
  onTestAction: (action: ActionDefinition) => void;
}

export interface DrawerKeyDef {
  code: string;
  label: string;
  subLabel?: string;
  width?: number; // In units (1u = 20.5px)
}

// 15u ALPHANUMERIC CLUSTER
export const DRAWER_MAIN_ROW_0: DrawerKeyDef[] = [
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

export const DRAWER_MAIN_ROW_1: DrawerKeyDef[] = [
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
  { code: 'Backspace', label: '⌫', width: 2 },
];

export const DRAWER_MAIN_ROW_2: DrawerKeyDef[] = [
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

export const DRAWER_MAIN_ROW_3: DrawerKeyDef[] = [
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

export const DRAWER_MAIN_ROW_4: DrawerKeyDef[] = [
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

export const DRAWER_MAIN_ROW_5: DrawerKeyDef[] = [
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
export const DRAWER_NAV_ROW_0: DrawerKeyDef[] = [
  { code: 'PrintScreen', label: 'PrtSc', width: 1 },
  { code: 'ScrollLock', label: 'ScrLk', width: 1 },
  { code: 'Pause', label: 'Pause', width: 1 },
];

export const DRAWER_NAV_ROW_1: DrawerKeyDef[] = [
  { code: 'Insert', label: 'Ins', width: 1 },
  { code: 'Home', label: 'Home', width: 1 },
  { code: 'PageUp', label: 'PgUp', width: 1 },
];

export const DRAWER_NAV_ROW_2: DrawerKeyDef[] = [
  { code: 'Delete', label: 'Del', width: 1 },
  { code: 'End', label: 'End', width: 1 },
  { code: 'PageDown', label: 'PgDn', width: 1 },
];

export const DRAWER_ARROW_ROW_4: DrawerKeyDef[] = [
  { code: 'spacer-1', label: '', width: 1 },
  { code: 'ArrowUp', label: '▲', width: 1 },
  { code: 'spacer-1b', label: '', width: 1 },
];

export const DRAWER_ARROW_ROW_5: DrawerKeyDef[] = [
  { code: 'ArrowLeft', label: '◀', width: 1 },
  { code: 'ArrowDown', label: '▼', width: 1 },
  { code: 'ArrowRight', label: '▶', width: 1 },
];

// NUMPAD GRID
export const DRAWER_NUMPAD_ROW_0: DrawerKeyDef[] = [
  { code: 'Calc', label: 'Calc', width: 1 },
  { code: 'AudioVolumeMute', label: 'Mute', width: 1 },
  { code: 'AudioVolumeDown', label: 'Vol-', width: 1 },
  { code: 'AudioVolumeUp', label: 'Vol+', width: 1 },
];

export const DRAWER_NUMPAD_GRID: (DrawerKeyDef & { gridArea: string })[] = [
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

export const DRAWER_MEDIA_KEYS = [
  { name: 'Vol Up', key: 'AudioVolumeUp' },
  { name: 'Vol Down', key: 'AudioVolumeDown' },
  { name: 'Mute', key: 'AudioVolumeMute' },
  { name: 'Play/Pause', key: 'MediaPlayPause' },
  { name: 'Next Track', key: 'MediaNext' },
  { name: 'Prev Track', key: 'MediaPrev' },
];

export const SHORTCUT_PRESETS = [
  { name: 'Copy', keys: ['Ctrl', 'C'], label: 'Ctrl+C' },
  { name: 'Paste', keys: ['Ctrl', 'V'], label: 'Ctrl+V' },
  { name: 'Undo', keys: ['Ctrl', 'Z'], label: 'Ctrl+Z' },
  { name: 'Redo', keys: ['Ctrl', 'Y'], label: 'Ctrl+Y' },
  { name: 'Hyperlink', keys: ['Ctrl', 'K'], label: 'Link' },
  { name: 'Blender Edit', keys: ['Tab'], label: 'Tab' },
  { name: 'Blender Render', keys: ['F12'], label: 'F12' },
  { name: 'DaVinci Cut', keys: ['Ctrl', 'B'], label: 'Cut' },
  { name: 'Ripple Delete', keys: ['Shift', 'Backspace'], label: 'RipDel' },
  { name: 'Fusion Extrude', keys: ['E'], label: 'Extrude' },
  { name: 'Fusion Sketch', keys: ['S'], label: 'Sketch' },
  { name: 'Figma AutoLayout', keys: ['Shift', 'A'], label: 'AutoLayout' },
  { name: 'Figma Frame', keys: ['F'], label: 'Frame' },
  { name: 'Canva Text', keys: ['T'], label: 'Text' },
  { name: 'Canva Present', keys: ['Ctrl', 'Alt', 'P'], label: 'Present' },
  { name: 'Snip', keys: ['Win', 'Shift', 'S'], label: 'Snip' },
  { name: 'Task Mgr', keys: ['Ctrl', 'Shift', 'Esc'], label: 'TaskMgr' },
  { name: 'Desktop', keys: ['Win', 'D'], label: 'Win+D' },
];

export const KeyConfigDrawer: React.FC<KeyConfigDrawerProps> = ({
  keyBinding,
  totalKeys = 9,
  onSelectKeyIndex,
  onSave,
  onClose,
  onTestAction,
}) => {
  const [editedKey, setEditedKey] = useState<KeyBinding>({ ...keyBinding });
  const [activeTab, setActiveTab] = useState<'keyboard' | 'recorder' | 'text' | 'safety' | 'app'>(
    keyBinding.tapAction?.category === 'app_launch' ? 'app' : 'keyboard'
  );
  const [keyboardLayout, setKeyboardLayout] = useState<'full' | 'tkl' | '60'>('full');
  
  // Shortcut & Multi-Key Mode State
  // 'append': every key click/press adds to the combo without wiping existing keys
  // 'chord': live chord replace mode
  const [comboMode, setComboMode] = useState<'append' | 'chord'>('append');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>(
    editedKey.tapAction?.payload?.keys || ['Ctrl', 'C']
  );
  const [textSnippet, setTextSnippet] = useState(
    editedKey.tapAction?.payload?.command || ''
  );

  // App Launcher Drawer State
  const [drawerApps, setDrawerApps] = useState<DiscoveredApp[]>(() => {
    try {
      const raw = localStorage.getItem('kadowaz_app_library');
      if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return [];
  });
  const [drawerAppSearch, setDrawerAppSearch] = useState('');
  const [drawerAppCategory, setDrawerAppCategory] = useState('all');
  const [selectedDrawerApp, setSelectedDrawerApp] = useState<DiscoveredApp | null>(null);
  const [appCustomLabel, setAppCustomLabel] = useState(
    editedKey.tapAction?.category === 'app_launch' ? (editedKey.label || '') : ''
  );
  const [appCustomArgs, setAppCustomArgs] = useState(
    editedKey.tapAction?.category === 'app_launch' ? (editedKey.tapAction.payload?.launchArgs || '') : ''
  );
  const [appFocusExisting, setAppFocusExisting] = useState(
    editedKey.tapAction?.category === 'app_launch' ? Boolean(editedKey.tapAction.payload?.focusExisting) : false
  );
  const [appLaunchMinimized, setAppLaunchMinimized] = useState(
    editedKey.tapAction?.category === 'app_launch' ? Boolean(editedKey.tapAction.payload?.launchMinimized) : false
  );
  const [isScanningDrawerApps, setIsScanningDrawerApps] = useState(false);

  // Sync state if active keyBinding changes from outside (e.g. clicking another key on 3x3 macropad)
  useEffect(() => {
    setEditedKey({ ...keyBinding });
    setRecordedKeys(keyBinding.tapAction?.payload?.keys || [keyBinding.label || 'Space']);
    setTextSnippet(keyBinding.tapAction?.payload?.command || '');
    if (keyBinding.tapAction?.category === 'app_launch') {
      setActiveTab('app');
      setAppCustomLabel(keyBinding.label || keyBinding.tapAction.payload?.appName || '');
      setAppCustomArgs(keyBinding.tapAction.payload?.launchArgs || '');
      setAppFocusExisting(Boolean(keyBinding.tapAction.payload?.focusExisting));
      setAppLaunchMinimized(Boolean(keyBinding.tapAction.payload?.launchMinimized));
    }
  }, [keyBinding.keyIndex]);

  // Load apps if not loaded
  useEffect(() => {
    if (drawerApps.length === 0 && typeof window !== 'undefined' && (window as any).electronAPI?.discoverApps) {
      setIsScanningDrawerApps(true);
      (window as any).electronAPI.discoverApps()
        .then((discovered: DiscoveredApp[]) => {
          setDrawerApps(discovered);
          localStorage.setItem('kadowaz_app_library', JSON.stringify(discovered));
        })
        .catch(() => {})
        .finally(() => setIsScanningDrawerApps(false));
    }
  }, []);

  // Base unit sizing for perfect fit without horizontal scrolling
  const UNIT_WIDTH = 20.5; // px per 1u
  const UNIT_HEIGHT = 22; // px per row

  // Checks if a visual key item matches any key in recordedKeys
  const isKeyActive = (k: DrawerKeyDef, keys: string[]) => {
    return keys.some(recorded => {
      if (!recorded) return false;
      if (recorded === k.code || recorded === k.label) return true;
      if (k.code.startsWith('Key') && recorded.toUpperCase() === k.code.replace('Key', '').toUpperCase()) return true;
      if (k.code.startsWith('Digit') && recorded === k.code.replace('Digit', '')) return true;
      if ((k.code === 'ControlLeft' || k.code === 'ControlRight') && (recorded === 'Ctrl' || recorded === 'Control')) return true;
      if ((k.code === 'ShiftLeft' || k.code === 'ShiftRight') && recorded === 'Shift') return true;
      if ((k.code === 'AltLeft' || k.code === 'AltRight') && recorded === 'Alt') return true;
      if ((k.code === 'MetaLeft' || k.code === 'MetaRight') && (recorded === 'Win' || recorded === 'Meta')) return true;
      if (k.code === 'Escape' && (recorded === 'Esc' || recorded === 'Escape')) return true;
      if (k.code === 'Backspace' && (recorded === '⌫' || recorded === 'Backspace')) return true;
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

  // Helper to commit updated key sequence to editedKey and parent state
  const commitUpdatedKeys = (newKeys: string[]) => {
    const comboString = newKeys.join(' + ');
    let smartLabel = newKeys.join('+');
    if (smartLabel.length > 10) {
      smartLabel = newKeys[newKeys.length - 1] || 'Key';
    }
    const updated: KeyBinding = {
      ...editedKey,
      label: newKeys.length > 0 ? (editedKey.label && !editedKey.label.includes('+') && editedKey.label !== 'Space' ? editedKey.label : smartLabel) : 'Empty',
      sublabel: comboString || 'Unassigned',
      tapAction: newKeys.length > 0 ? {
        id: `act-${Date.now()}`,
        category: 'hotkey' as const,
        name: `Shortcut: ${comboString}`,
        payload: { keys: newKeys }
      } : null
    };
    setEditedKey(updated);
    onSave(updated);
  };

  // Live Physical Keyboard Typing Listener
  useEffect(() => {
    if (!isRecording && activeTab !== 'keyboard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      playKeyClick('down');

      // Backspace: in append mode, remove the last key from the combo
      if (e.key === 'Backspace') {
        setRecordedKeys(prev => {
          if (prev.length === 0) return prev;
          const next = prev.slice(0, -1);
          commitUpdatedKeys(next);
          return next;
        });
        return;
      }

      // Escape: clear all recorded keys
      if (e.key === 'Escape') {
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
      } else if (primaryKey.length === 1) {
        primaryKey = primaryKey.toUpperCase();
      }

      if (primaryKey && !detectedKeys.includes(primaryKey)) {
        detectedKeys.push(primaryKey);
      }

      if (detectedKeys.length === 0) return;

      setRecordedKeys(prev => {
        let next: string[];
        if (comboMode === 'chord') {
          // Chord mode: replace combo with current simultaneous chord
          next = detectedKeys;
        } else {
          // Append mode: accumulate keys sequentially without removing previous keys!
          next = [...prev];
          for (const k of detectedKeys) {
            if (!next.includes(k)) {
              next.push(k);
            }
          }
        }
        commitUpdatedKeys(next);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isRecording, activeTab, editedKey, comboMode, recordedKeys.length]);

  // Handle clicking on virtual keyboard key
  const handleVirtualKeyClick = (keyName: string) => {
    if (!keyName) return;
    playKeyClick('down');
    
    setRecordedKeys(prev => {
      let next: string[];
      if (comboMode === 'chord') {
        next = [keyName];
      } else {
        // In append mode: toggle clicked key (add if not present, remove if already present)
        next = prev.includes(keyName) 
          ? prev.filter(k => k !== keyName) 
          : [...prev, keyName];
      }
      
      commitUpdatedKeys(next);
      return next;
    });
  };

  // Remove individual key badge from combo
  const removeKeyFromCombo = (indexToRemove: number) => {
    playKeyClick('up');
    setRecordedKeys(prev => {
      const next = prev.filter((_, i) => i !== indexToRemove);
      commitUpdatedKeys(next);
      return next;
    });
  };

  // Toggle quick modifier (Ctrl, Shift, Alt, Win)
  const toggleModifier = (mod: 'Ctrl' | 'Shift' | 'Alt' | 'Win') => {
    playKeyClick('down');
    setRecordedKeys(prev => {
      const next = prev.includes(mod) 
        ? prev.filter(k => k !== mod) 
        : [mod, ...prev]; // modifiers at front
      commitUpdatedKeys(next);
      return next;
    });
  };

  // Apply full preset shortcut combo
  const applyPreset = (presetKeys: string[], defaultLabel: string, defaultName: string) => {
    playKeyClick('down');
    setRecordedKeys(presetKeys);
    const updated: KeyBinding = {
      ...editedKey,
      label: defaultLabel,
      sublabel: defaultName,
      tapAction: {
        id: `act-${Date.now()}`,
        category: 'hotkey' as const,
        name: `${defaultName} (${presetKeys.join(' + ')})`,
        payload: { keys: presetKeys }
      }
    };
    setEditedKey(updated);
    onSave(updated);
  };

  const clearShortcut = () => {
    playKeyClick('up');
    setRecordedKeys([]);
    const updated: KeyBinding = {
      ...editedKey,
      label: 'Empty',
      sublabel: 'Unassigned',
      tapAction: null
    };
    setEditedKey(updated);
    onSave(updated);
  };

  const handleManualSave = () => {
    if (activeTab === 'text' && textSnippet) {
      const updated = {
        ...editedKey,
        tapAction: {
          id: `text-${Date.now()}`,
          category: 'script' as const,
          name: `Type: "${textSnippet.slice(0, 15)}..."`,
          payload: { command: textSnippet }
        },
        label: textSnippet.slice(0, 8),
        sublabel: 'Text Macro'
      };
      setEditedKey(updated);
      onSave(updated);
    } else {
      onSave(editedKey);
    }
    onClose();
  };

  const renderDrawerKey = (k: DrawerKeyDef, customHeight = `${UNIT_HEIGHT}px`) => {
    if (k.code.startsWith('spacer-')) {
      const uWidth = (k.width || 1) * UNIT_WIDTH;
      return <div key={k.code} style={{ width: `${uWidth}px` }} className="pointer-events-none shrink-0" />;
    }

    const isSelected = isKeyActive(k, recordedKeys);
    const uWidth = (k.width || 1) * UNIT_WIDTH;

    return (
      <button
        key={k.code}
        type="button"
        onClick={() => handleVirtualKeyClick(k.label || k.code)}
        style={{
          width: `${uWidth}px`,
          height: customHeight
        }}
        className={`rounded flex flex-col items-center justify-between p-0.5 font-mono text-[8.5px] font-bold border transition-all select-none shrink-0 cursor-pointer ${
          isSelected
            ? 'bg-gradient-to-b from-[#FF7A1A] to-[#E65100] text-black border-[#FF9100] font-black shadow-[0_0_12px_rgba(255,94,0,0.7)] scale-95 z-10'
            : 'bg-gradient-to-b from-[#181C26] to-[#11141C] text-white/80 border-white/10 hover:border-white/40 hover:bg-[#202636] hover:text-white active:scale-95'
        }`}
      >
        <span className="truncate leading-tight px-0.2">{k.label}</span>
        {k.subLabel && (
          <span className={`text-[6px] leading-none ${isSelected ? 'text-black/70' : 'text-white/40'}`}>
            {k.subLabel}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-[#0F131D] to-[#0A0D14] border-l border-white/10 select-none overflow-hidden animate-in slide-in-from-right duration-200">
      
      {/* DRAWER TOP BAR: Switch Navigator & Direct Switch Selector */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-[#131722]/90 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Key Index Badge */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs text-black shadow-md shrink-0"
            style={{ backgroundColor: editedKey.accentColor || '#FF5E00' }}
          >
            #{editedKey.keyIndex + 1}
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-xs tracking-wide">
                SWITCH #{editedKey.keyIndex + 1}
              </span>
              <span className="text-[10px] text-white/50 font-mono truncate max-w-[120px]">
                ({editedKey.label || 'Empty'})
              </span>
            </div>
            <p className="text-[9.5px] text-white/40">
              Live Keymap • Click keys or type to build combo
            </p>
          </div>
        </div>

        {/* Quick Switch Switcher Pills (1 to 9) */}
        <div className="flex items-center gap-1">
          {onSelectKeyIndex && (
            <div className="hidden sm:flex items-center gap-0.5 bg-black/40 p-0.5 rounded-lg border border-white/10">
              {Array.from({ length: totalKeys }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectKeyIndex(idx)}
                  className={`w-5 h-5 rounded text-[10px] font-mono font-bold transition-all ${
                    idx === editedKey.keyIndex
                      ? 'bg-[#FF5E00] text-black shadow-xs'
                      : 'text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                  title={`Switch #${idx + 1}`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          )}

          {/* Switch Navigators + Close Drawer */}
          <div className="flex items-center gap-1">
            {onSelectKeyIndex && (
              <div className="flex items-center gap-0.5 bg-black/40 rounded-lg border border-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevIdx = (editedKey.keyIndex - 1 + totalKeys) % totalKeys;
                    onSelectKeyIndex(prevIdx);
                  }}
                  title="Previous Switch"
                  className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = (editedKey.keyIndex + 1) % totalKeys;
                    onSelectKeyIndex(nextIdx);
                  }}
                  title="Next Switch"
                  className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Close Drawer"
              className="w-7 h-7 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* FEATURE NAVIGATION TABS */}
      <div className="flex px-3 border-b border-white/10 bg-[#0E1119] text-xs font-mono shrink-0">
        <button
          onClick={() => { setActiveTab('keyboard'); setIsRecording(false); }}
          className={`py-2 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'keyboard'
              ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          <KeyboardIcon className="w-3.5 h-3.5" />
          1. Keyboard & Combos
        </button>

        <button
          onClick={() => { setActiveTab('recorder'); setIsRecording(false); }}
          className={`py-2 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'recorder'
              ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          <CircleDot className="w-3.5 h-3.5" />
          2. Recorder
        </button>

        <button
          onClick={() => { setActiveTab('text'); setIsRecording(false); }}
          className={`py-2 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'text'
              ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          3. Text Macro
        </button>

        <button
          onClick={() => { setActiveTab('safety'); setIsRecording(false); }}
          className={`py-2 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'safety'
              ? 'border-red-500 text-red-400 font-bold'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          4. Safety Hold
        </button>

        <button
          onClick={() => { setActiveTab('app'); setIsRecording(false); }}
          className={`py-2 px-2.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'app'
              ? 'border-[#FF5E00] text-[#FF5E00] font-bold'
              : 'border-transparent text-white/50 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          5. Open App
        </button>
      </div>

      {/* DRAWER BODY */}
      <div className="flex-1 p-3.5 overflow-y-auto space-y-3">

        {/* TAB 1: FULL SIZE KEYBOARD & MULTI-KEY COMBO BUILDER */}
        {activeTab === 'keyboard' && (
          <div className="space-y-3">
            
            {/* MULTI-KEY COMBO PILL BAR (Interactive Chips) */}
            <div className="p-3 bg-gradient-to-r from-[#0B0E16] via-[#101420] to-[#0B0E16] rounded-xl border border-white/10 shadow-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping shrink-0" />
                  <span className="text-[11px] font-mono text-[#38EF7D] font-bold tracking-wider">
                    COMBO BUILDER:
                  </span>
                  <span className="text-[10px] text-white/40 hidden sm:inline">
                    Click keys or type on your keyboard to add
                  </span>
                </div>

                {/* Input Mode Switch: Append vs Chord */}
                <div className="flex items-center gap-1 p-0.5 bg-black/50 rounded-lg border border-white/10 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setComboMode('append')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      comboMode === 'append'
                        ? 'bg-[#FF5E00] text-black font-extrabold shadow-xs'
                        : 'text-white/60 hover:text-white'
                    }`}
                    title="Append Mode: Click or type multiple keys to build sequence"
                  >
                    + Append Keys
                  </button>
                  <button
                    type="button"
                    onClick={() => setComboMode('chord')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      comboMode === 'chord'
                        ? 'bg-[#FF5E00] text-black font-extrabold shadow-xs'
                        : 'text-white/60 hover:text-white'
                    }`}
                    title="Chord Mode: Capture single simultaneous combination"
                  >
                    ⚡ Chord
                  </button>
                </div>
              </div>

              {/* Active Recorded Keys Interactive Pills */}
              <div className="min-h-[46px] p-2 bg-[#141824] rounded-lg border border-white/10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {recordedKeys.length === 0 ? (
                    <span className="text-white/30 text-xs italic font-mono pl-1">
                      No keys assigned — click any key below or type to add
                    </span>
                  ) : (
                    recordedKeys.map((keyName, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-white/40 text-xs font-bold font-mono">+</span>}
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-b from-[#242C3E] to-[#191F2D] border border-[#FF5E00]/50 font-mono text-xs font-bold text-white shadow-xs group">
                          <span className="text-[#FF7A1A]">{keyName}</span>
                          <button
                            type="button"
                            onClick={() => removeKeyFromCombo(idx)}
                            className="text-white/40 hover:text-red-400 p-0.5 rounded transition-colors cursor-pointer"
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
                    className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {/* Quick Modifier Toggle Badges */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-[10px] font-mono">
                <span className="text-white/40 uppercase tracking-wider text-[9px]">Add Modifiers:</span>
                <div className="flex items-center gap-1.5">
                  {(['Ctrl', 'Shift', 'Alt', 'Win'] as const).map(mod => {
                    const isActive = recordedKeys.includes(mod);
                    return (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => toggleModifier(mod)}
                        className={`px-2 py-0.5 rounded-md border font-bold text-[10px] transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#FF5E00] text-black border-[#FF9100] shadow-[0_0_8px_rgba(255,94,0,0.5)]'
                            : 'bg-[#181D2A] text-white/70 border-white/10 hover:border-white/30 hover:text-white'
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
              <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                <span className="uppercase tracking-wider text-[9px] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#FF5E00]" />
                  Popular Shortcuts:
                </span>
                <span className="text-[9px] text-white/30">1-click assign</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {SHORTCUT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPreset(p.keys, p.label, p.name)}
                    className="px-2 py-1 rounded-lg bg-[#141824] hover:bg-[#1E2436] border border-white/10 hover:border-[#FF5E00]/50 text-white/80 hover:text-white text-[10px] font-mono whitespace-nowrap transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                  >
                    <span className="font-bold text-[#FF5E00]">{p.name}</span>
                    <span className="text-white/40 ml-1 text-[9px]">({p.label})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Layout Switcher (Full Size / TKL / 60%) */}
            <div className="flex items-center justify-between text-[11px] font-mono pt-1">
              <span className="text-white/40 uppercase tracking-wider text-[9.5px]">Virtual Keyboard:</span>
              <div className="flex items-center gap-1 p-0.5 bg-black/40 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setKeyboardLayout('full')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                    keyboardLayout === 'full' ? 'bg-[#FF5E00] text-black font-bold' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Full 104
                </button>
                <button
                  type="button"
                  onClick={() => setKeyboardLayout('tkl')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                    keyboardLayout === 'tkl' ? 'bg-[#FF5E00] text-black font-bold' : 'text-white/60 hover:text-white'
                  }`}
                >
                  TKL
                </button>
                <button
                  type="button"
                  onClick={() => setKeyboardLayout('60')}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                    keyboardLayout === '60' ? 'bg-[#FF5E00] text-black font-bold' : 'text-white/60 hover:text-white'
                  }`}
                >
                  60%
                </button>
              </div>
            </div>

            {/* VISUAL KEYBOARD CONTAINER (Zero horizontal scrolling, perfect fit) */}
            <div className="p-2.5 bg-[#07090E] rounded-xl border border-white/10 shadow-inner overflow-x-hidden select-none">
              <div className="flex gap-2 justify-center">
                
                {/* ALPHANUMERIC 15u */}
                <div className="space-y-[1.5px] shrink-0">
                  {/* Function row */}
                  <div className="flex gap-[1.5px] mb-1">
                    {DRAWER_MAIN_ROW_0.map(k => renderDrawerKey(k))}
                  </div>

                  {/* Number row */}
                  <div className="flex gap-[1.5px]">
                    {DRAWER_MAIN_ROW_1.map(k => renderDrawerKey(k))}
                  </div>

                  {/* QWERTY row */}
                  <div className="flex gap-[1.5px]">
                    {DRAWER_MAIN_ROW_2.map(k => renderDrawerKey(k))}
                  </div>

                  {/* Home row */}
                  <div className="flex gap-[1.5px]">
                    {DRAWER_MAIN_ROW_3.map(k => renderDrawerKey(k))}
                  </div>

                  {/* Shift row */}
                  <div className="flex gap-[1.5px]">
                    {DRAWER_MAIN_ROW_4.map(k => renderDrawerKey(k))}
                  </div>

                  {/* Bottom Space row */}
                  <div className="flex gap-[1.5px]">
                    {DRAWER_MAIN_ROW_5.map(k => renderDrawerKey(k))}
                  </div>
                </div>

                {/* NAVIGATION & ARROWS */}
                {keyboardLayout !== '60' && (
                  <div className="space-y-[1.5px] flex flex-col justify-between shrink-0">
                    <div className="flex gap-[1.5px] mb-1">
                      {DRAWER_NAV_ROW_0.map(k => renderDrawerKey(k))}
                    </div>
                    <div className="flex gap-[1.5px]">
                      {DRAWER_NAV_ROW_1.map(k => renderDrawerKey(k))}
                    </div>
                    <div className="flex gap-[1.5px]">
                      {DRAWER_NAV_ROW_2.map(k => renderDrawerKey(k))}
                    </div>
                    <div className="h-[22px]" />
                    <div className="flex gap-[1.5px]">
                      {DRAWER_ARROW_ROW_4.map(k => renderDrawerKey(k))}
                    </div>
                    <div className="flex gap-[1.5px]">
                      {DRAWER_ARROW_ROW_5.map(k => renderDrawerKey(k))}
                    </div>
                  </div>
                )}

                {/* NUMPAD */}
                {keyboardLayout === 'full' && (
                  <div className="space-y-[1.5px] shrink-0">
                    <div className="flex gap-[1.5px] mb-1">
                      {DRAWER_NUMPAD_ROW_0.map(k => renderDrawerKey(k))}
                    </div>
                    <div
                      className="grid gap-[1.5px]"
                      style={{
                        gridTemplateColumns: `repeat(4, ${UNIT_WIDTH}px)`,
                        gridTemplateRows: `repeat(5, ${UNIT_HEIGHT}px)`
                      }}
                    >
                      {DRAWER_NUMPAD_GRID.map(k => {
                        const isSelected = isKeyActive(k, recordedKeys);
                        return (
                          <button
                            key={k.code}
                            type="button"
                            onClick={() => handleVirtualKeyClick(k.label || k.code)}
                            style={{ gridArea: k.gridArea }}
                            className={`rounded flex flex-col items-center justify-between p-0.5 font-mono text-[8.5px] font-bold border transition-all select-none cursor-pointer ${
                              isSelected
                                ? 'bg-gradient-to-b from-[#FF7A1A] to-[#E65100] text-black border-[#FF9100] font-black shadow-[0_0_12px_rgba(255,94,0,0.7)] scale-95 z-10'
                                : 'bg-gradient-to-b from-[#181C26] to-[#11141C] text-white/80 border-white/10 hover:border-white/40 hover:bg-[#202636] hover:text-white active:scale-95'
                            }`}
                          >
                            <span className="truncate leading-none">{k.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Quick Media Keys */}
            <div>
              <label className="text-[10px] font-mono text-white/40 uppercase block mb-1">
                Media Hotkeys
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {DRAWER_MEDIA_KEYS.map((m) => {
                  const isSelected = recordedKeys.includes(m.name);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => handleVirtualKeyClick(m.name)}
                      className={`py-1.5 px-1 rounded-lg border text-center font-mono text-[10px] transition-all truncate cursor-pointer ${
                        isSelected
                          ? 'bg-[#FF5E00] text-black border-[#FF9100] font-bold shadow-xs'
                          : 'bg-[#141824] text-white/80 border-white/10 hover:border-white/30 hover:bg-[#1C2232]'
                      }`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE MACRO RECORDER */}
        {activeTab === 'recorder' && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[#0B0D13] border border-white/10 text-center space-y-3">
              <div className="text-xs text-white/60">
                {isRecording ? (
                  <span className="text-red-400 font-bold flex items-center justify-center gap-2 animate-pulse text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    RECORDING LIVE KEYSTROKES: PRESS KEYS ON KEYBOARD...
                  </span>
                ) : (
                  "Click 'Record Keys' and press your desired shortcut combo on your physical keyboard"
                )}
              </div>

              {/* Recorded Badges */}
              <div className="min-h-[52px] p-2.5 rounded-lg bg-[#151923] border border-white/10 flex items-center justify-center gap-1.5 flex-wrap">
                {recordedKeys.length === 0 ? (
                  <span className="text-white/30 text-xs italic">No keys recorded</span>
                ) : (
                  recordedKeys.map((k, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-white/40 text-xs font-bold font-mono">+</span>}
                      <span className="px-2.5 py-1 rounded bg-[#242A38] border border-white/20 font-mono text-xs font-bold text-white shadow-xs">
                        {k}
                      </span>
                    </React.Fragment>
                  ))
                )}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecordedKeys([]);
                      setIsRecording(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold font-mono flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <CircleDot className="w-3.5 h-3.5 animate-pulse" />
                    Record Keys
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRecording(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Done Recording
                  </button>
                )}

                {recordedKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={clearShortcut}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white text-xs font-mono transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TEXT SNIPPET MACRO */}
        {activeTab === 'text' && (
          <div className="space-y-3">
            <div className="text-xs text-white/60">
              Enter any text string or script command to be automatically typed out when pressing this switch:
            </div>

            <textarea
              rows={5}
              value={textSnippet}
              onChange={(e) => setTextSnippet(e.target.value)}
              placeholder="e.g. Hello world! Or git status && git log -n 5"
              className="w-full p-3 rounded-xl bg-[#0B0D13] border border-white/10 text-white font-mono text-xs focus:border-[#FF5E00] focus:outline-hidden"
            />

            <div className="flex items-center gap-2 text-[11px] text-white/50 bg-[#121622] p-2.5 rounded-lg border border-white/5">
              <Check className="w-3.5 h-3.5 text-[#38EF7D] shrink-0" />
              <span>Simulates high-speed mechanical keystrokes directly into active application window.</span>
            </div>
          </div>
        )}

        {/* TAB 4: LONG-PRESS SAFETY ISOLATION */}
        {activeTab === 'safety' && (
          <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-red-300">Long-Press Safety Isolation</h4>
                  <p className="text-[10px] text-red-200/60">
                    Suppresses quick accidental taps. Requires holding down to execute.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={editedKey.isDestructiveSafety || false}
                onChange={(e) => {
                  const updated = {
                    ...editedKey,
                    isDestructiveSafety: e.target.checked,
                    safetyConfirmAction: e.target.checked
                      ? editedKey.safetyConfirmAction || {
                          id: `safety-${Date.now()}`,
                          category: 'hotkey' as const,
                          name: 'Confirmed Operation',
                          payload: {}
                        }
                      : null
                  };
                  setEditedKey(updated);
                  onSave(updated);
                }}
                className="w-4 h-4 accent-red-500 cursor-pointer"
              />
            </div>

            {editedKey.isDestructiveSafety && (
              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>Hold Threshold Duration</span>
                    <span className="font-mono text-[#FF5E00] font-bold">
                      {((editedKey.longPressThresholdMs || 1500) / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="4000"
                    step="100"
                    value={editedKey.longPressThresholdMs || 1500}
                    onChange={(e) => {
                      const updated = {
                        ...editedKey,
                        longPressThresholdMs: parseInt(e.target.value)
                      };
                      setEditedKey(updated);
                      onSave(updated);
                    }}
                    className="w-full accent-[#FF5E00] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Safety Action Name</label>
                  <input
                    type="text"
                    value={editedKey.safetyConfirmAction?.name || ''}
                    onChange={(e) => {
                      const updated = {
                        ...editedKey,
                        safetyConfirmAction: {
                          ...editedKey.safetyConfirmAction!,
                          name: e.target.value
                        }
                      };
                      setEditedKey(updated);
                      onSave(updated);
                    }}
                    className="w-full px-2.5 py-1.5 bg-[#191012] border border-red-500/30 rounded text-xs text-white font-mono"
                    placeholder="e.g. TERMINATE STREAM"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: APPLICATION LAUNCHER & APP PICKER */}
        {activeTab === 'app' && (
          <div className="space-y-3.5">
            {/* Current Assignment Status Box */}
            {editedKey.tapAction?.category === 'app_launch' ? (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#171D2B] via-[#121622] to-[#171D2B] border border-[#FF5E00]/40 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#FF5E00] font-black tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5E00]" />
                    Currently Assigned Application
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#38EF7D] border border-[#10B981]/30 font-bold">
                    ACTIVE ASSIGNMENT
                  </span>
                </div>

                <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                  {editedKey.tapAction.payload?.iconDataUrl ? (
                    <img
                      src={editedKey.tapAction.payload.iconDataUrl}
                      alt={editedKey.label}
                      className="w-10 h-10 object-contain rounded-lg shrink-0 drop-shadow-md"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-[#FF5E00]" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-xs truncate">
                        {editedKey.tapAction.payload?.appName || editedKey.label}
                      </h4>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white/60 uppercase">
                        Key Label: {editedKey.label}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-white/50 truncate mt-0.5" title={editedKey.tapAction.payload?.exePath}>
                      {editedKey.tapAction.payload?.exePath || editedKey.tapAction.payload?.appId || 'Executable Target'}
                    </p>
                    {editedKey.tapAction.payload?.launchArgs && (
                      <p className="text-[9px] font-mono text-[#FF5E00]/80 truncate mt-0.5">
                        Args: {editedKey.tapAction.payload.launchArgs}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (editedKey.tapAction) {
                        onTestAction(editedKey.tapAction);
                      }
                    }}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-[#FF5E00]/20 hover:bg-[#FF5E00] text-[#FF5E00] hover:text-black border border-[#FF5E00]/40 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Test Launch
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playKeyClick('up');
                      const updated: KeyBinding = {
                        ...editedKey,
                        label: 'Empty',
                        sublabel: 'Unassigned',
                        tapAction: null,
                      };
                      setEditedKey(updated);
                      onSave(updated);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 text-center space-y-1">
                <p className="text-xs font-mono text-white/70 font-semibold">
                  No Application Assigned
                </p>
                <p className="text-[10px] text-white/40 font-mono">
                  Select an application from the library below or browse for an executable to launch when Switch #{editedKey.keyIndex + 1} is pressed.
                </p>
              </div>
            )}

            {/* Application Library Search & Browse Controls */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-white/80 font-bold uppercase tracking-wider">
                  Discovered Applications ({drawerApps.length})
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if ((window as any).electronAPI?.browseForApp) {
                        playKeyClick('down');
                        try {
                          const browsed: DiscoveredApp | null = await (window as any).electronAPI.browseForApp();
                          if (browsed) {
                            setDrawerApps(prev => {
                              const exists = prev.some(a => a.id === browsed.id);
                              const next = exists ? prev.map(a => a.id === browsed.id ? browsed : a) : [browsed, ...prev];
                              localStorage.setItem('kadowaz_app_library', JSON.stringify(next));
                              return next;
                            });
                            setSelectedDrawerApp(browsed);
                            setAppCustomLabel(browsed.name);
                            setAppCustomArgs('');
                          }
                        } catch { /* noop */ }
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-[10px] font-mono font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#FF5E00]" />
                    <span>Browse .exe</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if ((window as any).electronAPI?.discoverApps) {
                        setIsScanningDrawerApps(true);
                        try {
                          const result: DiscoveredApp[] = await (window as any).electronAPI.discoverApps();
                          setDrawerApps(result);
                          localStorage.setItem('kadowaz_app_library', JSON.stringify(result));
                        } catch { /* noop */ }
                        finally {
                          setIsScanningDrawerApps(false);
                        }
                      }
                    }}
                    disabled={isScanningDrawerApps}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 text-[10px] font-mono transition-all cursor-pointer disabled:opacity-40"
                    title="Rescan PC Applications"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningDrawerApps ? 'animate-spin text-[#FF5E00]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
                <input
                  type="text"
                  value={drawerAppSearch}
                  onChange={(e) => setDrawerAppSearch(e.target.value)}
                  placeholder="Search applications by name or category…"
                  className="w-full bg-[#121622] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#FF5E00] shadow-inner transition-colors"
                />
                {drawerAppSearch && (
                  <button
                    type="button"
                    onClick={() => setDrawerAppSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-white/40 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono no-scrollbar">
                {['all', 'development', 'browser', 'media', 'communication', 'productivity', 'utility', 'game', 'system'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setDrawerAppCategory(cat)}
                    className={`px-2 py-0.5 rounded-full capitalize whitespace-nowrap transition-all cursor-pointer ${
                      drawerAppCategory === cat
                        ? 'bg-[#FF5E00] text-black font-bold'
                        : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* App List / Cards Grid */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {(() => {
                const q = drawerAppSearch.toLowerCase().trim();
                const filtered = drawerApps.filter((a) => {
                  if (drawerAppCategory !== 'all' && a.category.toLowerCase() !== drawerAppCategory) {
                    return false;
                  }
                  if (q) {
                    return (
                      a.name.toLowerCase().includes(q) ||
                      a.category.toLowerCase().includes(q) ||
                      a.exePath.toLowerCase().includes(q)
                    );
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-6 text-center text-xs font-mono text-white/40 bg-black/20 rounded-xl border border-white/5">
                      {isScanningDrawerApps ? (
                        <div className="flex items-center justify-center gap-2 text-[#FF5E00]">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Scanning computer for installed applications…</span>
                        </div>
                      ) : (
                        <span>No applications match your filter. Try browsing for an .exe file.</span>
                      )}
                    </div>
                  );
                }

                return filtered.map((app) => {
                  const isSelected = selectedDrawerApp?.id === app.id;
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        playKeyClick('down');
                        setSelectedDrawerApp(app);
                        setAppCustomLabel(app.name);
                        setAppCustomArgs(app.launchArgs || '');
                      }}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-[#FF5E00]/15 border-[#FF5E00] shadow-[0_0_12px_rgba(255,94,0,0.25)]'
                          : 'bg-[#121622]/80 hover:bg-[#181D2D] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {app.iconDataUrl ? (
                          <img
                            src={app.iconDataUrl}
                            alt={app.name}
                            className="w-7 h-7 object-contain rounded shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center shrink-0">
                            <Monitor className="w-4 h-4 text-white/40" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{app.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-mono uppercase text-white/40">
                              {app.category}
                            </span>
                            <span className="text-[8px] font-mono px-1 rounded bg-white/5 text-white/40 truncate max-w-[140px]">
                              {app.source}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {app.isValid ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#38EF7D]" title="Executable verified" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Target not found" />
                        )}
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          isSelected ? 'bg-[#FF5E00] text-black' : 'text-white/40'
                        }`}>
                          {isSelected ? 'SELECTED' : 'SELECT'}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Selected App Customization & Assignment Panel */}
            {selectedDrawerApp && (
              <div className="p-3.5 rounded-2xl bg-[#141926] border border-[#FF5E00]/30 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedDrawerApp.iconDataUrl && (
                      <img
                        src={selectedDrawerApp.iconDataUrl}
                        alt={selectedDrawerApp.name}
                        className="w-6 h-6 object-contain rounded"
                      />
                    )}
                    <span className="text-xs font-bold text-white truncate">
                      Configure: {selectedDrawerApp.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDrawerApp(null)}
                    className="p-1 text-white/40 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {/* Custom Label */}
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">
                      Key Label (Max 8 chars recommended)
                    </label>
                    <input
                      type="text"
                      value={appCustomLabel}
                      onChange={(e) => setAppCustomLabel(e.target.value)}
                      placeholder={selectedDrawerApp.name.slice(0, 8)}
                      className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#FF5E00]"
                    />
                  </div>

                  {/* Launch Arguments */}
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">
                      Optional Launch Arguments
                    </label>
                    <input
                      type="text"
                      value={appCustomArgs}
                      onChange={(e) => setAppCustomArgs(e.target.value)}
                      placeholder="e.g. --new-window"
                      className="w-full px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#FF5E00]"
                    />
                  </div>
                </div>

                {/* Advanced Launch Checkboxes */}
                <div className="flex items-center gap-4 text-[11px] font-mono text-white/70 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appFocusExisting}
                      onChange={(e) => setAppFocusExisting(e.target.checked)}
                      className="accent-[#FF5E00]"
                    />
                    <span>Focus if already open</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appLaunchMinimized}
                      onChange={(e) => setAppLaunchMinimized(e.target.checked)}
                      className="accent-[#FF5E00]"
                    />
                    <span>Launch minimized</span>
                  </label>
                </div>

                {/* Assign to Key Button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playKeyClick('heavy');
                      const updated: KeyBinding = {
                        ...editedKey,
                        label: appCustomLabel.trim() || selectedDrawerApp.name.slice(0, 8),
                        sublabel: selectedDrawerApp.category.toUpperCase(),
                        iconName: 'Sparkles',
                        tapAction: {
                          id: `app-launch-${Date.now()}`,
                          category: 'app_launch',
                          name: `Launch ${selectedDrawerApp.name}`,
                          payload: {
                            appId: selectedDrawerApp.appId || '',
                            appName: selectedDrawerApp.name,
                            exePath: selectedDrawerApp.exePath,
                            launchArgs: appCustomArgs,
                            focusExisting: appFocusExisting,
                            launchMinimized: appLaunchMinimized,
                            iconDataUrl: selectedDrawerApp.iconDataUrl,
                            targetType: selectedDrawerApp.targetType,
                            source: selectedDrawerApp.source,
                          }
                        }
                      };
                      setEditedKey(updated);
                      onSave(updated);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#FF5E00] hover:bg-[#FF6A00] text-black text-xs font-mono font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Assign to Switch #{editedKey.keyIndex + 1}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onTestAction({
                        id: `test-${selectedDrawerApp.id}`,
                        category: 'app_launch',
                        name: `Launch ${selectedDrawerApp.name}`,
                        payload: {
                          appId: selectedDrawerApp.appId || '',
                          appName: selectedDrawerApp.name,
                          exePath: selectedDrawerApp.exePath,
                          launchArgs: appCustomArgs,
                          focusExisting: appFocusExisting,
                          launchMinimized: appLaunchMinimized,
                          iconDataUrl: selectedDrawerApp.iconDataUrl,
                          targetType: selectedDrawerApp.targetType,
                          source: selectedDrawerApp.source,
                        }
                      });
                    }}
                    className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* DRAWER FOOTER: Action Testing & Save Status */}
      <div className="px-4 py-2.5 border-t border-white/10 flex items-center justify-between bg-[#131722]/90 backdrop-blur-md shrink-0">
        <button
          type="button"
          onClick={() => {
            if (editedKey.tapAction) {
              onTestAction(editedKey.tapAction);
            }
          }}
          className="flex items-center gap-1.5 text-xs text-[#38EF7D] hover:underline font-mono cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" /> Test Switch Action
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-white/10 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleManualSave}
            className="px-4 py-1.5 rounded-lg bg-[#FF5E00] hover:bg-[#FF6A00] text-black text-xs font-bold flex items-center gap-1 shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Save Changes
          </button>
        </div>
      </div>

    </div>
  );
};
