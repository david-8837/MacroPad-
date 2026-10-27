import React, { useState } from 'react';
import { OLEDMode, OLEDState } from '../types';
import { OLEDDisplay } from './OLEDDisplay';
import {
  Tv,
  X,
  Sparkles,
  Cpu,
  Activity,
  Music,
  Sliders,
  Sun,
  Eye,
  RotateCcw,
  Check,
  Zap,
  Play,
  Layers,
  Clock,
  Contrast
} from 'lucide-react';

interface DisplayConfigDrawerProps {
  oledState: OLEDState;
  onUpdateOLEDState: (state: OLEDState) => void;
  onClose: () => void;
  activeProfileName: string;
  activeLayerName: string;
  onTriggerAction?: (actionId: string, actionName: string, category: string) => void;
}

export const DisplayConfigDrawer: React.FC<DisplayConfigDrawerProps> = ({
  oledState,
  onUpdateOLEDState,
  onClose,
  activeProfileName,
  activeLayerName,
  onTriggerAction,
}) => {
  const [localState, setLocalState] = useState<OLEDState>({ ...oledState });
  const [activeTab, setActiveTab] = useState<'modes' | 'appearance' | 'telemetry'>('modes');
  const [hasSaved, setHasSaved] = useState(false);

  const displayModes: {
    mode: OLEDMode;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    color: string;
    description: string;
  }[] = [
    {
      mode: 'kadowaz',
      label: 'Deck Status',
      sublabel: 'Branding & Active Layer',
      icon: <Sparkles className="w-4 h-4" />,
      color: '#00F0FF',
      description: 'Classic deck display with customizable banner title, active profile, and online layer indicator.',
    },
    {
      mode: 'system',
      label: 'System Telemetry',
      sublabel: 'CPU, RAM, GPU, Temp',
      icon: <Cpu className="w-4 h-4" />,
      color: '#38EF7D',
      description: 'Real-time PC hardware performance monitoring with dynamic load percentages and core temperatures.',
    },
    {
      mode: 'visualizer',
      label: 'Audio Equalizer',
      sublabel: 'Stereo VU Spectrum',
      icon: <Activity className="w-4 h-4" />,
      color: '#FF5E00',
      description: 'Stereo audio spectrum analyzer with reactive 12-band frequency bars and peak dB indicators.',
    },
    {
      mode: 'media',
      label: 'Now Playing',
      sublabel: 'Media Title & Progress',
      icon: <Music className="w-4 h-4" />,
      color: '#BD00FF',
      description: 'Live media track title, artist name, and synchronized scrub playback bar from Spotify/Apple Music.',
    },
    {
      mode: 'channel',
      label: 'Channel Indicator',
      sublabel: 'Dashed Stepper & Badge [01/02/03]',
      icon: <Layers className="w-4 h-4" />,
      color: '#A855F7',
      description: 'Minimalist industrial channel stepper track with high-contrast inverted active channel badge [01], [02], [03].',
    },
  ];

  const handleSelectMode = (mode: OLEDMode) => {
    const updated = { ...localState, mode };
    setLocalState(updated);
    onUpdateOLEDState(updated);
    onTriggerAction?.('oled-mode-change', `OLED Mode: ${mode.toUpperCase()}`, 'display');
  };

  const handleSave = () => {
    onUpdateOLEDState(localState);
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
      screensaverMinutes: 5,
    };
    setLocalState(defaults);
    onUpdateOLEDState(defaults);
  };

  return (
    <div className="h-full flex flex-col bg-[#0B0D13] text-white select-none">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#12151C]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#BD00FF]/10 text-[#BD00FF] border border-[#BD00FF]/30 flex items-center justify-center font-bold">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-black tracking-wider text-white">
                OLED DISPLAY CONFIG
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#BD00FF]/20 text-[#BD00FF] border border-[#BD00FF]/40 font-semibold">
                SSD1306 128x64
              </span>
            </div>
            <p className="text-[11px] font-mono text-white/50">
              0.96″ I2C Monochrome OLED Screen Customizer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            title="Reset display defaults"
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 px-6 pt-3 bg-[#0E1118]">
        <button
          onClick={() => setActiveTab('modes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-mono font-bold transition-all border-b-2 ${
            activeTab === 'modes'
              ? 'text-[#BD00FF] border-[#BD00FF] bg-[#BD00FF]/10'
              : 'text-white/50 border-transparent hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>DISPLAY MODES</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-mono font-bold transition-all border-b-2 ${
            activeTab === 'appearance'
              ? 'text-[#BD00FF] border-[#BD00FF] bg-[#BD00FF]/10'
              : 'text-white/50 border-transparent hover:text-white hover:bg-white/5'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>APPEARANCE & TEXT</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-mono font-bold transition-all border-b-2 ${
            activeTab === 'telemetry'
              ? 'text-[#BD00FF] border-[#BD00FF] bg-[#BD00FF]/10'
              : 'text-white/50 border-transparent hover:text-white hover:bg-white/5'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>LIVE SIMULATOR</span>
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Real-time Display Showcase Box */}
        <div className="glass-panel p-5 rounded-2xl border border-white/15 bg-gradient-to-b from-[#141824] to-[#0D1017] space-y-3 shadow-xl">
          <div className="flex items-center justify-between text-xs font-mono text-white/60">
            <span className="flex items-center gap-2 font-bold text-white/80">
              <Eye className="w-3.5 h-3.5 text-[#00F0FF]" /> LIVE OLED HARDWARE SIMULATOR
            </span>
            <span className="text-[10px] bg-[#00F0FF]/10 text-[#00F0FF] px-2 py-0.5 rounded border border-[#00F0FF]/30 font-semibold">
              ACTIVE: {localState.mode.toUpperCase()}
            </span>
          </div>

          <div className="p-3 bg-[#05070A] rounded-xl border border-white/10 shadow-inner flex items-center justify-center">
            <div className="w-[280px]">
              <OLEDDisplay
                state={localState}
                activeLayerName={activeLayerName}
                activeProfileName={activeProfileName}
                onCycleMode={() => {
                  const modes: OLEDMode[] = ['kadowaz', 'system', 'visualizer', 'media'];
                  const nextIdx = (modes.indexOf(localState.mode) + 1) % modes.length;
                  handleSelectMode(modes[nextIdx]);
                }}
              />
            </div>
          </div>

          <div className="text-center text-[10.5px] font-mono text-white/40">
            Click OLED screen above or select a mode card below to switch live firmware mode
          </div>
        </div>

        {/* TAB 1: MODES */}
        {activeTab === 'modes' && (
          <div className="space-y-3">
            <label className="text-xs font-mono font-bold text-white/70 block">
              SELECT ACTIVE OLED SCREEN MODE
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayModes.map((dm) => {
                const isSelected = localState.mode === dm.mode;
                return (
                  <button
                    key={dm.mode}
                    type="button"
                    onClick={() => handleSelectMode(dm.mode)}
                    className={`p-4 rounded-2xl border text-left font-mono transition-all relative overflow-hidden group cursor-pointer ${
                      isSelected
                        ? 'bg-[#151A26] border-[#BD00FF] shadow-[0_0_20px_rgba(189,0,255,0.25)]'
                        : 'bg-[#10131B] border-white/10 hover:border-white/30 hover:bg-[#141824]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-bold transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: `${dm.color}15`,
                          color: dm.color,
                          border: `1px solid ${dm.color}35`,
                        }}
                      >
                        {dm.icon}
                      </div>
                      {isSelected && (
                        <span className="flex items-center gap-1 text-[10px] text-[#BD00FF] font-bold bg-[#BD00FF]/15 px-2 py-0.5 rounded-full border border-[#BD00FF]/30">
                          <Check className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-black text-white">{dm.label}</div>
                    <div className="text-[10px] text-white/40 font-mono mb-2">{dm.sublabel}</div>
                    <p className="text-[11px] text-white/60 leading-relaxed font-sans">
                      {dm.description}
                    </p>
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
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-3">
              <label className="text-xs font-mono font-bold text-white/70 block">
                CUSTOM SCREEN LABELS (FOR DECK STATUS MODE)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-mono text-white/50 block mb-1">
                    PRIMARY BANNER TITLE
                  </span>
                  <input
                    type="text"
                    value={localState.customTitle ?? 'KADOWAZ IND.'}
                    onChange={(e) => {
                      const updated = { ...localState, customTitle: e.target.value };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    placeholder="e.g. KADOWAZ IND., STUDIO PRO"
                    className="w-full bg-[#0C0E14] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#BD00FF]"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-white/50 block mb-1">
                    STATUS SUBTITLE / BADGE
                  </span>
                  <input
                    type="text"
                    value={localState.customSubtitle ?? 'ONLINE'}
                    onChange={(e) => {
                      const updated = { ...localState, customSubtitle: e.target.value };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    placeholder="e.g. ONLINE, ON AIR, REC"
                    className="w-full bg-[#0C0E14] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#BD00FF]"
                  />
                </div>
              </div>
            </div>

            {/* Brightness & Inversion */}
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-white/80">OLED BRIGHTNESS</div>
                  <div className="text-[10px] font-mono text-white/40">
                    Contrast register control for SSD1306 controller
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-[#BD00FF]">
                  {localState.brightness ?? 100}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={localState.brightness ?? 100}
                onChange={(e) => {
                  const updated = { ...localState, brightness: Number(e.target.value) };
                  setLocalState(updated);
                  onUpdateOLEDState(updated);
                }}
                className="w-full accent-[#BD00FF] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-white/40">
                <span>Dim (25%)</span>
                <span>Normal (70%)</span>
                <span>Maximum (100%)</span>
              </div>
            </div>

            {/* Invert Screen & Sleep Timeout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-white/80 flex items-center gap-1.5">
                    <Contrast className="w-3.5 h-3.5 text-[#BD00FF]" /> INVERT COLORS
                  </div>
                  <div className="text-[10px] font-mono text-white/40">
                    Monochrome pixel inversion
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { ...localState, inverted: !localState.inverted };
                    setLocalState(updated);
                    onUpdateOLEDState(updated);
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    localState.inverted ? 'bg-[#BD00FF]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                      localState.inverted ? 'left-6.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-white/80 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#00F0FF]" /> SCREEN SLEEP
                  </div>
                  <div className="text-[10px] font-mono text-white/40">
                    OLED burn-in protection timer
                  </div>
                </div>
                <select
                  value={localState.screensaverMinutes ?? 5}
                  onChange={(e) => {
                    const updated = { ...localState, screensaverMinutes: Number(e.target.value) };
                    setLocalState(updated);
                    onUpdateOLEDState(updated);
                  }}
                  className="bg-[#0C0E14] border border-white/20 rounded-xl px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-[#BD00FF]"
                >
                  <option value={1}>1 min</option>
                  <option value={5}>5 mins</option>
                  <option value={15}>15 mins</option>
                  <option value={0}>Never</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TELEMETRY & MEDIA SIMULATOR */}
        {activeTab === 'telemetry' && (
          <div className="space-y-4">
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
              <div className="text-xs font-mono font-bold text-white/70">
                HARDWARE TELEMETRY INJECTION (SYSTEM MODE)
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-white/60">CPU Load:</span>
                    <span className="text-[#38EF7D] font-bold">{localState.cpuLoad}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localState.cpuLoad}
                    onChange={(e) => {
                      const updated = { ...localState, cpuLoad: Number(e.target.value) };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full accent-[#38EF7D] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-white/60">RAM Usage:</span>
                    <span className="text-[#00F0FF] font-bold">{localState.ramUsage}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localState.ramUsage}
                    onChange={(e) => {
                      const updated = { ...localState, ramUsage: Number(e.target.value) };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full accent-[#00F0FF] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-white/60">GPU Load:</span>
                    <span className="text-[#FF5E00] font-bold">{localState.gpuLoad}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localState.gpuLoad}
                    onChange={(e) => {
                      const updated = { ...localState, gpuLoad: Number(e.target.value) };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full accent-[#FF5E00] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-white/60">CPU Temp:</span>
                    <span className="text-[#BD00FF] font-bold">{localState.cpuTemp}°C</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="95"
                    value={localState.cpuTemp}
                    onChange={(e) => {
                      const updated = { ...localState, cpuTemp: Number(e.target.value) };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full accent-[#BD00FF] cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Media Simulation */}
            <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-3">
              <div className="text-xs font-mono font-bold text-white/70">
                MEDIA INFORMATION (NOW PLAYING MODE)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-mono text-white/50 block mb-1">
                    TRACK NAME
                  </span>
                  <input
                    type="text"
                    value={localState.nowPlayingTrack}
                    onChange={(e) => {
                      const updated = { ...localState, nowPlayingTrack: e.target.value };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full bg-[#0C0E14] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#BD00FF]"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-mono text-white/50 block mb-1">
                    ARTIST NAME
                  </span>
                  <input
                    type="text"
                    value={localState.nowPlayingArtist}
                    onChange={(e) => {
                      const updated = { ...localState, nowPlayingArtist: e.target.value };
                      setLocalState(updated);
                      onUpdateOLEDState(updated);
                    }}
                    className="w-full bg-[#0C0E14] border border-white/20 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#BD00FF]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-white/60">Playback Progress:</span>
                  <span className="text-[#38EF7D] font-bold">
                    {Math.floor(localState.trackProgress)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localState.trackProgress}
                  onChange={(e) => {
                    const updated = { ...localState, trackProgress: Number(e.target.value) };
                    setLocalState(updated);
                    onUpdateOLEDState(updated);
                  }}
                  className="w-full accent-[#38EF7D] cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-6 border-t border-white/10 bg-[#12151C]/90 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const modes: OLEDMode[] = ['kadowaz', 'system', 'visualizer', 'media'];
            const nextIdx = (modes.indexOf(localState.mode) + 1) % modes.length;
            handleSelectMode(modes[nextIdx]);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/20 text-xs font-mono font-bold text-white hover:bg-white/10 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-[#00F0FF]" />
          <span>CYCLE NEXT MODE</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-mono font-bold text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#BD00FF] to-[#9D00FF] text-white text-xs font-mono font-black tracking-wider shadow-[0_0_20px_rgba(189,0,255,0.4)] hover:brightness-110 active:scale-95 transition-all"
          >
            {hasSaved ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>SAVED!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span>SAVE DISPLAY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
