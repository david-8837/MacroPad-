import React, { useCallback, useRef, useState } from 'react';
import { OLEDMode, OLEDState } from '../types';
import { OLEDDisplay } from './OLEDDisplay';
import { OLEDCanvas } from './OLEDCanvas';
import { OLED_MODES } from '../oled/modes';
import {
  AUTO_CYCLE_DEFAULT_S,
  MAX_AUTO_CYCLE_S,
  MIN_AUTO_CYCLE_S,
  capacityFor,
  formatCapacity,
  formatFootprint,
} from '../oled/capacity';
import {
  DEFAULT_PLAYLIST,
  clampAutoCycleS,
  nextInPlaylist,
  normalizePlaylist,
} from '../oled/playlist';
import {
  Tv,
  X,
  Sparkles,
  Sliders,
  Sun,
  Eye,
  RotateCcw,
  Check,
  Zap,
  Layers,
  Contrast
} from 'lucide-react';

interface DisplayConfigDrawerProps {
  oledState: OLEDState;
  onUpdateOLEDState: (state: OLEDState) => void;
  onClose: () => void;
  deckName: string;
  activeLayerName: string;
  /** 0-based index of the active layer, so previews draw the real track. */
  activeLayerIndex?: number;
  layerCount?: number;
  onTriggerAction?: (actionId: string, actionName: string, category: string) => void;
}

/* ── live read-outs ────────────────────────────────────────────────────────────
   The telemetry tab shows what the machine reports. It has no controls: a slider
   that invents a CPU load is how the panel started lying in the first place. */

/** One measured value: label, bar, number. `null` prints as -- with no bar. */
const LiveMeter: React.FC<{ label: string; value: number | null; suffix: string; max?: number; tone?: 'ink' | 'blue' }> = ({
  label, value, suffix, max = 100, tone = 'blue',
}) => {
  const known = value !== null && value !== undefined && Number.isFinite(value);
  const pct = known ? Math.max(0, Math.min(100, (Number(value) / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-mono">
        <span className="text-[#444343]">{label}</span>
        <span className={`font-bold ${tone === 'ink' ? 'text-[#444343]' : 'text-[#1351AA]'}`}>
          {known ? `${Math.round(Number(value))}${suffix}` : '--'}
        </span>
      </div>
      <div className="h-2 bg-[#EDECE8] border border-[#C7C7C7]">
        {known && (
          <div
            className={`h-full ${tone === 'ink' ? 'bg-[#444343]' : 'bg-[#1351AA]'}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
};

/** Name the subsystem that answered, or say plainly that none did. */
function sourceLine(state: OLEDState): string {
  const s = state.metricsSource;
  const parts: string[] = [];
  if (s?.cpu) parts.push(`CPU ${s.cpu}`);
  if (s?.gpu) parts.push(`GPU ${s.gpu}`);
  if (s?.temp) parts.push(`temp ${s.temp}`);
  if (!parts.length) {
    return 'No native telemetry. The desktop app reads CPU/RAM from os.cpus() deltas, GPU and temperature from Windows counters — a browser cannot, so the panel shows --.';
  }
  return `Measured: ${parts.join(' · ')}`;
}

/** m:ss, or a placeholder when the timeline is unknown. */
function clock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--:--';
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const DisplayConfigDrawer: React.FC<DisplayConfigDrawerProps> = ({
  oledState,
  onUpdateOLEDState,
  onClose,
  deckName,
  activeLayerName,
  activeLayerIndex = 0,
  layerCount = 4,
  onTriggerAction,
}) => {
  const [localState, setLocalState] = useState<OLEDState>({
    ...oledState,
    // The panel walks a playlist on a timer; both live in OLEDState so the
    // device, the preview and the cards all read the same two values.
    playlist: normalizePlaylist(oledState.playlist ?? DEFAULT_PLAYLIST),
    autoCycleS: clampAutoCycleS(oledState.autoCycleS ?? AUTO_CYCLE_DEFAULT_S),
  });
  const [activeTab, setActiveTab] = useState<'modes' | 'appearance' | 'telemetry'>('modes');
  const [hasSaved, setHasSaved] = useState(false);

  /* A mirror of `localState` that is always current.
   *
   * React batches state updates inside one event task, so two clicks handled
   * before the next render would both read the same stale `localState` and the
   * second write would silently undo the first — exactly what happens when
   * someone runs down the rotation toggles quickly. Every edit goes through
   * `commit`, which reads the mirror, writes state and pushes to the deck. */
  const latest = useRef(localState);
  latest.current = localState;

  const commit = useCallback(
    (updated: OLEDState) => {
      latest.current = updated;
      setLocalState(updated);
      onUpdateOLEDState(updated);
    },
    [onUpdateOLEDState],
  );

  const handleSelectMode = (mode: OLEDMode) => {
    commit({ ...latest.current, mode });
    onTriggerAction?.('oled-mode-change', `OLED Mode: ${mode.toUpperCase()}`, 'display');
  };

  const playlist = normalizePlaylist(localState.playlist ?? DEFAULT_PLAYLIST);
  const capacity = capacityFor(playlist);
  const autoCycleS = clampAutoCycleS(localState.autoCycleS ?? AUTO_CYCLE_DEFAULT_S);

  /** Add/remove a screen from the rotation, refusing anything that overflows the
   *  flash region. The last screen cannot be removed: an empty rotation would
   *  freeze the panel. */
  const toggleRotation = (id: OLEDMode) => {
    const base = latest.current;
    const current = normalizePlaylist(base.playlist ?? DEFAULT_PLAYLIST);
    let next: OLEDMode[];
    if (current.includes(id)) {
      if (current.length === 1) {
        onTriggerAction?.('oled-rotation', 'Rotation needs at least one screen', 'display');
        return;
      }
      next = current.filter((m) => m !== id);
    } else {
      next = normalizePlaylist([...current, id]);
      const headroom = capacityFor(next);
      if (!headroom.fits) {
        onTriggerAction?.(
          'oled-rotation',
          `${id.toUpperCase()} does not fit: ${formatCapacity(headroom)}`,
          'display',
        );
        return;
      }
    }
    commit({ ...base, playlist: next });
  };

  const setAutoCycle = (seconds: number) => {
    commit({ ...latest.current, autoCycleS: clampAutoCycleS(seconds) });
  };

  const handleSave = () => {
    onUpdateOLEDState(latest.current);
    setHasSaved(true);
    setTimeout(() => setHasSaved(false), 2000);
    onTriggerAction?.('oled-save', 'OLED Display Settings Saved', 'system');
  };

  const handleResetDefaults = () => {
    const defaults: OLEDState = {
      ...localState,
      customTitle: 'KADOWAZ IND.',
      customSubtitle: 'ONLINE',
      brightness: 100,
      inverted: false,
      autoCycleS: AUTO_CYCLE_DEFAULT_S,
      playlist: [...DEFAULT_PLAYLIST],
    };
    commit(defaults);
  };

  return (
    <div className="h-full flex flex-col bg-[#FFFFFF] text-[#141414] select-none">
      {/* Header */}
      <div className="p-6 border-b border-[#E3E2DE] flex items-center justify-between bg-[#FFFFFF] ">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1351AA] text-[#E3E2DE] border border-[#1351AA] flex items-center justify-center font-bold">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-black tracking-wider text-[#141414]">
                OLED DISPLAY CONFIG
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-[#1351AA] text-[#E3E2DE] border border-[#1351AA] font-semibold">
                SSD1306 128×32
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#646464]">
              0.96″ I2C Monochrome OLED Screen Customizer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset display defaults"
            className="p-2 text-[#646464] hover:text-[#141414] hover:bg-[#EDECE8] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#646464] hover:text-[#141414] hover:bg-[#EDECE8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E3E2DE] px-6 pt-3 bg-[#FFFFFF]">
        <button
          onClick={() => setActiveTab('modes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold transition-all border-b-2 ${
 activeTab === 'modes'
 ? 'text-[#E3E2DE] border-[#444343] bg-[#1351AA]'
 : 'text-[#646464] border-transparent hover:text-[#141414] hover:bg-[#F4F3F0]'
 }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>DISPLAY MODES</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold transition-all border-b-2 ${
 activeTab === 'appearance'
 ? 'text-[#E3E2DE] border-[#444343] bg-[#1351AA]'
 : 'text-[#646464] border-transparent hover:text-[#141414] hover:bg-[#F4F3F0]'
 }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>APPEARANCE & TEXT</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold transition-all border-b-2 ${
 activeTab === 'telemetry'
 ? 'text-[#E3E2DE] border-[#444343] bg-[#1351AA]'
 : 'text-[#646464] border-transparent hover:text-[#141414] hover:bg-[#F4F3F0]'
 }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>TELEMETRY</span>
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Real-time Display Showcase Box */}
        <div className="panel p-5 border border-[#C7C7C7]  space-y-3 ">
          <div className="flex items-center justify-between text-xs font-mono text-[#444343]">
            <span className="flex items-center gap-2 font-bold text-[#444343]">
              <Eye className="w-3.5 h-3.5 text-[#1351AA]" /> LIVE OLED HARDWARE SIMULATOR
            </span>
            <span className="text-[10px] bg-[#EDECE8] text-[#1351AA] px-2 py-0.5 border border-[#C7C7C7] font-semibold">
              ACTIVE: {localState.mode.toUpperCase()}
            </span>
          </div>

          <div className="p-3 bg-[#FFFFFF] border border-[#E3E2DE] flex items-center justify-center">
            <div className="w-[280px]">
              <OLEDDisplay
                state={localState}
                activeLayerName={activeLayerName}
                deckName={deckName}
                channelIndex={activeLayerIndex}
                layerCount={layerCount}
              />
            </div>
          </div>

          <div className="text-[10.5px] font-mono text-[#646464] leading-relaxed">
            The panel is not a touchscreen: it advances every{' '}
            <span className="font-bold text-[#444343]">
              {autoCycleS > 0 ? `${autoCycleS} S` : 'NEVER'}
            </span>{' '}
            through {playlist.length} of {OLED_MODES.length} screens. A key or the knob can be
            bound to OLED NEXT for a manual step.
          </div>
        </div>

        {/* TAB 1: MODES — title top-left, live panel preview below, nothing else */}
        {activeTab === 'modes' && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-mono font-bold text-[#444343] block">
                SELECT ACTIVE OLED SCREEN MODE
              </label>
              <span className="text-[10px] font-mono text-[#646464]">
                {OLED_MODES.length} MODES · 128×32 MONO
              </span>
            </div>

            {/* Rotation: the only controls that matter on a panel with no touch. */}
            <div className="panel p-4 border border-[#E3E2DE] space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-mono font-bold text-[#444343]">AUTO SWITCH</div>
                  <div className="text-[10px] font-mono text-[#646464] mt-0.5">
                    Seconds per screen · 0 = stay put · {MIN_AUTO_CYCLE_S}–{MAX_AUTO_CYCLE_S} s
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 10, 20, 30, 60].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAutoCycle(preset)}
                      className={`px-2 py-1 text-[10px] font-mono font-bold border transition-colors ${
                        autoCycleS === preset
                          ? 'bg-[#1351AA] border-[#1351AA] text-[#E3E2DE]'
                          : 'bg-[#FFFFFF] border-[#C7C7C7] text-[#444343] hover:bg-[#EDECE8]'
                      }`}
                    >
                      {preset === 0 ? 'OFF' : `${preset}S`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoCycle(autoCycleS - 5)}
                  className="w-7 h-7 border border-[#C7C7C7] text-[#141414] font-mono font-bold hover:bg-[#EDECE8] transition-colors"
                  title="5 seconds shorter"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={MAX_AUTO_CYCLE_S}
                  value={autoCycleS}
                  onChange={(e) => setAutoCycle(Number(e.target.value))}
                  className="w-20 bg-[#FFFFFF] border border-[#C7C7C7] px-2 py-1 text-xs text-[#141414] font-mono focus:outline-none focus:border-[#444343]"
                />
                <button
                  type="button"
                  onClick={() => setAutoCycle(autoCycleS + 5)}
                  className="w-7 h-7 border border-[#C7C7C7] text-[#141414] font-mono font-bold hover:bg-[#EDECE8] transition-colors"
                  title="5 seconds longer"
                >
                  +
                </button>
                <span className="text-[10px] font-mono text-[#646464]">
                  {autoCycleS === 0
                    ? 'Rotation off — the panel stays on the active screen'
                    : `A full lap of ${playlist.length} screens takes ${
                        Math.round(autoCycleS * playlist.length)
                      } s`}
                </span>
              </div>
            </div>

            {/* Frame-store budget. The limit is a flash region, derived in
                src/oled/capacity.ts, not a round number picked by hand. */}
            <div className="panel p-4 border border-[#E3E2DE] space-y-2">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-mono font-bold text-[#444343]">FRAME STORE</span>
                <span className="text-[10px] font-mono text-[#646464]">
                  {formatCapacity(capacity)}
                </span>
              </div>
              <div className="h-2 bg-[#EDECE8] border border-[#E3E2DE]">
                <div
                  className="h-full bg-[#1351AA]"
                  style={{ width: `${Math.min(100, capacity.fraction * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[10px] font-mono text-[#646464]">
                <span>
                  {capacity.usedFrames} × 512 B FRAMES · {capacity.freeModes} RUNTIME SCREENS AT 0 B
                </span>
                <span>
                  {((capacity.usedBytes / capacity.limitBytes) * 100).toFixed(0)}% OF{' '}
                  {(capacity.limitBytes / 1024).toFixed(0)} KiB FLASH REGION
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {OLED_MODES.map((spec) => {
                const isSelected = localState.mode === spec.id;
                const inRotation = playlist.includes(spec.id);
                const tag = isSelected
                  ? 'ACTIVE'
                  : inRotation
                    ? spec.frames > 1
                      ? `${spec.fps} FPS`
                      : 'STATIC'
                    : 'SKIPPED';
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => handleSelectMode(spec.id)}
                    title={`${spec.label} — ${spec.frames > 1 ? `${spec.frames} frame loop at ${spec.fps} fps` : 'static screen'}`}
                    className={`text-left transition-colors cursor-pointer border ${
                      isSelected
                        ? 'border-[#141414] bg-[#F4F3F0]'
                        : 'border-[#E3E2DE] bg-[#FFFFFF] hover:border-[#444343]'
                    }`}
                  >
                    {/* title, top-left; technical tag, top-right */}
                    <div className="flex items-center justify-between gap-2 px-2.5 pt-2 pb-1.5">
                      <span className="text-[11px] font-mono font-black tracking-tight text-[#141414] truncate">
                        {spec.label.toUpperCase()}
                      </span>
                      <span
                        className={`text-[9px] font-mono shrink-0 px-1 ${
                          isSelected
                            ? 'bg-[#1351AA] text-[#E3E2DE] font-bold'
                            : 'text-[#646464]'
                        }`}
                      >
                        {tag}
                      </span>
                    </div>

                    {/* the screen itself — the same 128×32 renderer the deck uses */}
                    <div className="px-2.5 pb-2.5">
                      <div
                        className={`oled-screen w-full max-w-[360px] ${isSelected ? 'oled-screen--active' : ''}`}
                        style={{ aspectRatio: '4 / 1' }}
                      >
                        <OLEDCanvas
                          mode={spec.id}
                          state={localState}
                          deckName={deckName}
                          layerName={activeLayerName}
                          layerIndex={activeLayerIndex}
                          layerCount={layerCount}
                          paused={activeTab !== 'modes'}
                          title={`${spec.label} preview`}
                        />
                      </div>
                    </div>

                    {/* what it costs, and whether it is in the rotation */}
                    <div className="flex items-center justify-between gap-2 px-2.5 pb-2 border-t border-[#E3E2DE] pt-1.5">
                      <span className="text-[9px] font-mono text-[#646464]">
                        {formatFootprint(spec.id)}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRotation(spec.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleRotation(spec.id);
                          }
                        }}
                        className={`text-[9px] font-mono font-bold px-1 border ${
                          inRotation
                            ? 'border-[#C7C7C7] text-[#444343] hover:bg-[#EDECE8]'
                            : 'border-[#E3E2DE] text-[#646464] hover:bg-[#F4F3F0]'
                        }`}
                      >
                        {inRotation ? 'IN ROTATION' : 'SKIPPED'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: APPEARANCE & TEXT */}
        {activeTab === 'appearance' && (
          <div className="space-y-4">
            {/* Custom Titles for Deck Status Mode */}
            <div className="panel p-4 border border-[#E3E2DE] space-y-3">
              <label className="text-xs font-mono font-bold text-[#444343] block">
                CUSTOM SCREEN LABELS (FOR DECK STATUS MODE)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-mono text-[#646464] block mb-1">
                    PRIMARY BANNER TITLE
                  </span>
                  <input
                    type="text"
                    value={localState.customTitle ?? 'KADOWAZ IND.'}
                    onChange={(e) => commit({ ...latest.current, customTitle: e.target.value })}
                    placeholder="e.g. KADOWAZ IND., STUDIO PRO"
                    className="w-full bg-[#FFFFFF] border border-[#C7C7C7] px-3 py-2 text-xs text-[#141414] font-mono focus:outline-none focus:border-[#444343]"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#646464] block mb-1">
                    STATUS SUBTITLE / BADGE
                  </span>
                  <input
                    type="text"
                    value={localState.customSubtitle ?? 'ONLINE'}
                    onChange={(e) => commit({ ...latest.current, customSubtitle: e.target.value })}
                    placeholder="e.g. ONLINE, ON AIR, REC"
                    className="w-full bg-[#FFFFFF] border border-[#C7C7C7] px-3 py-2 text-xs text-[#141414] font-mono focus:outline-none focus:border-[#444343]"
                  />
                </div>
              </div>
            </div>

            {/* Brightness & Inversion */}
            <div className="panel p-4 border border-[#E3E2DE] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-[#444343]">OLED BRIGHTNESS</div>
                  <div className="text-[10px] font-mono text-[#646464]">
                    Contrast register control for SSD1306 controller
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-[#444343]">
                  {localState.brightness ?? 100}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={localState.brightness ?? 100}
                onChange={(e) => commit({ ...latest.current, brightness: Number(e.target.value) })}
                className="w-full accent-[#444343] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#646464]">
                <span>Dim (25%)</span>
                <span>Normal (70%)</span>
                <span>Maximum (100%)</span>
              </div>
            </div>

            {/* Invert Screen & Sleep Timeout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="panel p-4 border border-[#E3E2DE] flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-[#444343] flex items-center gap-1.5">
                    <Contrast className="w-3.5 h-3.5 text-[#444343]" /> INVERT COLORS
                  </div>
                  <div className="text-[10px] font-mono text-[#646464]">
                    Monochrome pixel inversion
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    commit({ ...latest.current, inverted: !latest.current.inverted });
                  }}
                  className={`w-12 h-6 transition-colors relative cursor-pointer ${
 localState.inverted ? 'bg-[#1351AA]' : 'bg-[#E3E2DE]'
 }`}
                >
                  <div
                    className={`w-5 h-5 bg-[#FFFFFF] absolute top-0.5 transition-transform ${
 localState.inverted ? 'left-6.5' : 'left-0.5'
 }`}
                  />
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: LIVE TELEMETRY & MEDIA (read-only: these are measurements) */}
        {activeTab === 'telemetry' && (
          <div className="space-y-4">
            <div className="panel p-4 border border-[#E3E2DE] space-y-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-mono font-bold text-[#444343]">
                  HARDWARE TELEMETRY (LIVE)
                </div>
                <span className="text-[10px] font-mono text-[#646464]">
                  SYSTEM MODE SOURCE
                </span>
              </div>

              <div className="space-y-3">
                <LiveMeter label="CPU LOAD" value={oledState.cpuLoad} suffix="%" />
                <LiveMeter label="RAM USAGE" value={oledState.ramUsage} suffix="%" />
                <LiveMeter label="GPU LOAD" value={oledState.gpuLoad} suffix="%" />
                <LiveMeter label="CPU TEMP" value={oledState.cpuTemp} suffix="°C" max={100} tone="ink" />
              </div>

              <div className="text-[10px] font-mono text-[#646464] leading-relaxed border-t border-[#E3E2DE] pt-2">
                {sourceLine(oledState)}
              </div>
            </div>

            <div className="panel p-4 border border-[#E3E2DE] space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-mono font-bold text-[#444343]">
                  MEDIA SESSION (LIVE)
                </div>
                <span className="text-[10px] font-mono text-[#646464]">
                  NOW PLAYING MODE SOURCE
                </span>
              </div>

              {oledState.nowPlayingTrack ? (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-bold text-[#141414] truncate">
                      {oledState.nowPlayingTrack}
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[#C7C7C7] text-[#444343] flex-none">
                      {oledState.isPlaying ? 'PLAYING' : 'PAUSED'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#646464] truncate">
                    {oledState.nowPlayingArtist || 'Unknown artist'}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#444343]">
                    <span>{clock(oledState.trackPositionS)}</span>
                    <span>{clock(oledState.trackDurationS)}</span>
                  </div>
                  <div className="h-2 bg-[#EDECE8] border border-[#C7C7C7]">
                    <div
                      className="h-full bg-[#1351AA]"
                      style={{ width: `${Math.max(0, Math.min(100, oledState.trackProgress ?? 0))}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-[#646464]">
                    {oledState.nowPlayingApp ? `Session: ${oledState.nowPlayingApp}` : 'Session: unknown app'}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-[#646464] leading-relaxed">
                  NO MEDIA — Windows reports no active media session. Press play in any
                  player and this reads it: title, artist, transport state and position
                  come from the OS media session (SMTC), not from this app.
                </div>
              )}
            </div>

            <p className="text-[10px] font-mono text-[#646464] leading-relaxed px-1">
              These values are measured, never simulated. A reading the machine does not
              expose shows as <span className="text-[#444343] font-bold">--</span> on the panel
              and here — the app will not fill the gap with a plausible number.
            </p>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-6 border-t border-[#E3E2DE] bg-[#FFFFFF] flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleSelectMode(nextInPlaylist(localState.mode, playlist))}
          className="flex items-center gap-2 px-4 py-2.5 border border-[#C7C7C7] text-xs font-mono font-bold text-[#141414] hover:bg-[#EDECE8] transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-[#1351AA]" />
          <span>CYCLE NEXT MODE</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-[#E3E2DE] text-xs font-mono font-bold text-[#444343] hover:text-[#141414] hover:bg-[#F4F3F0] transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5  text-[#141414] text-xs font-mono font-black tracking-wider hover:brightness-110 active:scale-95 transition-all"
          >
            {hasSaved ? (
              <>
                <Check className="w-4 h-4 text-[#141414]" />
                <span>SAVED!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-[#141414]" />
                <span>SAVE DISPLAY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
