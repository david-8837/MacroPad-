import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PC_SHORTCUTS, PCShortcut } from '../data/pcShortcuts';
import { matchesShortcut } from '../utils/shortcutSearch';
import { playKeyClick } from '../utils/soundEffects';
import {
  Search, Command, Monitor, Globe, FileText, Play, Terminal, Eye, Check,
  Copy, Layers, Box, Film, Compass, Figma, Palette, Link2, Sparkles, X,
  Keyboard,
} from 'lucide-react';

type Category = PCShortcut['category'] | 'all';
const CATEGORIES: { id: Category; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All shortcuts', icon: Command },
  { id: 'links', label: 'Links & web', icon: Link2 },
  { id: 'blender', label: 'Blender 3D', icon: Box },
  { id: 'davinci', label: 'DaVinci Resolve', icon: Film },
  { id: 'fusion', label: 'Autodesk Fusion', icon: Compass },
  { id: 'figma', label: 'Figma', icon: Figma },
  { id: 'canva', label: 'Canva', icon: Palette },
  { id: 'creative', label: 'Creative (Adobe)', icon: Sparkles },
  { id: 'system', label: 'Windows system', icon: Monitor },
  { id: 'windows', label: 'Window snapping', icon: Layers },
  { id: 'browser', label: 'Web browser', icon: Globe },
  { id: 'editing', label: 'Text & editing', icon: FileText },
  { id: 'media', label: 'Media & audio', icon: Play },
  { id: 'dev', label: 'Developer & CLI', icon: Terminal },
  { id: 'accessibility', label: 'Accessibility', icon: Eye },
];
const COUNTS = Object.fromEntries(CATEGORIES.map(category => [
  category.id, category.id === 'all' ? PC_SHORTCUTS.length : PC_SHORTCUTS.filter(s => s.category === category.id).length,
])) as Record<Category, number>;

/** Reference only: copying text does not assign a shortcut to a pad. */
export const ShortcutsPanel: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copyTimer = useRef<number | undefined>();
  const copyRequest = useRef(0);

  useEffect(() => () => {
    copyRequest.current += 1;
    window.clearTimeout(copyTimer.current);
  }, []);

  const filteredShortcuts = useMemo(() => {
    return PC_SHORTCUTS.filter(s => {
      if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
      const categoryLabel = CATEGORIES.find(category => category.id === s.category)?.label || '';
      return matchesShortcut(s, searchQuery, categoryLabel);
    });
  }, [searchQuery, selectedCategory]);

  const handleCopyCombo = async (shortcut: PCShortcut) => {
    const request = ++copyRequest.current;
    window.clearTimeout(copyTimer.current);
    setCopiedId(null);
    setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shortcut.keys.join(' + '));
      if (request !== copyRequest.current) return;
      setCopiedId(shortcut.id);
      playKeyClick('down');
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      if (request === copyRequest.current) setCopyError('Could not copy to the clipboard. You can use the keys shown on the card instead.');
    }
  };

  const activeCategory = CATEGORIES.find(category => category.id === selectedCategory) || CATEGORIES[0];
  return (
    <main className="w-full h-full overflow-y-auto bg-[#F4F3F0]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <header className="border-b border-[#C7C7C7] pb-5 flex items-start gap-4">
          <div className="shortcut-header-icon w-11 h-11 border border-[#C7C7C7] bg-white flex items-center justify-center shrink-0"><Command className="w-5 h-5 text-[#1351AA]" /></div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">QUICK REFERENCE · WINDOWS &amp; APPS</p>
            <h1 className="text-2xl font-bold text-[#141414] mt-1">Shortcuts vault</h1>
            <p className="text-sm text-[#646464] mt-1">Find the right keys for your workflow.</p>
          </div>
          <div className="hidden sm:block text-right shrink-0"><p className="eyebrow">IN THE LIBRARY</p><p className="font-mono text-lg font-bold text-[#1351AA] mt-1">{PC_SHORTCUTS.length} <span className="text-[10px] text-[#646464] font-normal">SHORTCUTS</span></p></div>
        </header>

        <div className="shortcut-guide border border-[#C7C7C7] bg-white p-4 flex items-start gap-3">
          <Keyboard className="w-4 h-4 text-[#1351AA] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 text-xs leading-relaxed text-[#444343]"><strong className="text-[#141414]">A reference, not a binding tool.</strong> Use the shown keys in the key editor, then review and upload your deck. Copy only copies the text. Shortcuts can vary by app, OS or keymap; some may be sequences or unsupported on the pad.</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
          <aside className="shortcut-categories border border-[#C7C7C7] bg-white lg:sticky lg:top-0" aria-label="Shortcut categories">
            <div className="px-4 py-3 border-b border-[#E3E2DE] flex justify-between items-center"><span className="eyebrow eyebrow--ink">Browse categories</span><span className="idx">{CATEGORIES.length - 1}</span></div>
            <div className="p-3 lg:hidden">
              <label htmlFor="shortcut-category" className="sr-only">Shortcut category</label>
              <select id="shortcut-category" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value as Category)} className="w-full border border-[#C7C7C7] bg-white px-3 py-2 text-sm">
                {CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label} ({COUNTS[category.id]})</option>)}
              </select>
            </div>
            <div className="hidden lg:flex flex-col p-2 gap-0.5">
              {CATEGORIES.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={selectedCategory === id} onClick={() => setSelectedCategory(id)} className={`shortcut-category flex items-center gap-2.5 px-2.5 py-2 text-left text-xs ${selectedCategory === id ? 'shortcut-category--active' : 'text-[#444343]'}`}>
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /><span className="flex-1 min-w-0">{label}</span><span className="font-mono text-[10px] text-[#646464]">{COUNTS[id]}</span>
              </button>)}
            </div>
          </aside>

          <section aria-label="Shortcut library" className="min-w-0 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#646464] pointer-events-none" aria-hidden="true" />
              <label htmlFor="shortcut-search" className="sr-only">Search shortcuts</label>
              <input id="shortcut-search" type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search actions, apps or keys (e.g. Ctrl+Shift+Esc)" className="shortcut-search w-full bg-white border border-[#C7C7C7] pl-11 pr-14 py-3 text-sm text-[#141414] focus:outline-none focus:border-[#1351AA]" />
              {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#646464] hover:text-[#141414]"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#C7C7C7] pb-3">
              <div><p className="eyebrow">SHORTCUT LIBRARY</p><h2 className="font-bold text-[#141414] mt-1">{activeCategory.label}</h2></div>
              <p role="status" aria-live="polite" className="font-mono text-[10px] text-[#646464]">{filteredShortcuts.length} {filteredShortcuts.length === 1 ? 'RESULT' : 'RESULTS'}</p>
            </div>
            <p role="status" aria-live="polite" className="sr-only">{copiedId ? `${PC_SHORTCUTS.find(shortcut => shortcut.id === copiedId)?.name || 'Shortcut'} copied to clipboard.` : ''}</p>
            {copyError && <p role="alert" className="border border-[#E6C894] bg-[#FFF5E4] p-3 text-xs text-[#8A4B00]">{copyError}</p>}
            {filteredShortcuts.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredShortcuts.map(s => {
                const isCopied = copiedId === s.id;
                const categoryLabel = CATEGORIES.find(category => category.id === s.category)?.label || s.category;
                return <article key={s.id} className="shortcut-card panel min-w-0 p-4 flex flex-col bg-white">
                  <div className="text-[9px] font-mono uppercase tracking-wide text-[#1351AA] font-bold break-words">{s.appName || categoryLabel}</div>
                  <h3 className="font-bold text-sm text-[#141414] mt-2 leading-snug">{s.name}</h3>
                  <p className="text-xs text-[#646464] leading-relaxed mt-1.5">{s.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-5 pb-4" aria-label={`Keys: ${s.keys.join(' plus ')}`}>
                    {s.keys.map((key, index) => <React.Fragment key={index}><kbd className="shortcut-keycap px-2 py-1 border border-[#C7C7C7] font-mono font-bold text-[11px] text-[#141414]">{key}</kbd>{index < s.keys.length - 1 && <span className="text-[#7A7A7A] text-[10px] font-mono" aria-hidden="true">+</span>}</React.Fragment>)}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#E3E2DE]"><span className="font-mono text-[9px] uppercase tracking-wide text-[#646464]">{s.keys.length} {s.keys.length === 1 ? 'KEY' : 'KEYS'}</span>
                    <button type="button" aria-label={`Copy ${s.name} shortcut`} onClick={() => void handleCopyCombo(s)} className={`shortcut-copy flex items-center gap-1.5 px-2.5 py-1.5 border text-[10px] font-bold uppercase tracking-wide ${isCopied ? 'bg-[#1351AA] border-[#1351AA] text-white' : 'bg-[#F4F3F0] border-[#C7C7C7] text-[#444343] hover:border-[#1351AA] hover:text-[#1351AA]'}`}>
                      {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}<span>{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </article>;
              })}
            </div> : <div className="border border-dashed border-[#C7C7C7] bg-white py-14 px-5 text-center space-y-3"><Search className="w-7 h-7 text-[#7A7A7A] mx-auto" aria-hidden="true" /><p className="text-sm font-bold">No shortcuts found</p><p className="text-xs text-[#646464]">Try a different search or browse another category.</p><button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }} className="text-xs font-bold text-[#1351AA] hover:underline">Reset filters</button></div>}
          </section>
        </div>
      </div>
    </main>
  );
};
