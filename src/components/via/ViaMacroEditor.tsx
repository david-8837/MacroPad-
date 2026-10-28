import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, 
  Play, 
  Save, 
  Plus, 
  Trash2, 
  Clock, 
  Check, 
  Type, 
  Terminal, 
  Sparkles, 
  Layers, 
  RotateCcw, 
  Keyboard as KeyboardIcon,
  Copy,
  ArrowRight,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { sendNativeAction } from '../../utils/executeDeckAction';
import { MACRO_STORAGE_KEY } from '../../utils/macroStorage';
import { playKeyClick } from '../../utils/soundEffects';

export interface MacroAction {
  id: string;
  type: 'down' | 'up' | 'combo' | 'text' | 'delay';
  value: string;
  keys?: string[];
  delayMs?: number;
}

export interface MacroSlot {
  id: number;
  name: string;
  description?: string;
  actions: MacroAction[];
}

/* Preset sequences. A preset is a starting point you apply to a slot, never
 * something that arrives pre-loaded: the sixteen slots stay empty until you pick
 * one. Keys are the names actionExecutor resolves (Win, Ctrl, Shift, Alt, Esc,
 * Enter, Space, F1-F12, A-Z, 0-9, punctuation, and the Media/Volume key names),
 * so a preset that says Ctrl+Shift+Esc actually fires Ctrl+Shift+Esc on Windows. */
export type PresetCategory = 'Windows' | 'Editing' | 'Browser' | 'Coding' | 'Media' | 'Text';

export interface MacroPreset {
  id: string;
  name: string;
  category: PresetCategory;
  desc: string;
  actions: MacroAction[];
}

const combo = (keys: string[]) => ({ type: 'combo' as const, value: keys.join('+'), keys });
const text = (value: string) => ({ type: 'text' as const, value });
const wait = (ms: number) => ({ type: 'delay' as const, value: `${ms}`, delayMs: ms });

type PresetStep = Omit<MacroAction, 'id'>;

const PRESET_ROWS: [PresetCategory, string, string, PresetStep[]][] = [
  // Windows
  ['Windows', 'Lock PC', 'Locks the session', [combo(['Win', 'L'])]],
  ['Windows', 'Task Manager', 'Opens Task Manager directly', [combo(['Ctrl', 'Shift', 'Esc'])]],
  ['Windows', 'File Explorer', 'Opens a new Explorer window', [combo(['Win', 'E'])]],
  ['Windows', 'Snip Screenshot', 'Screen snipping overlay', [combo(['Win', 'Shift', 'S'])]],
  ['Windows', 'Clipboard History', 'Recent clipboard items', [combo(['Win', 'V'])]],
  ['Windows', 'Emoji Picker', 'Windows emoji and symbols panel', [combo(['Win', '.'])]],
  ['Windows', 'Show Desktop', 'Minimise everything', [combo(['Win', 'D'])]],
  ['Windows', 'Switch Windows', 'Alt-Tab between open windows', [combo(['Alt', 'Tab'])]],
  ['Windows', 'Run Dialog', 'Open the Run box', [combo(['Win', 'R'])]],
  ['Windows', 'Settings', 'Windows Settings app', [combo(['Win', 'I'])]],

  // Editing — universal keyboard conventions
  ['Editing', 'Undo', 'Ctrl+Z', [combo(['Ctrl', 'Z'])]],
  ['Editing', 'Redo', 'Ctrl+Y', [combo(['Ctrl', 'Y'])]],
  ['Editing', 'Select All', 'Ctrl+A', [combo(['Ctrl', 'A'])]],
  ['Editing', 'Copy', 'Ctrl+C', [combo(['Ctrl', 'C'])]],
  ['Editing', 'Cut', 'Ctrl+X', [combo(['Ctrl', 'X'])]],
  ['Editing', 'Paste', 'Ctrl+V', [combo(['Ctrl', 'V'])]],
  ['Editing', 'Paste Plain Text', 'Drops formatting where supported', [combo(['Ctrl', 'Shift', 'V'])]],
  ['Editing', 'Save', 'Ctrl+S', [combo(['Ctrl', 'S'])]],
  ['Editing', 'Save All', 'Ctrl+Shift+S', [combo(['Ctrl', 'Shift', 'S'])]],
  ['Editing', 'Find', 'Ctrl+F', [combo(['Ctrl', 'F'])]],
  ['Editing', 'Find & Replace', 'Ctrl+H', [combo(['Ctrl', 'H'])]],
  ['Editing', 'Print', 'Ctrl+P', [combo(['Ctrl', 'P'])]],

  // Browser
  ['Browser', 'New Tab', 'Ctrl+T', [combo(['Ctrl', 'T'])]],
  ['Browser', 'Reopen Closed Tab', 'Ctrl+Shift+T', [combo(['Ctrl', 'Shift', 'T'])]],
  ['Browser', 'Address Bar', 'Focus the URL field', [combo(['Ctrl', 'L'])]],
  ['Browser', 'DevTools', 'Toggle developer tools', [combo(['F12'])]],
  ['Browser', 'Hard Reload', 'Reload ignoring cache', [combo(['Ctrl', 'Shift', 'R'])]],
  ['Browser', 'Back', 'Browser back', [combo(['Alt', 'Left'])]],
  ['Browser', 'Full Screen', 'Toggle full screen', [combo(['F11'])]],

  // Coding
  ['Coding', 'VS Code Palette', 'Command palette', [combo(['Ctrl', 'Shift', 'P'])]],
  ['Coding', 'VS Code Terminal', 'Toggle the integrated terminal', [combo(['Ctrl', '`'])]],
  ['Coding', 'Format Document', 'VS Code format', [combo(['Shift', 'Alt', 'F'])]],
  ['Coding', 'Toggle Comment', 'Comment or uncomment the line', [combo(['Ctrl', '/'])]],
  ['Coding', 'Go To Line', 'Jump to a line number', [combo(['Ctrl', 'G'])]],
  ['Coding', 'Build Project', 'Run the build task', [combo(['Ctrl', 'Shift', 'B'])]],
  ['Coding', 'Git Commit & Push', 'Stage everything, commit, push', [text('git add . && git commit -m "update" && git push'), wait(80), combo(['Enter'])]],
  ['Coding', 'Run Dev Server', 'Types npm run dev and hits Enter', [text('npm run dev'), wait(80), combo(['Enter'])]],

  // Media & creative apps
  ['Media', 'Play / Pause', 'System media key', [combo(['MediaPlayPause'])]],
  ['Media', 'Next Track', 'System media key', [combo(['MediaNext'])]],
  ['Media', 'Volume Up', 'System volume key', [combo(['VolumeUp'])]],
  ['Media', 'Mute', 'System mute key', [combo(['VolumeMute'])]],
  ['Media', 'Premiere: Mark In', 'Set an in point', [combo(['I'])]],
  ['Media', 'Premiere: Mark Out', 'Set an out point', [combo(['O'])]],
  ['Media', 'Premiere: Blade', 'Cut at the playhead', [combo(['Ctrl', 'B'])]],
  ['Media', 'Premiere: Ripple Delete', 'Delete and close the gap', [combo(['Shift', 'Delete'])]],
  ['Media', 'DaVinci: Deliver', 'Open the Deliver page', [combo(['Ctrl', 'Shift', 'F12'])]],

  // Text
  ['Text', 'Email Sign-off', 'Best regards, and a new line', [text('Best regards,'), wait(60), combo(['Enter'])]],
  ['Text', 'Clear Terminal', 'Types clear and runs it', [text('clear'), wait(60), combo(['Enter'])]],
  ['Text', 'List Directory', 'Types dir and runs it', [text('dir'), wait(60), combo(['Enter'])]],
];

export const MACRO_PRESETS: MacroPreset[] = PRESET_ROWS.map(([category, name, desc, actions], i) => ({
  id: `preset-${i}`,
  name,
  category,
  desc,
  actions: actions.map((a, j) => ({ ...a, id: `preset-${i}-${j}` })),
}));

export const PRESET_CATEGORIES: PresetCategory[] = ['Windows', 'Editing', 'Browser', 'Coding', 'Media', 'Text'];

/** One-line summary of what a sequence will send, e.g. "Ctrl+Shift+Esc". */
export function describeActions(actions: MacroAction[]): string {
  return actions
    .map((a) => (a.type === 'text' ? `"${a.value}"` : a.type === 'delay' ? `${a.delayMs}ms` : a.value))
    .join(' · ');
}

/* Sixteen empty slots, on purpose. This page used to ship with sixteen invented
 * macros ("Copy & Paste Helper" in M0, "Lock PC Workstation", "Git Status & Log")
 * so a fresh install looked like someone had already been using it. A slot holds
 * what you put in it, or it is blank. */
const INITIAL_MACROS: MacroSlot[] = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  name: '',
  description: '',
  actions: []
}));

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

interface ViaMacroEditorProps {
  onTriggerAction?: (actionId: string, actionName: string, category: string) => void;
}

export const ViaMacroEditor: React.FC<ViaMacroEditorProps> = ({
  onTriggerAction,
}) => {
  const [macros, setMacros] = useState<MacroSlot[]>(() => {
    const saved = localStorage.getItem(MACRO_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
    return INITIAL_MACROS;
  });

  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [activeBuilderTab, setActiveBuilderTab] = useState<'combo' | 'text' | 'delay' | 'templates'>('combo');
  
  // Builder form states
  const [newText, setNewText] = useState('');
  const [appendEnterWithText, setAppendEnterWithText] = useState(true);
  const [newDelay, setNewDelay] = useState('100');
  
  // What the last press looked like, echoed back to the user
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);
  const [presetQuery, setPresetQuery] = useState('');
  const [presetCategory, setPresetCategory] = useState<PresetCategory | 'all'>('all');
  const [testNotice, setTestNotice] = useState<string | null>(null);

  // Status & Test playback feedback
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [activePlayStep, setActivePlayStep] = useState<number | null>(null);


  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(MACRO_STORAGE_KEY, JSON.stringify(macros));
  }, [macros]);

  const currentMacro = macros.find(m => m.id === selectedSlot) || macros[0];

  const filteredPresets = MACRO_PRESETS.filter((preset) => {
    if (presetCategory !== 'all' && preset.category !== presetCategory) return false;
    const q = presetQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      preset.name.toLowerCase().includes(q) ||
      preset.desc.toLowerCase().includes(q) ||
      preset.category.toLowerCase().includes(q) ||
      describeActions(preset.actions).toLowerCase().includes(q)
    );
  });

  const normalizeKeyName = (key: string): string => {
    if (key === 'Control') return 'Ctrl';
    if (key === 'Meta') return 'Win';
    if (key === 'Alt') return 'Alt';
    if (key === 'Shift') return 'Shift';
    if (key === ' ') return 'Space';
    // A press arrives as 'c'; store 'C' so a key has one spelling.
    if (key.length === 1) return key.toUpperCase();
    return key;
  };

  /* Type the keys you want. The page listens while the Key Combo tab is open,
   * turns what you press into a step, and shows it back to you. Text fields keep
   * their own keystrokes so renaming a slot still word-processes normally. */
  useEffect(() => {
    if (activeBuilderTab !== 'combo') return;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.key === 'Tab') return;            // keep keyboard navigation
      if (e.ctrlKey && e.key.toLowerCase() === 'r') return; // keep browser refresh
      e.preventDefault();
      if (e.repeat) return;

      if (e.key === 'Escape') {
        setLastCaptured(null);
        return;
      }
      if (MODIFIER_KEYS.has(e.key)) return;    // wait for the key the modifier is for

      // Read the modifiers off the event itself: no held-key bookkeeping to desync.
      const mods: string[] = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.shiftKey) mods.push('Shift');
      if (e.altKey) mods.push('Alt');
      if (e.metaKey) mods.push('Win');

      commitCombo(mods, normalizeKeyName(e.key));
    };

    window.addEventListener('keydown', handleCaptureKeyDown);
    return () => window.removeEventListener('keydown', handleCaptureKeyDown);
  }, [activeBuilderTab, selectedSlot]);

  const handleUpdateName = (name: string) => {
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, name } : m));
  };

  const handleUpdateDesc = (description: string) => {
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, description } : m));
  };

  const commitCombo = (mods: string[], key: string) => {
    const keys = [...mods];
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
    if (keys.length === 0) return;

    const action: MacroAction = {
      id: `act-${Date.now()}-${Math.random()}`,
      type: 'combo',
      value: keys.join('+'),
      keys
    };

    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, actions: [...m.actions, action] } : m));
    setLastCaptured(keys.join(' + '));
    playKeyClick('down');
  };


  const addTextAction = () => {
    if (!newText) return;
    const actions: MacroAction[] = [
      {
        id: `txt-${Date.now()}-${Math.random()}`,
        type: 'text',
        value: newText
      }
    ];

    if (appendEnterWithText) {
      actions.push({
        id: `del-${Date.now()}-${Math.random()}`,
        type: 'delay',
        value: '50',
        delayMs: 50
      });
      actions.push({
        id: `ent-${Date.now()}-${Math.random()}`,
        type: 'combo',
        value: 'Enter',
        keys: ['Enter']
      });
    }

    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, actions: [...m.actions, ...actions] } : m));
    setNewText('');
    playKeyClick('down');
  };

  const addDelayAction = () => {
    const ms = parseInt(newDelay, 10) || 100;
    const action: MacroAction = {
      id: `del-${Date.now()}-${Math.random()}`,
      type: 'delay',
      value: `${ms}`,
      delayMs: ms
    };
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, actions: [...m.actions, action] } : m));
    playKeyClick('down');
  };

  const applyPreset = (preset: MacroPreset) => {
    setMacros(prev => prev.map(m => {
      if (m.id !== selectedSlot) return m;
      return {
        ...m,
        name: preset.name,
        description: preset.desc,
        actions: preset.actions.map((a, i) => ({ ...a, id: `${preset.id}-${Date.now()}-${i}` }))
      };
    }));
    playKeyClick('heavy');
  };

  const removeAction = (idx: number) => {
    setMacros(prev => prev.map(m => {
      if (m.id !== selectedSlot) return m;
      return {
        ...m,
        actions: m.actions.filter((_, i) => i !== idx)
      };
    }));
    playKeyClick('up');
  };

  const moveAction = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentMacro.actions.length) return;

    setMacros(prev => prev.map(m => {
      if (m.id !== selectedSlot) return m;
      const copy = [...m.actions];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return { ...m, actions: copy };
    }));
  };

  const clearCurrentMacro = () => {
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, actions: [] } : m));
    playKeyClick('up');
  };

  const handleSave = () => {
    localStorage.setItem(MACRO_STORAGE_KEY, JSON.stringify(macros));
    setSavedSuccess(true);
    playKeyClick('heavy');
    onTriggerAction?.(`macro-save-${selectedSlot}`, `Saved Macro M${selectedSlot} on this PC`, 'info');
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  /* Test Run sends the steps for real, through the same native path the deck uses
   * (execAction -> actionExecutor). Without the desktop shell nothing can be sent,
   * so it says so instead of animating a fake success. */
  const handleTestMacroRun = async () => {
    if (isPlayingTest || currentMacro.actions.length === 0) return;
    playKeyClick('down');

    if (!window.electronAPI?.execAction) {
      // Say it on the page, not only in the log drawer.
      setTestNotice('Test Run needs the Kadowaz desktop app. The browser preview cannot send keystrokes, so nothing was sent.');
      onTriggerAction?.(`test-macro-blocked-${currentMacro.id}`, 'Test Run blocked: no desktop shell, nothing was sent.', 'info');
      return;
    }

    setTestNotice(null);
    setIsPlayingTest(true);

    onTriggerAction?.(
      `test-macro-start-${currentMacro.id}`,
      `▶ Executing Macro M${currentMacro.id} [${currentMacro.name || 'untitled'}] (${currentMacro.actions.length} steps)`,
      'script'
    );

    for (let i = 0; i < currentMacro.actions.length; i++) {
      setActivePlayStep(i);
      const act = currentMacro.actions[i];
      playKeyClick('down');

      if (act.type === 'delay') {
        await new Promise(r => setTimeout(r, Math.min(Math.max(act.delayMs || 100, 0), 5000)));
        continue;
      }

      const keys = act.keys && act.keys.length > 0 ? act.keys : [act.value];
      const res = act.type === 'text'
        ? await sendNativeAction({ id: `test-${currentMacro.id}-${i}`, category: 'script', name: currentMacro.name, payload: { command: act.value } })
        : await sendNativeAction({ id: `test-${currentMacro.id}-${i}`, category: 'hotkey', name: currentMacro.name, payload: { keys } });

      if (!res.success) {
        onTriggerAction?.(
          `test-macro-failed-${currentMacro.id}`,
          `[ACTION FAILED] Step ${i + 1}: ${res.error || 'unknown error'}`,
          'safety'
        );
        setActivePlayStep(null);
        setIsPlayingTest(false);
        return;
      }
      await new Promise(r => setTimeout(r, 30));
    }

    setActivePlayStep(null);
    setIsPlayingTest(false);
    playKeyClick('heavy');

    setTestNotice(`Sent all ${currentMacro.actions.length} steps to Windows.`);
    onTriggerAction?.(
      `test-macro-done-${currentMacro.id}`,
      `✓ Finished Macro M${currentMacro.id} Execution`,
      'script'
    );
  };


  return (
    <div className="w-full max-w-5xl space-y-5 animate-in fade-in duration-150 select-none">
      {/* Top Banner & Header */}
      <div className="panel p-5 border border-[#E3E2DE] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center text-[#141414] ">
            <Code className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#141414] tracking-tight">VIA Macro Studio</h2>
              <span className="px-2 py-0.5 bg-[#1351AA] border border-[#1351AA] text-[#E3E2DE] text-[10px] font-mono font-bold">
                M0 – M15 SLOTS
              </span>
            </div>
            <p className="text-xs text-[#646464]">
              Author the sixteen macro slots here. To put one on a switch, assign M0–M15 from the VIA Quick Keycode Tray.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Saves to this PC. The macropad holds keycodes, not macro bodies. */}
          <button
            onClick={handleSave}
            title="Saves the macro library on this PC. Macros run from the desktop app, so they are not written to the macropad."
            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs transition-all active:scale-95 ${
 savedSuccess
 ? 'bg-[#1351AA] text-[#E3E2DE] '
 : 'bg-[#1351AA] text-[#E3E2DE] hover:bg-[#1351AA] '
 }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Slots List + Right Sequence Editor */}
      <div className="grid grid-cols-12 gap-5">
        {/* LEFT COLUMN: 16 Macro Slots Sidebar (cols 4) */}
        <div className="col-span-4 panel p-3.5 border border-[#E3E2DE] flex flex-col space-y-2 h-[640px]">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-[#E3E2DE] text-xs font-mono text-[#646464]">
            <span className="uppercase tracking-wider text-[10px]">Macro Memory Slots</span>
            <span className="text-[10px] text-[#646464]">16 Slots Available</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {macros.map((m) => {
              const isSelected = selectedSlot === m.id;
              const hasActions = m.actions.length > 0;

              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedSlot(m.id);
                    playKeyClick('down');
                  }}
                  className={`w-full text-left p-2.5 border transition-all flex items-center justify-between group ${
 isSelected
 ? 'border-[#444343] '
 : 'bg-[#EDECE8] border-[#E3E2DE] hover:border-[#C7C7C7] hover:bg-[#F4F3F0]'
 }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className={`w-7 h-7 flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
 isSelected
 ? 'bg-[#1351AA] text-[#E3E2DE] '
 : 'bg-[#F4F3F0] text-[#444343] group-hover:text-[#141414]'
 }`}
                    >
                      M{m.id}
                    </div>
                    <div className="truncate">
                      <div className={`text-xs font-semibold truncate ${isSelected ? 'text-[#141414]' : 'text-[#444343]'}`}>
                        {m.name}
                      </div>
                      <div className="text-[10px] text-[#646464] truncate">
                        {hasActions ? `${m.actions.length} sequence steps` : 'Empty slot'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasActions && (
                      <span className="w-2 h-2 bg-[#1351AA]" title="Populated macro" />
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-[#444343] translate-x-0.5' : 'text-[#646464]'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Sequence Viewer, Controls & Action Builders (cols 8) */}
        <div className="col-span-8 flex flex-col space-y-4">
          {/* Macro Card Header */}
          <div className="panel p-4 border border-[#E3E2DE] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <span className="w-9 h-9 bg-[#1351AA] border border-[#1351AA] flex items-center justify-center font-mono font-extrabold text-[#E3E2DE] text-sm shrink-0">
                  M{currentMacro.id}
                </span>
                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={currentMacro.name}
                    onChange={(e) => handleUpdateName(e.target.value)}
                    placeholder="Enter macro label (e.g. Git Push)"
                    className="w-full bg-transparent text-[#141414] font-bold text-base focus:outline-hidden hover:bg-[#F4F3F0] px-1.5 py-0.5 border border-transparent focus:border-[#C7C7C7] transition-colors"
                  />
                  <input
                    type="text"
                    value={currentMacro.description || ''}
                    onChange={(e) => handleUpdateDesc(e.target.value)}
                    placeholder="Optional description / memo..."
                    className="w-full bg-transparent text-[#646464] text-xs focus:outline-hidden hover:bg-[#F4F3F0] px-1.5 py-0.5 border border-transparent focus:border-[#E3E2DE] transition-colors"
                  />
                </div>
              </div>

              {/* Action Button: Run Test (assigning lives in the VIA Quick Keycode Tray) */}
              <div className="flex items-center gap-2">
                {/* Test Macro Playback */}
                <button
                  onClick={handleTestMacroRun}
                  disabled={isPlayingTest || currentMacro.actions.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono font-bold transition-all active:scale-95 ${
 isPlayingTest
 ? 'bg-[#EDECE8] border-[#1351AA] text-[#1351AA] animate-pulse'
 : currentMacro.actions.length === 0
 ? 'opacity-40 bg-[#F4F3F0] border-[#E3E2DE] text-[#646464] cursor-not-allowed'
 : 'bg-[#EDECE8] hover:bg-[#EDECE8] border-[#C7C7C7] text-[#1351AA] hover:border-[#1351AA]'
 }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isPlayingTest ? 'fill-current' : ''}`} />
                  <span>{isPlayingTest ? 'Running...' : 'Test Run'}</span>
                </button>

              </div>
            </div>

            {testNotice && (
              <div className="px-2.5 py-2 bg-[#F4F3F0] border border-[#C7C7C7] text-[11px] font-mono text-[#444343]">
                {testNotice}
              </div>
            )}

            {/* Action Sequence Visualizer Area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#646464] px-1">
                <span>ACTION SEQUENCE TIMELINE ({currentMacro.actions.length} STEPS)</span>
                {currentMacro.actions.length > 0 && (
                  <button
                    onClick={clearCurrentMacro}
                    className="text-[#141414]/80 hover:text-[#141414] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All Steps</span>
                  </button>
                )}
              </div>

              <div className="min-h-[140px] max-h-[170px] p-3 bg-[#FFFFFF] border border-[#E3E2DE] flex flex-wrap gap-2 items-center content-start overflow-y-auto scrollbar-thin">
                {currentMacro.actions.length === 0 ? (
                  <div className="w-full h-28 flex flex-col items-center justify-center text-[#646464] text-xs italic gap-1">
                    <Code className="w-6 h-6 opacity-30 text-[#444343]" />
                    <span>No sequence steps configured yet for Macro M{currentMacro.id}.</span>
                    <span className="text-[10px] text-[#646464]">Record live keystrokes, add key combos, text strings, or templates below.</span>
                  </div>
                ) : (
                  currentMacro.actions.map((act, idx) => {
                    const isStepActive = activePlayStep === idx;
                    return (
                      <div
                        key={act.id || idx}
                        className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-xs transition-all ${
 isStepActive
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA] scale-105 '
 : act.type === 'combo'
 ? 'bg-[#EDECE8] border-[#C7C7C7] text-[#1351AA]'
 : act.type === 'text'
 ? 'bg-[#EDECE8] border-[#C7C7C7] text-[#1351AA]'
 : act.type === 'delay'
 ? 'bg-[#EDECE8]/10 border-[#C7C7C7]/40 text-[#1351AA]'
 : act.type === 'down'
 ? 'bg-[#EDECE8]/15 border-[#C7C7C7]/40 text-[#1351AA]'
 : 'bg-[#EDECE8]/5 border-[#C7C7C7]/20 text-[#1351AA]/60'
 }`}
                      >
                        <span className="text-[9px] opacity-60 font-mono font-bold">#{idx + 1}</span>
                        <span className="text-[9px] uppercase opacity-75 font-semibold">
                          {act.type === 'combo' ? 'COMBO' : act.type === 'text' ? 'TYPE' : act.type === 'delay' ? 'WAIT' : act.type.toUpperCase()}:
                        </span>
                        <span className="font-bold truncate max-w-[160px]">
                          {act.type === 'delay' ? `${act.value}ms` : act.value}
                        </span>

                        {/* Move / Remove tools */}
                        <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {idx > 0 && (
                            <button
                              onClick={() => moveAction(idx, 'up')}
                              title="Move step left"
                              className="hover:text-[#141414] px-0.5 text-[10px]"
                            >
                              ◀
                            </button>
                          )}
                          {idx < currentMacro.actions.length - 1 && (
                            <button
                              onClick={() => moveAction(idx, 'down')}
                              title="Move step right"
                              className="hover:text-[#141414] px-0.5 text-[10px]"
                            >
                              ▶
                            </button>
                          )}
                          <button
                            onClick={() => removeAction(idx)}
                            title="Delete step"
                            className="text-[#141414] hover:text-[#141414] px-0.5 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Action Step Builders Tabs & Panels */}
          <div className="panel p-4 border border-[#E3E2DE] space-y-4 flex-1">
            {/* Step Type Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[#EDECE8] border border-[#E3E2DE]">
              <button
                onClick={() => setActiveBuilderTab('combo')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
 activeBuilderTab === 'combo'
 ? 'bg-[#1351AA] text-[#E3E2DE] font-bold'
 : 'text-[#444343] hover:text-[#141414]'
 }`}
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                <span>Type Keys</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('text')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
 activeBuilderTab === 'text'
 ? 'bg-[#1351AA] text-[#E3E2DE] font-bold'
 : 'text-[#444343] hover:text-[#141414]'
 }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text String</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('delay')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
 activeBuilderTab === 'delay'
 ? 'bg-[#1351AA] text-[#E3E2DE] font-bold'
 : 'text-[#444343] hover:text-[#141414]'
 }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Delay (ms)</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('templates')}
                className={`flex-1 py-1.5 text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
 activeBuilderTab === 'templates'
 ? 'bg-[#1351AA] text-[#E3E2DE] font-bold'
 : 'text-[#444343] hover:text-[#141414]'
 }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Presets</span>
              </button>
            </div>

            {/* TAB 1: TYPE THE KEYS */}
            {activeBuilderTab === 'combo' && (
              <div className="space-y-2">
                <div
                  tabIndex={0}
                  aria-label="Type the keys you want to log"
                  className="w-full px-4 py-7 bg-[#FFFFFF] border border-[#C7C7C7] flex flex-col items-center justify-center gap-2 focus:outline-hidden focus:border-[#1351AA]"
                >
                  <KeyboardIcon className="w-5 h-5 text-[#646464]" />
                  <span className="text-xs font-mono text-[#444343] text-center">
                    Press the keys you want on your keyboard — each press is logged as a step.
                  </span>
                  <span className="text-[10px] font-mono text-[#646464] text-center">
                    Modifiers count · held with a key it logs as one step · Escape clears the readout
                  </span>
                </div>

                <div className="flex items-center justify-between px-1 font-mono text-[11px]">
                  <span className="text-[#646464]">LAST LOGGED</span>
                  <span className={lastCaptured ? 'font-bold text-[#1351AA]' : 'text-[#646464]'}>
                    {lastCaptured ?? 'nothing yet'}
                  </span>
                </div>

                {currentMacro.actions.length > 0 && (
                  <button
                    onClick={() => removeAction(currentMacro.actions.length - 1)}
                    className="w-full py-1.5 bg-[#EDECE8] hover:bg-[#E3E2DE] border border-[#C7C7C7] text-[#444343] font-mono text-[11px] font-bold uppercase tracking-[0.1em] active:scale-95 transition-all"
                  >
                    Remove last step
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: TEXT STRING INJECTOR */}
            {activeBuilderTab === 'text' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-[#646464] uppercase block">
                    Text / Script Command to Type
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTextAction();
                        }
                      }}
                      placeholder="e.g. git status || https://youtube.com || MySecretPass123"
                      className="flex-1 px-3 py-2 bg-[#EDECE8] border border-[#E3E2DE] text-xs text-[#141414] focus:outline-hidden focus:border-[#1351AA]"
                    />
                    <button
                      onClick={addTextAction}
                      disabled={!newText.trim()}
                      className={`px-4 py-2 font-bold text-xs flex items-center gap-1.5 transition-all ${
 newText.trim()
 ? 'bg-[#1351AA] hover:bg-[#1351AA] text-[#E3E2DE] '
 : 'bg-[#F4F3F0] text-[#646464] cursor-not-allowed'
 }`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Insert Text</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="appendEnterCheck"
                    checked={appendEnterWithText}
                    onChange={(e) => setAppendEnterWithText(e.target.checked)}
                    className=" bg-[#EDECE8] border-[#C7C7C7] text-[#1351AA] focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="appendEnterCheck" className="text-xs text-[#444343] cursor-pointer select-none">
                    Automatically append <span className="font-mono font-bold text-[#1351AA]">Enter</span> key at end of string
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: DELAYS */}
            {activeBuilderTab === 'delay' && (
              <div className="space-y-3">
                <label className="text-[11px] font-mono text-[#646464] uppercase block">
                  Insert Timing Delay
                </label>
                <div className="flex gap-2">
                  {['50', '100', '250', '500', '1000'].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => setNewDelay(ms)}
                      className={`flex-1 py-1.5 font-mono text-xs border transition-colors ${
 newDelay === ms
 ? 'bg-[#141414] border-[#141414] text-[#E3E2DE] font-bold'
 : 'bg-[#EDECE8] border-[#E3E2DE] text-[#444343] hover:border-[#141414] hover:text-[#141414]'
 }`}
                    >
                      {ms}ms
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    step="10"
                    value={newDelay}
                    onChange={(e) => setNewDelay(e.target.value)}
                    className="w-32 px-3 py-1.5 bg-[#EDECE8] border border-[#E3E2DE] text-xs font-mono text-[#141414] focus:outline-hidden"
                  />
                  <span className="text-xs text-[#646464] font-mono">milliseconds</span>
                  <button
                    onClick={addDelayAction}
                    className="ml-auto px-4 py-2 bg-[#1351AA] hover:bg-[#1351AA] text-[#E3E2DE] font-bold text-xs flex items-center gap-1.5 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Insert Delay</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: PRESETS */}
            {activeBuilderTab === 'templates' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(['all', ...PRESET_CATEGORIES] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setPresetCategory(cat)}
                        className={`px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] border transition-colors ${
 presetCategory === cat
 ? 'bg-[#1351AA] border-[#1351AA] text-[#E3E2DE]'
 : 'bg-[#EDECE8] border-[#E3E2DE] text-[#444343] hover:border-[#141414]'
 }`}
                      >
                        {cat === 'all' ? `All ${MACRO_PRESETS.length}` : cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={presetQuery}
                    onChange={(e) => setPresetQuery(e.target.value)}
                    placeholder="Search presets..."
                    className="w-40 px-2 py-1 bg-[#FFFFFF] border border-[#C7C7C7] text-[11px] text-[#141414] focus:outline-hidden focus:border-[#1351AA]"
                  />
                </div>

                <div className="text-[10px] font-mono text-[#646464]">
                  Applying a preset replaces the steps in M{selectedSlot}. Nothing is written until you apply it.
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto scrollbar-thin pr-1">
                  {filteredPresets.length === 0 && (
                    <div className="col-span-2 py-6 text-center text-[11px] font-mono text-[#646464]">
                      No preset matches that.
                    </div>
                  )}
                  {filteredPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      className="p-2.5 bg-[#EDECE8] hover:bg-[#E3E2DE] border border-[#E3E2DE] hover:border-[#141414] text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-[#141414] leading-tight">{preset.name}</span>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[#646464]">
                          {preset.category}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-[#646464] leading-snug">{preset.desc}</p>
                      <div className="mt-1.5 truncate font-mono text-[9px] text-[#1351AA]">
                        {describeActions(preset.actions)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
