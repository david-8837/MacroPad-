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

/* A reference sheet, not a binding tool. Copy a combo, then assign it from
 * the switch drawer. The MPAD3 quick tray offers a reviewed single-key subset. */
export const ShortcutsPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Shortcuts', icon: <Command className="w-3.5 h-3.5" /> },
    { id: 'links', label: 'Links & Web', icon: <Link2 className="w-3.5 h-3.5 text-[#1351AA]" /> },
    { id: 'blender', label: 'Blender 3D', icon: <Box className="w-3.5 h-3.5 text-[#1351AA]" /> },
    { id: 'davinci', label: 'DaVinci Resolve', icon: <Film className="w-3.5 h-3.5 text-[#1351AA]" /> },
    { id: 'fusion', label: 'Autodesk Fusion', icon: <Compass className="w-3.5 h-3.5 text-[#1351AA]" /> },
    { id: 'figma', label: 'Figma', icon: <Figma className="w-3.5 h-3.5 text-[#444343]" /> },
    { id: 'canva', label: 'Canva', icon: <Palette className="w-3.5 h-3.5 text-[#444343]" /> },
    { id: 'creative', label: 'Creative (Adobe)', icon: <Sparkles className="w-3.5 h-3.5 text-[#1351AA]" /> },
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

  return (
    <div className="w-full h-full flex flex-col p-6 max-w-7xl mx-auto space-y-6 select-none overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5  border border-[#E3E2DE] ">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
            <Command className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-mono font-black text-[#141414] tracking-wider">
                PC & WINDOWS SHORTCUTS VAULT
              </h2>
              <span className="text-[10px] font-mono px-2.5 py-0.5 bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7] font-bold">
                {PC_SHORTCUTS.length} SHORTCUTS
              </span>
            </div>
            <p className="text-xs text-[#646464] mt-0.5">
              Reference list of Windows, browser, editing and developer shortcuts. Copy a combo, then assign it in the switch drawer; the MPAD3 quick tray offers reviewed tap keys.
            </p>
          </div>
        </div>
      </div>

      {/* Controls: Search Bar & Category Filters */}
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#646464]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shortcuts by name, action, or keys (e.g. 'lock', 'screenshot', 'Ctrl+Shift+Esc', 'tab')..."
            className="w-full bg-[#FFFFFF] border border-[#E3E2DE] pl-11 pr-4 py-3 text-sm text-[#141414] font-mono focus:outline-none focus:border-[#1351AA] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-[#646464] hover:text-[#141414]"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-all whitespace-nowrap cursor-pointer border ${
 isActive
 ? 'bg-[#1351AA] text-[#E3E2DE] border-[#1351AA] font-bold'
 : 'bg-[#FFFFFF] text-[#444343] hover:text-[#141414] border-[#E3E2DE] hover:border-[#C7C7C7]'
 }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 ${
 isActive ? 'bg-[#141414] text-[#E3E2DE]' : 'bg-[#EDECE8] text-[#646464]'
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

          return (
            <div
              key={s.id}
              className="group panel p-4 border border-[#E3E2DE] hover:border-[#C7C7C7] transition-all flex flex-col justify-between space-y-4 bg-[#FFFFFF]"
            >
              {/* Top: Name & Category badge */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm text-[#141414] tracking-wide group-hover:text-[#1351AA] transition-colors">
                    {s.name}
                  </h3>
                  <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7] whitespace-nowrap font-bold">
                    {s.appName || s.category}
                  </span>
                </div>
                <p className="text-xs text-[#646464] leading-relaxed">
                  {s.description}
                </p>
              </div>

              {/* Middle: Keyboard Keycaps */}
              <div className="flex items-center gap-1.5 flex-wrap py-1">
                {s.keys.map((k, kidx) => (
                  <React.Fragment key={kidx}>
                    <div className="px-2.5 py-1  border border-[#C7C7C7] text-[#141414] font-mono font-bold text-xs tracking-wider flex items-center justify-center min-w-[28px]">
                      {k}
                    </div>
                    {kidx < s.keys.length - 1 && (
                      <span className="text-[#646464] text-xs font-mono font-bold">+</span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Bottom: copy the combo */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E3E2DE] text-xs font-mono">
                <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#646464]">
                  {s.keys.join('+')}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCombo(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
 isCopied
 ? 'bg-[#1351AA] border-[#1351AA] text-[#E3E2DE]'
 : 'bg-[#EDECE8] border-[#C7C7C7] text-[#444343] hover:border-[#141414] hover:text-[#141414]'
 }`}
                >
                  {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredShortcuts.length === 0 && (
        <div className="py-16 text-center space-y-2">
          <Command className="w-8 h-8 text-[#646464] mx-auto" />
          <p className="text-sm font-mono text-[#646464]">No shortcuts found matching "{searchQuery}"</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            className="text-xs font-mono text-[#1351AA] hover:underline"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
