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
  Zap, 
  RotateCcw, 
  Keyboard as KeyboardIcon,
  Circle,
  Copy,
  ArrowRight,
  ChevronRight,
  Download,
  Upload,
  AlertCircle
} from 'lucide-react';
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

const DEFAULT_MACRO_TEMPLATES: { name: string; desc: string; actions: MacroAction[] }[] = [
  {
    name: 'Git Quick Commit & Push',
    desc: 'Stages, commits with timestamp, and pushes branch',
    actions: [
      { id: '1', type: 'text', value: 'git add . && git commit -m "deck auto-update" && git push' },
      { id: '2', type: 'delay', value: '100', delayMs: 100 },
      { id: '3', type: 'combo', value: 'Enter', keys: ['Enter'] }
    ]
  },
  {
    name: 'VS Code Format & Save',
    desc: 'Auto-formats active code document and saves file',
    actions: [
      { id: '1', type: 'combo', value: 'Shift+Alt+F', keys: ['Shift', 'Alt', 'F'] },
      { id: '2', type: 'delay', value: '150', delayMs: 150 },
      { id: '3', type: 'combo', value: 'Ctrl+S', keys: ['Ctrl', 'S'] }
    ]
  },
  {
    name: 'Task Manager Direct',
    desc: 'Instant direct launch of Windows Task Manager',
    actions: [
      { id: '1', type: 'combo', value: 'Ctrl+Shift+Esc', keys: ['Ctrl', 'Shift', 'Esc'] }
    ]
  },
  {
    name: 'DaVinci Quick Export',
    desc: 'Trigger render export queue in DaVinci Resolve',
    actions: [
      { id: '1', type: 'combo', value: 'Ctrl+Shift+F12', keys: ['Ctrl', 'Shift', 'F12'] }
    ]
  },
  {
    name: 'Discord Streamer Mute',
    desc: 'Global microphone mute/unmute toggle in Discord',
    actions: [
      { id: '1', type: 'combo', value: 'Ctrl+Shift+M', keys: ['Ctrl', 'Shift', 'M'] }
    ]
  },
  {
    name: 'Terminal Clear Screen',
    desc: 'Clears terminal buffer and repositions prompt',
    actions: [
      { id: '1', type: 'text', value: 'clear' },
      { id: '2', type: 'delay', value: '50', delayMs: 50 },
      { id: '3', type: 'combo', value: 'Enter', keys: ['Enter'] }
    ]
  },
  {
    name: 'Lock PC Workstation',
    desc: 'Securely locks Windows session',
    actions: [
      { id: '1', type: 'combo', value: 'Win+L', keys: ['Win', 'L'] }
    ]
  }
];

const INITIAL_MACROS: MacroSlot[] = Array.from({ length: 16 }, (_, i) => {
  if (i === 0) {
    return {
      id: 0,
      name: 'Copy & Paste Helper',
      description: 'Quick clipboard duplicate sequence',
      actions: [
        { id: 'm0-1', type: 'combo', value: 'Ctrl+C', keys: ['Ctrl', 'C'] },
        { id: 'm0-2', type: 'delay', value: '100', delayMs: 100 },
        { id: 'm0-3', type: 'combo', value: 'Ctrl+V', keys: ['Ctrl', 'V'] }
      ]
    };
  }
  if (i === 1) {
    return {
      id: 1,
      name: 'Git Status & Log',
      description: 'Executes git status and recent commits',
      actions: [
        { id: 'm1-1', type: 'text', value: 'git status && git log -n 3' },
        { id: 'm1-2', type: 'delay', value: '150', delayMs: 150 },
        { id: 'm1-3', type: 'combo', value: 'Enter', keys: ['Enter'] }
      ]
    };
  }
  return {
    id: i,
    name: `Macro M${i}`,
    description: 'Empty programmable slot',
    actions: []
  };
});

interface ViaMacroEditorProps {
  selectedKeyIndex?: number | null;
  onAssignToKey?: (keyIndex: number, macroId: number, macroName: string) => void;
  onTriggerAction?: (actionId: string, actionName: string, category: string) => void;
}

export const ViaMacroEditor: React.FC<ViaMacroEditorProps> = ({
  selectedKeyIndex,
  onAssignToKey,
  onTriggerAction,
}) => {
  const [macros, setMacros] = useState<MacroSlot[]>(() => {
    const saved = localStorage.getItem('kadowaz_macros');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
    return INITIAL_MACROS;
  });

  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [activeBuilderTab, setActiveBuilderTab] = useState<'record' | 'combo' | 'text' | 'delay' | 'templates'>('combo');
  
  // Builder form states
  const [newText, setNewText] = useState('');
  const [appendEnterWithText, setAppendEnterWithText] = useState(true);
  const [newDelay, setNewDelay] = useState('100');
  
  // Combo Builder states
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('C');

  // Live recording state
  const [isRecording, setIsRecording] = useState(false);
  const lastKeyTimeRef = useRef<number>(0);

  // Status & Test playback feedback
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [assignedSuccess, setAssignedSuccess] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [activePlayStep, setActivePlayStep] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('kadowaz_macros', JSON.stringify(macros));
  }, [macros]);

  const currentMacro = macros.find(m => m.id === selectedSlot) || macros[0];

  // Live Keystroke Recording Hook
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept ESC if user wants to exit recording
      if (e.key === 'Escape') {
        setIsRecording(false);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const now = performance.now();
      const delta = lastKeyTimeRef.current ? Math.min(Math.round(now - lastKeyTimeRef.current), 1500) : 0;
      lastKeyTimeRef.current = now;

      const keyName = normalizeKeyName(e.key);

      setMacros(prev => prev.map(m => {
        if (m.id !== selectedSlot) return m;
        const newActions = [...m.actions];
        if (delta > 30) {
          newActions.push({
            id: `rec-del-${Date.now()}-${Math.random()}`,
            type: 'delay',
            value: `${delta}`,
            delayMs: delta
          });
        }
        newActions.push({
          id: `rec-dn-${Date.now()}-${Math.random()}`,
          type: 'down',
          value: keyName
        });
        return { ...m, actions: newActions };
      }));
      playKeyClick('down');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      e.preventDefault();
      e.stopPropagation();

      const keyName = normalizeKeyName(e.key);
      setMacros(prev => prev.map(m => {
        if (m.id !== selectedSlot) return m;
        return {
          ...m,
          actions: [
            ...m.actions,
            {
              id: `rec-up-${Date.now()}-${Math.random()}`,
              type: 'up',
              value: keyName
            }
          ]
        };
      }));
      playKeyClick('up');
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [isRecording, selectedSlot]);

  const normalizeKeyName = (key: string): string => {
    if (key === 'Control') return 'Ctrl';
    if (key === 'Meta') return 'Win';
    if (key === 'Alt') return 'Alt';
    if (key === 'Shift') return 'Shift';
    if (key === ' ') return 'Space';
    return key;
  };

  const handleUpdateName = (name: string) => {
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, name } : m));
  };

  const handleUpdateDesc = (description: string) => {
    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, description } : m));
  };

  const addComboAction = () => {
    const keys = [...selectedModifiers];
    if (selectedKey && !keys.includes(selectedKey)) {
      keys.push(selectedKey);
    }
    if (keys.length === 0) return;

    const action: MacroAction = {
      id: `act-${Date.now()}-${Math.random()}`,
      type: 'combo',
      value: keys.join('+'),
      keys
    };

    setMacros(prev => prev.map(m => m.id === selectedSlot ? { ...m, actions: [...m.actions, action] } : m));
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

  const applyTemplate = (tpl: typeof DEFAULT_MACRO_TEMPLATES[0]) => {
    setMacros(prev => prev.map(m => {
      if (m.id !== selectedSlot) return m;
      return {
        ...m,
        name: tpl.name,
        description: tpl.desc,
        actions: tpl.actions.map(a => ({ ...a, id: `tpl-${Date.now()}-${Math.random()}` }))
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

  const handleSaveToEEPROM = () => {
    localStorage.setItem('kadowaz_macros', JSON.stringify(macros));
    setSavedSuccess(true);
    playKeyClick('heavy');
    onTriggerAction?.(`macro-save-${selectedSlot}`, `Saved Macro M${selectedSlot} to MCU Flash EEPROM`, 'info');
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  const handleAssignToSelectedDeckSwitch = () => {
    const targetKeyIdx = selectedKeyIndex ?? 0;
    onAssignToKey?.(targetKeyIdx, selectedSlot, currentMacro.name);
    setAssignedSuccess(true);
    playKeyClick('heavy');
    setTimeout(() => setAssignedSuccess(false), 2000);
  };

  // Live Test Playback simulation
  const handleTestMacroRun = async () => {
    if (isPlayingTest || currentMacro.actions.length === 0) return;
    setIsPlayingTest(true);
    playKeyClick('down');

    onTriggerAction?.(
      `test-macro-start-${currentMacro.id}`,
      `▶ Executing Macro M${currentMacro.id} [${currentMacro.name}] (${currentMacro.actions.length} steps)`,
      'script'
    );

    for (let i = 0; i < currentMacro.actions.length; i++) {
      setActivePlayStep(i);
      const act = currentMacro.actions[i];
      playKeyClick('down');

      if (act.type === 'delay') {
        const ms = act.delayMs || 100;
        await new Promise(r => setTimeout(r, Math.min(ms, 300))); // Cap visual simulation delay to 300ms
      } else {
        await new Promise(r => setTimeout(r, 120));
      }
    }

    setActivePlayStep(null);
    setIsPlayingTest(false);
    playKeyClick('heavy');

    onTriggerAction?.(
      `test-macro-done-${currentMacro.id}`,
      `✓ Finished Macro M${currentMacro.id} Execution`,
      'script'
    );
  };

  // Export / Import JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(macros, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `kadowaz_deck_macros_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMacros(parsed);
          alert('Macro configuration successfully loaded!');
        }
      } catch {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Win'];
  const POPULAR_KEYS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'Enter', 'Space', 'Backspace', 'Tab', 'Escape', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
  ];

  return (
    <div className="w-full max-w-5xl space-y-5 animate-in fade-in duration-150 select-none">
      {/* Top Banner & Header */}
      <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A855F7] to-[#7E22CE] flex items-center justify-center text-white shadow-lg shadow-[#A855F7]/20">
            <Code className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">VIA Macro Studio</h2>
              <span className="px-2 py-0.5 rounded-full bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#A855F7] text-[10px] font-mono font-bold">
                M0 – M15 SLOTS
              </span>
            </div>
            <p className="text-xs text-white/50">
              Hardware Flash / EEPROM multi-step execution sequences, live keystroke recorder, and text injectors
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Export / Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import Macro JSON"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportJSON}
            title="Export Macro JSON"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Save to Flash / EEPROM button */}
          <button
            onClick={handleSaveToEEPROM}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md ${
              savedSuccess
                ? 'bg-[#38EF7D] text-black shadow-[#38EF7D]/30'
                : 'bg-[#FF5E00] text-black hover:bg-[#FF6A00] shadow-[#FF5E00]/30'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved to EEPROM!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save to EEPROM</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Slots List + Right Sequence Editor */}
      <div className="grid grid-cols-12 gap-5">
        {/* LEFT COLUMN: 16 Macro Slots Sidebar (cols 4) */}
        <div className="col-span-4 glass-panel p-3.5 rounded-2xl border border-white/10 flex flex-col space-y-2 h-[640px]">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-white/10 text-xs font-mono text-white/50">
            <span className="uppercase tracking-wider text-[10px]">Macro Memory Slots</span>
            <span className="text-[10px] text-white/30">16 Slots Available</span>
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
                  className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#A855F7]/25 to-[#A855F7]/10 border-[#A855F7]/50 shadow-md shadow-[#A855F7]/10'
                      : 'bg-black/30 border-white/5 hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#A855F7] text-white shadow-xs'
                          : 'bg-white/5 text-white/60 group-hover:text-white'
                      }`}
                    >
                      M{m.id}
                    </div>
                    <div className="truncate">
                      <div className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-white/80'}`}>
                        {m.name}
                      </div>
                      <div className="text-[10px] text-white/40 truncate">
                        {hasActions ? `${m.actions.length} sequence steps` : 'Empty slot'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasActions && (
                      <span className="w-2 h-2 rounded-full bg-[#38EF7D]" title="Populated macro" />
                    )}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'text-[#A855F7] translate-x-0.5' : 'text-white/20'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Sequence Viewer, Controls & Action Builders (cols 8) */}
        <div className="col-span-8 flex flex-col space-y-4">
          {/* Macro Card Header */}
          <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <span className="w-9 h-9 rounded-xl bg-[#A855F7]/20 border border-[#A855F7]/40 flex items-center justify-center font-mono font-extrabold text-[#A855F7] text-sm shrink-0">
                  M{currentMacro.id}
                </span>
                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={currentMacro.name}
                    onChange={(e) => handleUpdateName(e.target.value)}
                    placeholder="Enter macro label (e.g. Git Push)"
                    className="w-full bg-transparent text-white font-bold text-base focus:outline-hidden hover:bg-white/5 px-1.5 py-0.5 rounded-lg border border-transparent focus:border-white/20 transition-colors"
                  />
                  <input
                    type="text"
                    value={currentMacro.description || ''}
                    onChange={(e) => handleUpdateDesc(e.target.value)}
                    placeholder="Optional description / memo..."
                    className="w-full bg-transparent text-white/40 text-xs focus:outline-hidden hover:bg-white/5 px-1.5 py-0.5 rounded-lg border border-transparent focus:border-white/10 transition-colors"
                  />
                </div>
              </div>

              {/* Action Buttons: Run Test & Assign to Switch */}
              <div className="flex items-center gap-2">
                {/* Test Macro Playback */}
                <button
                  onClick={handleTestMacroRun}
                  disabled={isPlayingTest || currentMacro.actions.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all active:scale-95 ${
                    isPlayingTest
                      ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF] animate-pulse'
                      : currentMacro.actions.length === 0
                      ? 'opacity-40 bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-[#00F0FF]/10 hover:bg-[#00F0FF]/20 border-[#00F0FF]/40 text-[#00F0FF] hover:border-[#00F0FF]'
                  }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isPlayingTest ? 'fill-current' : ''}`} />
                  <span>{isPlayingTest ? 'Running...' : 'Test Run'}</span>
                </button>

                {/* 1-Click Assign to Current Switch on Deck */}
                <button
                  onClick={handleAssignToSelectedDeckSwitch}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                    assignedSuccess
                      ? 'bg-[#38EF7D] border-[#38EF7D] text-black'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                  }`}
                  title={`Assign Macro M${currentMacro.id} to Switch #${(selectedKeyIndex ?? 0) + 1} on the deck`}
                >
                  {assignedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Assigned to #{ (selectedKeyIndex ?? 0) + 1}!</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-[#FF5E00]" />
                      <span>Assign to Switch #{(selectedKeyIndex ?? 0) + 1}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Sequence Visualizer Area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-white/40 px-1">
                <span>ACTION SEQUENCE TIMELINE ({currentMacro.actions.length} STEPS)</span>
                {currentMacro.actions.length > 0 && (
                  <button
                    onClick={clearCurrentMacro}
                    className="text-red-400/80 hover:text-red-300 flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All Steps</span>
                  </button>
                )}
              </div>

              <div className="min-h-[140px] max-h-[170px] p-3 rounded-xl bg-[#090C12] border border-white/10 flex flex-wrap gap-2 items-center content-start overflow-y-auto scrollbar-thin">
                {currentMacro.actions.length === 0 ? (
                  <div className="w-full h-28 flex flex-col items-center justify-center text-white/30 text-xs italic gap-1">
                    <Code className="w-6 h-6 opacity-30 text-[#A855F7]" />
                    <span>No sequence steps configured yet for Macro M{currentMacro.id}.</span>
                    <span className="text-[10px] text-white/20">Record live keystrokes, add key combos, text strings, or templates below.</span>
                  </div>
                ) : (
                  currentMacro.actions.map((act, idx) => {
                    const isStepActive = activePlayStep === idx;
                    return (
                      <div
                        key={act.id || idx}
                        className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-xs transition-all ${
                          isStepActive
                            ? 'bg-[#00F0FF] text-black border-[#00F0FF] scale-105 shadow-md shadow-[#00F0FF]/50'
                            : act.type === 'combo'
                            ? 'bg-[#FF5E00]/10 border-[#FF5E00]/40 text-[#FF5E00]'
                            : act.type === 'text'
                            ? 'bg-[#38EF7D]/10 border-[#38EF7D]/40 text-[#38EF7D]'
                            : act.type === 'delay'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : act.type === 'down'
                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                            : 'bg-blue-500/5 border-blue-500/20 text-blue-400/60'
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
                              className="hover:text-white px-0.5 text-[10px]"
                            >
                              ◀
                            </button>
                          )}
                          {idx < currentMacro.actions.length - 1 && (
                            <button
                              onClick={() => moveAction(idx, 'down')}
                              title="Move step right"
                              className="hover:text-white px-0.5 text-[10px]"
                            >
                              ▶
                            </button>
                          )}
                          <button
                            onClick={() => removeAction(idx)}
                            title="Delete step"
                            className="text-red-400 hover:text-red-300 px-0.5 font-bold"
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
          <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4 flex-1">
            {/* Step Type Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
              <button
                onClick={() => setActiveBuilderTab('combo')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeBuilderTab === 'combo'
                    ? 'bg-[#FF5E00] text-black shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                <span>Key Combo</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('record')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeBuilderTab === 'record'
                    ? 'bg-red-500 text-white shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Circle className={`w-3.5 h-3.5 ${isRecording ? 'fill-current animate-ping' : ''}`} />
                <span>Live Record</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('text')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeBuilderTab === 'text'
                    ? 'bg-[#38EF7D] text-black shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Text String</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('delay')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeBuilderTab === 'delay'
                    ? 'bg-amber-400 text-black shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Delay (ms)</span>
              </button>

              <button
                onClick={() => setActiveBuilderTab('templates')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeBuilderTab === 'templates'
                    ? 'bg-[#A855F7] text-white shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Presets</span>
              </button>
            </div>

            {/* TAB 1: KEY COMBO BUILDER */}
            {activeBuilderTab === 'combo' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/50 font-mono">
                  <span>SELECT MODIFIERS & KEY:</span>
                  <span className="text-white/80 font-bold font-mono">
                    Combo: {[...selectedModifiers, selectedKey].filter(Boolean).join(' + ')}
                  </span>
                </div>

                {/* Modifiers row */}
                <div className="flex gap-2">
                  {MODIFIERS.map((mod) => {
                    const isSelected = selectedModifiers.includes(mod);
                    return (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => {
                          setSelectedModifiers(prev =>
                            prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
                          );
                          playKeyClick('down');
                        }}
                        className={`flex-1 py-1.5 rounded-lg font-mono text-xs font-bold border transition-colors ${
                          isSelected
                            ? 'bg-[#FF5E00] border-[#FF5E00] text-black'
                            : 'bg-black/40 border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {isSelected ? `✓ ${mod}` : `+ ${mod}`}
                      </button>
                    );
                  })}
                </div>

                {/* Key select grid */}
                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 max-h-32 overflow-y-auto scrollbar-thin">
                  <div className="grid grid-cols-10 gap-1.5">
                    {POPULAR_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setSelectedKey(k);
                          playKeyClick('down');
                        }}
                        className={`py-1 rounded text-xs font-mono transition-colors ${
                          selectedKey === k
                            ? 'bg-[#00F0FF] text-black font-bold'
                            : 'bg-white/5 hover:bg-white/15 text-white/80'
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={addComboAction}
                  className="w-full py-2 rounded-xl bg-[#FF5E00] hover:bg-[#FF6A00] text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Insert Combo ({[...selectedModifiers, selectedKey].filter(Boolean).join(' + ')})</span>
                </button>
              </div>
            )}

            {/* TAB 2: LIVE KEYSTROKE RECORDER */}
            {activeBuilderTab === 'record' && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-red-500 animate-ping' : 'bg-white/20'}`} />
                      {isRecording ? 'Recording active keystrokes...' : 'Keystroke Recorder Idle'}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {isRecording 
                        ? 'Press keys on your keyboard now. Delays and down/up events are captured live. Press ESC to stop.' 
                        : 'Click "Start Recording" to capture your exact keypress sequence in real-time.'}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setIsRecording(!isRecording);
                      lastKeyTimeRef.current = 0;
                      playKeyClick('heavy');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all active:scale-95 flex items-center gap-2 ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                        : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300'
                    }`}
                  >
                    <Circle className={`w-3.5 h-3.5 ${isRecording ? 'fill-current' : ''}`} />
                    <span>{isRecording ? 'Stop Recording (ESC)' : 'Start Recording'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: TEXT STRING INJECTOR */}
            {activeBuilderTab === 'text' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-white/50 uppercase block">
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
                      className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-hidden focus:border-[#38EF7D]"
                    />
                    <button
                      onClick={addTextAction}
                      disabled={!newText.trim()}
                      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                        newText.trim()
                          ? 'bg-[#38EF7D] hover:bg-[#2ED56B] text-black shadow-md'
                          : 'bg-white/5 text-white/30 cursor-not-allowed'
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
                    className="rounded bg-black/40 border-white/20 text-[#38EF7D] focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="appendEnterCheck" className="text-xs text-white/70 cursor-pointer select-none">
                    Automatically append <span className="font-mono font-bold text-[#38EF7D]">Enter</span> key at end of string
                  </label>
                </div>
              </div>
            )}

            {/* TAB 4: DELAYS */}
            {activeBuilderTab === 'delay' && (
              <div className="space-y-3">
                <label className="text-[11px] font-mono text-white/50 uppercase block">
                  Insert Timing Delay
                </label>
                <div className="flex gap-2">
                  {['50', '100', '250', '500', '1000'].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      onClick={() => setNewDelay(ms)}
                      className={`flex-1 py-1.5 rounded-lg font-mono text-xs border transition-colors ${
                        newDelay === ms
                          ? 'bg-amber-400 border-amber-400 text-black font-bold'
                          : 'bg-black/40 border-white/10 text-white/70 hover:border-white/30 hover:text-white'
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
                    className="w-32 px-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-hidden"
                  />
                  <span className="text-xs text-white/40 font-mono">milliseconds</span>
                  <button
                    onClick={addDelayAction}
                    className="ml-auto px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Insert Delay</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: PRE-BUILT TEMPLATES */}
            {activeBuilderTab === 'templates' && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-white/50 uppercase">
                  1-Click Production Macro Templates
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
                  {DEFAULT_MACRO_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => applyTemplate(tpl)}
                      className="p-2.5 rounded-xl bg-black/40 hover:bg-[#A855F7]/15 border border-white/10 hover:border-[#A855F7]/50 text-left transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold text-white group-hover:text-[#A855F7]">
                          {tpl.name}
                        </span>
                        <Sparkles className="w-3 h-3 text-[#A855F7] opacity-60 group-hover:opacity-100" />
                      </div>
                      <p className="text-[10px] text-white/40 leading-snug">
                        {tpl.desc}
                      </p>
                      <div className="mt-1.5 text-[9px] font-mono text-[#A855F7]/80">
                        {tpl.actions.length} actions
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
