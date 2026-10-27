import React, { useState, useMemo } from 'react';
import { PC_SHORTCUTS, PCShortcut } from '../data/pcShortcuts';
import { playKeyClick } from '../utils/soundEffects';
import {
  Search,
  Command,
  Monitor,
  Globe,
  FileText,
  Play,
  Terminal,
  Eye,
  Check,
  Copy,
  Zap,
  Layers,
  ArrowRight,
  Box,
  Film,
  Compass,
  Figma,
  Palette,
  Link2,
  Sparkles
} from 'lucide-react';

interface ShortcutsPanelProps {
  selectedKeyIndex: number | null;
  onAssignToKey?: (keyIndex: number, shortcut: PCShortcut) => void;
  onTriggerAction?: (actionId: string, actionName: string, category: string) => void;
}

export const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({
  selectedKeyIndex,
  onAssignToKey,
  onTriggerAction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [assignedId, setAssignedId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Shortcuts', icon: <Command className="w-3.5 h-3.5" /> },
    { id: 'links', label: 'Links & Web', icon: <Link2 className="w-3.5 h-3.5 text-[#38EF7D]" /> },
    { id: 'blender', label: 'Blender 3D', icon: <Box className="w-3.5 h-3.5 text-[#FF7A1A]" /> },
    { id: 'davinci', label: 'DaVinci Resolve', icon: <Film className="w-3.5 h-3.5 text-[#00F0FF]" /> },
    { id: 'fusion', label: 'Autodesk Fusion', icon: <Compass className="w-3.5 h-3.5 text-[#F59E0B]" /> },
    { id: 'figma', label: 'Figma', icon: <Figma className="w-3.5 h-3.5 text-[#A855F7]" /> },
    { id: 'canva', label: 'Canva', icon: <Palette className="w-3.5 h-3.5 text-[#EC4899]" /> },
    { id: 'creative', label: 'Creative (Adobe / OBS)', icon: <Sparkles className="w-3.5 h-3.5 text-[#3B82F6]" /> },
    { id: 'system', label: 'Windows System', icon: <Monitor className="w-3.5 h-3.5" /> },
    { id: 'windows', label: 'Window Snapping', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'browser', label: 'Web Browser', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'editing', label: 'Text & Editing', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'media', label: 'Media & Audio', icon: <Play className="w-3.5 h-3.5" /> },
    { id: 'dev', label: 'Developer & CLI', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'accessibility', label: 'Accessibility', icon: <Eye className="w-3.5 h-3.5" /> },
  ];

  const filteredShortcuts = useMemo(() => {
    return PC_SHORTCUTS.filter(s => {
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesCategory;
      const matchesText =
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.appName && s.appName.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q) ||
        s.keys.some(k => k.toLowerCase().includes(q));
      return matchesCategory && matchesText;
    });
  }, [searchQuery, selectedCategory]);

  const handleCopyCombo = (shortcut: PCShortcut) => {
    const text = shortcut.keys.join(' + ');
    navigator.clipboard?.writeText(text);
    setCopiedId(shortcut.id);
    playKeyClick('down');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleAssign = (shortcut: PCShortcut) => {
    const targetIdx = selectedKeyIndex ?? 0;
    onAssignToKey?.(targetIdx, shortcut);
    setAssignedId(shortcut.id);
    playKeyClick('down');
    setTimeout(() => setAssignedId(null), 1800);
  };

  const handleTest = (shortcut: PCShortcut) => {
    playKeyClick('down');
    onTriggerAction?.(
      `test-${shortcut.id}`,
      `[SHORTCUT] ${shortcut.name} (${shortcut.keys.join('+')})`,
      'hotkey'
    );
  };

  return (
    <div className="w-full h-full flex flex-col p-6 max-w-7xl mx-auto space-y-6 select-none overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#141824] via-[#10131B] to-[#121622] border border-white/10 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF5E00]/20 to-[#FF8A00]/10 border border-[#FF5E00]/40 flex items-center justify-center text-[#FF5E00] shadow-[0_0_20px_rgba(255,94,0,0.25)]">
            <Command className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-mono font-black text-white tracking-wider">
                PC & WINDOWS SHORTCUTS VAULT
              </h2>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#FF5E00]/15 text-[#FF5E00] border border-[#FF5E00]/30 font-bold">
                {PC_SHORTCUTS.length} SHORTCUTS
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Comprehensive Windows, browser, editing, and developer shortcut library with 1-click Macropad assignment
            </p>
          </div>
        </div>

        {/* Selected Deck Switch Indicator */}
        <div className="flex items-center gap-2.5 bg-black/40 px-3.5 py-2 rounded-xl border border-white/10 text-xs font-mono">
          <span className="text-white/40">Target Switch:</span>
          <span className="px-2 py-0.5 rounded-md bg-[#FF5E00] text-black font-black text-xs">
            {selectedKeyIndex !== null ? `KEY #${selectedKeyIndex + 1}` : 'KEY #1'}
          </span>
          <span className="text-[11px] text-white/50 hidden sm:inline">
            (Click 'Assign' to bind)
          </span>
        </div>
      </div>

      {/* Controls: Search Bar & Category Filters */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcuts by name, action, or keys (e.g. 'lock', 'screenshot', 'Ctrl+Shift+Esc', 'tab')..."
            className="w-full bg-[#121622] border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-[#FF5E00] shadow-inner transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-white/40 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            const count =
              cat.id === 'all'
                ? PC_SHORTCUTS.length
                : PC_SHORTCUTS.filter(s => s.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? 'bg-[#FF5E00] text-black border-[#FF5E00] font-bold shadow-[0_0_12px_rgba(255,94,0,0.35)]'
                    : 'bg-[#121622] text-white/60 hover:text-white border-white/5 hover:border-white/15'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-white/50'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Shortcuts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredShortcuts.map((s) => {
          const isCopied = copiedId === s.id;
          const isAssigned = assignedId === s.id;

          return (
            <div
              key={s.id}
              className="group glass-panel p-4 rounded-2xl border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between space-y-4 hover:shadow-xl bg-[#12151F]/90"
            >
              {/* Top: Name & Category badge */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm text-white tracking-wide group-hover:text-[#FF5E00] transition-colors">
                    {s.name}
                  </h3>
                  <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#FF5E00]/10 text-[#FF7A1A] border border-[#FF5E00]/20 whitespace-nowrap font-bold">
                    {s.appName || s.category}
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  {s.description}
                </p>
              </div>

              {/* Middle: Keyboard Keycaps */}
              <div className="flex items-center gap-1.5 flex-wrap py-1">
                {s.keys.map((k, kidx) => (
                  <React.Fragment key={kidx}>
                    <div className="px-2.5 py-1 rounded-lg bg-gradient-to-b from-[#2A2E3D] to-[#171A24] border border-white/20 text-white font-mono font-bold text-xs shadow-xs tracking-wider flex items-center justify-center min-w-[28px]">
                      {k}
                    </div>
                    {kidx < s.keys.length - 1 && (
                      <span className="text-white/30 text-xs font-mono font-bold">+</span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Bottom: Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs font-mono">
                {/* 1-Click Assign to Selected Key */}
                <button
                  type="button"
                  onClick={() => handleAssign(s)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl font-bold transition-all text-xs cursor-pointer ${
                    isAssigned
                      ? 'bg-[#38EF7D] text-black shadow-[0_0_12px_rgba(56,239,125,0.4)]'
                      : 'bg-[#FF5E00]/15 hover:bg-[#FF5E00] text-[#FF5E00] hover:text-black border border-[#FF5E00]/30 hover:border-[#FF5E00]'
                  }`}
                >
                  {isAssigned ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>ASSIGNED!</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Assign to Key #{selectedKeyIndex !== null ? selectedKeyIndex + 1 : 1}</span>
                    </>
                  )}
                </button>

                {/* Test shortcut button */}
                <button
                  type="button"
                  onClick={() => handleTest(s)}
                  title="Test trigger in telemetry"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/10 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>

                {/* Copy keys text */}
                <button
                  type="button"
                  onClick={() => handleCopyCombo(s)}
                  title="Copy shortcut combination"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/10 transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <Check className="w-3.5 h-3.5 text-[#38EF7D]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredShortcuts.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <Command className="w-8 h-8 text-white/20 mx-auto" />
          <p className="text-sm font-mono text-white/40">No shortcuts found matching "{searchQuery}"</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            className="text-xs font-mono text-[#FF5E00] hover:underline"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
