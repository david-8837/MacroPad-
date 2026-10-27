import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { playKeyClick } from '../utils/soundEffects';
import {
  Search,
  Package,
  Monitor,
  Globe,
  Music,
  MessageCircle,
  Gamepad2,
  Wrench,
  Settings,
  FolderOpen,
  Zap,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Code,
  Play,
  X,
  Sparkles,
  Plus,
  Filter,
  ArrowUpAZ,
  ArrowDownAZ,
  Clock,
} from 'lucide-react';

import { DiscoveredApp } from '../types';

export interface AppLauncherPanelProps {
  selectedKeyIndex: number | null;
  onAssignApp: (
    keyIndex: number,
    app: DiscoveredApp,
    options?: {
      customLabel?: string;
      launchArgs?: string;
      focusExisting?: boolean;
      launchMinimized?: boolean;
      channelIndex?: number;
    }
  ) => void;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: any) => void;
  activeChannelIndex?: number;
  onSelectChannel?: (channelIndex: number) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'kadowaz_app_library';
const CACHE_TIMESTAMP_KEY = 'kadowaz_app_library_ts';

type SortMode = 'az' | 'za' | 'recent';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'development', label: 'Development' },
  { id: 'browser', label: 'Browser' },
  { id: 'media', label: 'Media' },
  { id: 'communication', label: 'Communication' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'utility', label: 'Utility' },
  { id: 'system', label: 'System' },
  { id: 'game', label: 'Game' },
  { id: 'other', label: 'Other' },
] as const;

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  development: Code,
  browser: Globe,
  media: Music,
  communication: MessageCircle,
  game: Gamepad2,
  productivity: Wrench,
  utility: Settings,
  system: Monitor,
  other: Package,
};

function getCategoryIcon(category: string): React.FC<{ className?: string }> {
  return CATEGORY_ICONS[category.toLowerCase()] ?? Package;
}

// ─── Skeleton Card ─────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
  <div className="glass-panel p-4 rounded-2xl border border-white/5 animate-pulse space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/5" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/4 rounded bg-white/5" />
        <div className="h-2 w-1/2 rounded bg-white/5" />
      </div>
    </div>
    <div className="flex gap-2">
      <div className="h-4 w-16 rounded-full bg-white/5" />
      <div className="h-4 w-12 rounded-full bg-white/5" />
    </div>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

export const AppLauncherPanel: React.FC<AppLauncherPanelProps> = ({
  selectedKeyIndex,
  onAssignApp,
  onTriggerAction,
  activeChannelIndex = 0,
  onSelectChannel,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [apps, setApps] = useState<DiscoveredApp[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<string | null>(null);

  const [targetChannelIndex, setTargetChannelIndex] = useState<number>(activeChannelIndex);
  const [targetSwitchIndex, setTargetSwitchIndex] = useState<number>(selectedKeyIndex ?? 0);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('az');

  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [assignedAppId, setAssignedAppId] = useState<string | null>(null);

  // Detail-panel launch options (local to selection, not persisted)
  const [customLabel, setCustomLabel] = useState('');
  const [customArgs, setCustomArgs] = useState('');
  const [focusExisting, setFocusExisting] = useState(false);
  const [launchMinimized, setLaunchMinimized] = useState(false);
  const [launchOptionsOpen, setLaunchOptionsOpen] = useState(false);

  useEffect(() => {
    if (activeChannelIndex !== undefined) setTargetChannelIndex(activeChannelIndex);
  }, [activeChannelIndex]);

  useEffect(() => {
    if (selectedKeyIndex !== null && selectedKeyIndex !== undefined) setTargetSwitchIndex(selectedKeyIndex);
  }, [selectedKeyIndex]);

  const electronAvailable = typeof window !== 'undefined' && !!(window as any).electronAPI?.discoverApps;

  // ── Cache helpers ──────────────────────────────────────────────────────────
  const loadCache = useCallback((): DiscoveredApp[] | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (raw) {
        if (ts) setLastScanTimestamp(ts);
        return JSON.parse(raw) as DiscoveredApp[];
      }
    } catch { /* noop */ }
    return null;
  }, []);

  const saveCache = useCallback((data: DiscoveredApp[]) => {
    try {
      const ts = new Date().toISOString();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, ts);
      setLastScanTimestamp(ts);
    } catch { /* noop */ }
  }, []);

  // ── Discovery ──────────────────────────────────────────────────────────────
  const runDiscovery = useCallback(async () => {
    if (!electronAvailable) return;
    setIsScanning(true);
    setScanError(null);
    try {
      const result: DiscoveredApp[] = await (window as any).electronAPI.discoverApps();
      setApps(result);
      saveCache(result);
      setHasScannedOnce(true);
    } catch (err: any) {
      setScanError(err?.message ?? 'Unknown error during app discovery.');
    } finally {
      setIsScanning(false);
    }
  }, [electronAvailable, saveCache]);

  // ── Mount: load cache or scan ──────────────────────────────────────────────
  useEffect(() => {
    const cached = loadCache();
    if (cached && cached.length > 0) {
      setApps(cached);
      setHasScannedOnce(true);
    } else if (electronAvailable) {
      runDiscovery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Browse for app ─────────────────────────────────────────────────────────
  const handleBrowse = useCallback(async () => {
    if (!(window as any).electronAPI?.browseForApp) return;
    playKeyClick('down');
    try {
      const browsed: DiscoveredApp | null = await (window as any).electronAPI.browseForApp();
      if (browsed) {
        setApps((prev) => {
          const exists = prev.some((a) => a.id === browsed.id);
          const next = exists ? prev.map((a) => (a.id === browsed.id ? browsed : a)) : [browsed, ...prev];
          saveCache(next);
          return next;
        });
        setSelectedAppId(browsed.id);
      }
    } catch { /* noop */ }
  }, [saveCache]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const filteredApps = useMemo(() => {
    let list = apps;
    // Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((a) => a.category.toLowerCase() === selectedCategory);
    }
    // Search
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          a.exePath.toLowerCase().includes(q),
      );
    }
    // Sort
    const sorted = [...list];
    if (sortMode === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'za') sorted.sort((a, b) => b.name.localeCompare(a.name));
    // 'recent' keeps original insertion order (most recent first from discovery/browse)
    return sorted;
  }, [apps, selectedCategory, searchQuery, sortMode]);

  const selectedApp = useMemo(
    () => apps.find((a) => a.id === selectedAppId) ?? null,
    [apps, selectedAppId],
  );

  // Reset detail options when selection changes
  useEffect(() => {
    setCustomLabel('');
    setCustomArgs(selectedApp?.launchArgs ?? '');
    setFocusExisting(false);
    setLaunchMinimized(false);
    setLaunchOptionsOpen(false);
  }, [selectedAppId, selectedApp?.launchArgs]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectApp = useCallback((app: DiscoveredApp) => {
    playKeyClick('down');
    setSelectedAppId((prev) => (prev === app.id ? null : app.id));
  }, []);

  const handleAssign = useCallback(() => {
    if (!selectedApp) return;
    const targetIdx = targetSwitchIndex;
    playKeyClick('heavy');
    onAssignApp(
      targetIdx,
      { ...selectedApp, launchArgs: customArgs },
      {
        customLabel: customLabel.trim() || undefined,
        launchArgs: customArgs,
        focusExisting,
        launchMinimized,
        channelIndex: targetChannelIndex,
      }
    );
    setAssignedAppId(selectedApp.id);
    setTimeout(() => setAssignedAppId(null), 1800);
  }, [
    selectedApp,
    targetSwitchIndex,
    targetChannelIndex,
    onAssignApp,
    customArgs,
    customLabel,
    focusExisting,
    launchMinimized,
  ]);

  const handleTestLaunch = useCallback(() => {
    if (!selectedApp) return;
    playKeyClick('down');
    onTriggerAction(
      `launch-${selectedApp.id}`,
      `[APP] ${selectedApp.name}`,
      'app_launch',
      {
        appId: selectedApp.appId || '',
        appName: selectedApp.name,
        exePath: selectedApp.exePath,
        launchArgs: customArgs || selectedApp.launchArgs,
        focusExisting,
        launchMinimized,
        iconDataUrl: selectedApp.iconDataUrl,
        targetType: selectedApp.targetType,
        source: selectedApp.source,
      }
    );
  }, [selectedApp, onTriggerAction, customArgs, focusExisting, launchMinimized]);

  // ── Computed stats ─────────────────────────────────────────────────────────
  const validCount = useMemo(() => apps.filter((a) => a.isValid).length, [apps]);

  const formattedTimestamp = useMemo(() => {
    if (!lastScanTimestamp) return null;
    try {
      return new Date(lastScanTimestamp).toLocaleString();
    } catch {
      return lastScanTimestamp;
    }
  }, [lastScanTimestamp]);

  // ── Electron not available ─────────────────────────────────────────────────
  if (!electronAvailable && !hasScannedOnce && apps.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 space-y-4 select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#FF5E00]/10 border border-[#FF5E00]/30 flex items-center justify-center shadow-[0_0_30px_rgba(255,94,0,0.15)]">
          <Monitor className="w-8 h-8 text-[#FF5E00]" />
        </div>
        <h3 className="text-base font-mono font-bold text-white tracking-wide">
          Desktop Companion Required
        </h3>
        <p className="text-xs text-white/50 text-center max-w-md leading-relaxed">
          Application discovery requires the KADOWAZ desktop companion.
          <br />
          Run the app via Electron to scan and manage installed applications.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-mono text-white/30">
          <AlertCircle className="w-3 h-3" />
          <span>window.electronAPI not detected</span>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full h-full flex flex-col p-6 max-w-[1600px] mx-auto space-y-5 select-none overflow-hidden">
      {/* ── Header Banner ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#141824] via-[#10131B] to-[#121622] border border-white/10 shadow-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF5E00]/20 to-[#FF8A00]/10 border border-[#FF5E00]/40 flex items-center justify-center text-[#FF5E00] shadow-[0_0_20px_rgba(255,94,0,0.25)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-mono font-black text-white tracking-wider">
                APPLICATION LIBRARY
              </h2>
              {apps.length > 0 && (
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#FF5E00]/15 text-[#FF5E00] border border-[#FF5E00]/30 font-bold">
                  {apps.length} APPS
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Discover, browse, and assign installed applications to your macropad switches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Browse Button */}
          {electronAvailable && (
            <button
              onClick={handleBrowse}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Browse for App…</span>
            </button>
          )}

          {/* Rescan Button */}
          {electronAvailable && hasScannedOnce && (
            <button
              onClick={runDiscovery}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning…' : 'Rescan'}</span>
            </button>
          )}

          {/* Layer Selector */}
          <div className="flex items-center gap-1 bg-black/40 px-2 py-1.5 rounded-xl border border-white/10 text-xs font-mono">
            <span className="text-[10px] text-white/40 uppercase mr-1">Layer:</span>
            {[0, 1, 2].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => {
                  setTargetChannelIndex(ch);
                  onSelectChannel?.(ch);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  targetChannelIndex === ch
                    ? 'bg-[#FF5E00] text-black shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Layer {ch + 1}
              </button>
            ))}
          </div>

          {/* Target Switch Selector */}
          <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/10 text-xs font-mono">
            <span className="text-[10px] text-white/40 uppercase">Key:</span>
            <select
              value={targetSwitchIndex}
              onChange={(e) => setTargetSwitchIndex(Number(e.target.value))}
              className="bg-[#121622] text-[#FF5E00] font-bold text-xs rounded px-1.5 py-0.5 border border-white/10 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <option key={i} value={i}>
                  #{i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Scanning State ─────────────────────────────────────────────────── */}
      {isScanning && apps.length === 0 && (
        <div className="space-y-4 shrink-0">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-[#FF5E00] animate-spin" />
            <span className="text-sm font-mono text-white/60">Scanning installed applications…</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Error State ────────────────────────────────────────────────────── */}
      {scanError && (
        <div className="glass-panel p-5 rounded-2xl border border-red-500/30 bg-red-500/5 flex items-center gap-4 shrink-0">
          <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-mono text-red-300 font-bold">Discovery Failed</p>
            <p className="text-xs text-red-400/70 mt-0.5">{scanError}</p>
          </div>
          <button
            onClick={runDiscovery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* ── Search, Category Filters & Sort ────────────────────────────────── */}
      {!isScanning && apps.length > 0 && (
        <div className="space-y-3 shrink-0">
          {/* Search + Sort Row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, category, or path…"
                className="w-full bg-[#121622] border border-white/10 rounded-2xl pl-11 pr-10 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-[#FF5E00] shadow-inner transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center gap-1 bg-[#121622] border border-white/10 rounded-xl p-0.5">
              <button
                onClick={() => setSortMode('az')}
                title="Sort A → Z"
                className={`p-2 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  sortMode === 'az'
                    ? 'bg-[#FF5E00]/20 text-[#FF5E00] border border-[#FF5E00]/30'
                    : 'text-white/40 hover:text-white border border-transparent'
                }`}
              >
                <ArrowUpAZ className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSortMode('za')}
                title="Sort Z → A"
                className={`p-2 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  sortMode === 'za'
                    ? 'bg-[#FF5E00]/20 text-[#FF5E00] border border-[#FF5E00]/30'
                    : 'text-white/40 hover:text-white border border-transparent'
                }`}
              >
                <ArrowDownAZ className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSortMode('recent')}
                title="Recently Added"
                className={`p-2 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  sortMode === 'recent'
                    ? 'bg-[#FF5E00]/20 text-[#FF5E00] border border-[#FF5E00]/30'
                    : 'text-white/40 hover:text-white border border-transparent'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <Filter className="w-3.5 h-3.5 text-white/30 shrink-0" />
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const count =
                cat.id === 'all'
                  ? apps.length
                  : apps.filter((a) => a.category.toLowerCase() === cat.id).length;
              if (cat.id !== 'all' && count === 0) return null;
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
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 rounded-full ${
                      isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Result count */}
          <div className="text-[10px] font-mono text-white/30 pl-1">
            {filteredApps.length} of {apps.length} applications
          </div>
        </div>
      )}

      {/* ── Main Content: Grid + Detail Sidebar ────────────────────────────── */}
      {!isScanning && apps.length > 0 && (
        <div className="flex gap-5 flex-1 min-h-0">
          {/* App Grid */}
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-none">
            {filteredApps.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredApps.map((app) => {
                  const isSelected = selectedAppId === app.id;
                  const CatIcon = getCategoryIcon(app.category);
                  return (
                    <button
                      key={app.id}
                      onClick={() => handleSelectApp(app)}
                      className={`group glass-panel p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#FF5E00] shadow-[0_0_16px_rgba(255,94,0,0.25)] bg-[#FF5E00]/5'
                          : 'border-white/10 hover:border-white/20 hover:shadow-lg bg-[#12151F]/90'
                      }`}
                    >
                      {/* Icon + Validity dot */}
                      <div className="flex items-start gap-3 mb-2.5">
                        <div className="relative shrink-0">
                          {app.iconDataUrl ? (
                            <img
                              src={app.iconDataUrl}
                              alt={app.name}
                              className="w-10 h-10 rounded-xl object-contain bg-white/5 p-1"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                              <CatIcon className="w-5 h-5 text-white/40" />
                            </div>
                          )}
                          {/* Validity indicator */}
                          <span
                            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#12151F] ${
                              app.isValid ? 'bg-[#38EF7D]' : 'bg-red-500'
                            }`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate transition-colors ${
                              isSelected
                                ? 'text-[#FF5E00]'
                                : 'text-white group-hover:text-[#FF5E00]'
                            }`}
                          >
                            {app.name}
                          </p>
                          <p className="text-[10px] font-mono text-white/30 truncate mt-0.5">
                            {app.source}
                          </p>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#FF5E00]/10 text-[#FF7A1A] border border-[#FF5E00]/20 font-bold">
                          {app.category}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* No search results */
              <div className="py-20 text-center space-y-3">
                <Search className="w-8 h-8 text-white/15 mx-auto" />
                <p className="text-sm font-mono text-white/40">
                  No applications match your search
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="text-xs font-mono text-[#FF5E00] hover:underline cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* ── Detail Sidebar ─────────────────────────────────────────────── */}
          <div className="w-80 shrink-0 glass-panel rounded-2xl border border-white/10 overflow-y-auto scrollbar-none">
            {selectedApp ? (
              <div className="p-5 space-y-5">
                {/* Header */}
                <div className="flex items-start gap-4">
                  {selectedApp.iconDataUrl ? (
                    <img
                      src={selectedApp.iconDataUrl}
                      alt={selectedApp.name}
                      className="w-14 h-14 rounded-2xl object-contain bg-white/5 p-1.5 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                      {(() => {
                        const Icon = getCategoryIcon(selectedApp.category);
                        return <Icon className="w-7 h-7 text-white/40" />;
                      })()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white leading-tight break-words">
                      {selectedApp.name}
                    </h3>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#FF5E00]/10 text-[#FF7A1A] border border-[#FF5E00]/20 font-bold inline-block mt-1.5">
                      {selectedApp.category}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="space-y-3">
                  {/* Exe Path */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-white/40 mb-1 block">
                      Executable Path
                    </label>
                    <div className="group/path relative">
                      <p className="text-[11px] font-mono text-white/60 truncate bg-black/30 px-3 py-2 rounded-lg border border-white/5">
                        {selectedApp.exePath}
                      </p>
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover/path:block max-w-sm z-50">
                        <div className="bg-[#0C0E14] border border-white/20 rounded-lg px-3 py-2 text-[10px] font-mono text-white/80 shadow-xl break-all">
                          {selectedApp.exePath}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Source */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-white/40 mb-1 block">
                      Source
                    </label>
                    <p className="text-xs font-mono text-white/60">{selectedApp.source}</p>
                  </div>

                  {/* Validation Status */}
                  <div>
                    <label className="text-[10px] font-mono uppercase text-white/40 mb-1 block">
                      Status
                    </label>
                    <div className="flex items-center gap-2">
                      {selectedApp.isValid ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#38EF7D]" />
                          <span className="text-xs font-mono text-[#38EF7D]">Valid — executable found</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-xs font-mono text-red-400">Invalid — path not found</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* Launch Options (Expandable) */}
                <div>
                  <button
                    onClick={() => setLaunchOptionsOpen((v) => !v)}
                    className="flex items-center justify-between w-full text-xs font-mono text-white/60 hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="uppercase text-[10px] font-bold tracking-wider">
                      Launch Options
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        launchOptionsOpen ? 'rotate-90' : ''
                      }`}
                    />
                  </button>

                  {launchOptionsOpen && (
                    <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      {/* Custom Label */}
                      <div>
                        <label className="text-[10px] font-mono uppercase text-white/40 mb-1 block">
                          Custom Label
                        </label>
                        <input
                          type="text"
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder={selectedApp.name}
                          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#FF5E00] transition-colors"
                        />
                      </div>

                      {/* Launch Args */}
                      <div>
                        <label className="text-[10px] font-mono uppercase text-white/40 mb-1 block">
                          Launch Arguments
                        </label>
                        <input
                          type="text"
                          value={customArgs}
                          onChange={(e) => setCustomArgs(e.target.value)}
                          placeholder="--arg=value"
                          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#FF5E00] transition-colors"
                        />
                      </div>

                      {/* Checkboxes */}
                      <label className="flex items-center gap-2 cursor-pointer group/check">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            focusExisting
                              ? 'bg-[#FF5E00] border-[#FF5E00]'
                              : 'border-white/20 bg-black/30 group-hover/check:border-white/40'
                          }`}
                        >
                          {focusExisting && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>
                        <span className="text-[11px] font-mono text-white/60">
                          Focus existing window if running
                        </span>
                        <input
                          type="checkbox"
                          checked={focusExisting}
                          onChange={(e) => setFocusExisting(e.target.checked)}
                          className="sr-only"
                        />
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer group/check">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                            launchMinimized
                              ? 'bg-[#FF5E00] border-[#FF5E00]'
                              : 'border-white/20 bg-black/30 group-hover/check:border-white/40'
                          }`}
                        >
                          {launchMinimized && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>
                        <span className="text-[11px] font-mono text-white/60">Launch minimized</span>
                        <input
                          type="checkbox"
                          checked={launchMinimized}
                          onChange={(e) => setLaunchMinimized(e.target.checked)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-white/5" />

                {/* Action Buttons */}
                <div className="space-y-2.5">
                  {/* Assign Button */}
                  <button
                    onClick={handleAssign}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                      assignedAppId === selectedApp.id
                        ? 'bg-[#38EF7D] text-black shadow-[0_0_16px_rgba(56,239,125,0.4)]'
                        : 'bg-[#FF5E00]/15 hover:bg-[#FF5E00] text-[#FF5E00] hover:text-black border border-[#FF5E00]/30 hover:border-[#FF5E00]'
                    }`}
                  >
                    {assignedAppId === selectedApp.id ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>ASSIGNED!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>
                          Assign to Switch #{targetSwitchIndex + 1} (Layer {targetChannelIndex + 1})
                        </span>
                      </>
                    )}
                  </button>

                  {/* Test Launch Button */}
                  <button
                    onClick={handleTestLaunch}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-mono font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Test Launch</span>
                  </button>
                </div>
              </div>
            ) : (
              /* No app selected hint */
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-white/20" />
                </div>
                <p className="text-sm font-mono text-white/40">Select an application</p>
                <p className="text-[10px] font-mono text-white/25 max-w-[200px] leading-relaxed">
                  Click an app card in the grid to view details and assign it to a switch
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty State (no apps discovered at all) ────────────────────────── */}
      {!isScanning && apps.length === 0 && !scanError && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Package className="w-8 h-8 text-white/20" />
          </div>
          <h3 className="text-sm font-mono font-bold text-white/50">No Applications Discovered</h3>
          <p className="text-xs text-white/30 text-center max-w-sm">
            No installed applications were found. Try rescanning or use &ldquo;Browse for App&rdquo; to manually locate an executable.
          </p>
          {electronAvailable && (
            <button
              onClick={runDiscovery}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-[#FF5E00]/15 hover:bg-[#FF5E00] text-[#FF5E00] hover:text-black border border-[#FF5E00]/30 hover:border-[#FF5E00] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Rescan Applications
            </button>
          )}
        </div>
      )}

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      {apps.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#0C0E14] border border-white/5 text-[10px] font-mono text-white/30 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Package className="w-3 h-3" />
              <span>{apps.length} apps discovered</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-[#38EF7D]/60" />
              <span>{validCount} valid</span>
            </span>
            {apps.length - validCount > 0 && (
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-red-400/60" />
                <span>{apps.length - validCount} invalid</span>
              </span>
            )}
          </div>
          {formattedTimestamp && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Last scan: {formattedTimestamp}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
