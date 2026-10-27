import React, { useEffect, useState, useRef } from 'react';
import { OLEDMode, OLEDState } from '../types';
import { Activity, Music, Cpu, Sparkles, Layers } from 'lucide-react';

interface OLEDDisplayProps {
  state: OLEDState;
  activeLayerName: string;
  activeProfileName: string;
  onCycleMode: () => void;
  channelIndex?: number;
}

export const OLEDDisplay: React.FC<OLEDDisplayProps> = ({
  state,
  activeLayerName,
  activeProfileName,
  onCycleMode,
  channelIndex = 0,
}) => {
  const [eqBars, setEqBars] = useState<number[]>([40, 65, 85, 95, 70, 50, 75, 90, 60, 45, 80, 70]);
  const [showChannelOSD, setShowChannelOSD] = useState(false);
  const prevChannelRef = useRef<number>(channelIndex);

  // Trigger brief OLED Channel Stepper when channel changes
  useEffect(() => {
    if (prevChannelRef.current !== channelIndex) {
      setShowChannelOSD(true);
      const timer = setTimeout(() => {
        setShowChannelOSD(false);
      }, 2600);
      prevChannelRef.current = channelIndex;
      return () => clearTimeout(timer);
    }
  }, [channelIndex]);

  // Animated VU Equalizer bars
  useEffect(() => {
    if (state.mode === 'visualizer' || state.mode === 'media') {
      const interval = setInterval(() => {
        setEqBars(prev =>
          prev.map(() => Math.floor(20 + Math.random() * 80))
        );
      }, 100);
      return () => clearInterval(interval);
    }
  }, [state.mode]);

  const brightnessVal = state.brightness !== undefined ? state.brightness / 100 : 1;
  const isInverted = Boolean(state.inverted);

  const chNum = (channelIndex ?? 0) + 1;
  const chStr = String(chNum).padStart(2, '0'); // "01", "02", "03"

  // Sleek minimalist channel stepper track matching hardware OLED photo
  const renderChannelScreen = () => (
    <div className="relative z-0 h-full w-full flex flex-col justify-center items-center text-white font-mono animate-in fade-in zoom-in-95 duration-150">
      <div className="w-full flex items-center justify-center gap-2 px-1">
        {/* Left Track Segments */}
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          {chNum === 1 && (
            <div className="w-3.5 h-[3px] bg-white/20 rounded-full" />
          )}
          {chNum === 2 && (
            <div className="w-7 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
          )}
          {chNum === 3 && (
            <>
              <div className="w-5 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
              <div className="w-5 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            </>
          )}
        </div>

        {/* Active Channel Inverted Badge [01] / [02] / [03] */}
        <div className="shrink-0 px-2.5 py-0.5 bg-white text-black font-black text-[11px] font-mono rounded-[5px] tracking-tight shadow-[0_0_14px_rgba(255,255,255,0.9)] flex items-center justify-center select-none scale-105 border border-white">
          {chStr}
        </div>

        {/* Right Track Segments */}
        <div className="flex items-center gap-1.5 flex-1 justify-start">
          {chNum === 1 && (
            <>
              <div className="w-5 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
              <div className="w-5 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            </>
          )}
          {chNum === 2 && (
            <>
              <div className="w-6 h-[3.5px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
              <div className="w-4 h-[3.5px] bg-white/35 rounded-full" />
            </>
          )}
          {chNum === 3 && (
            <div className="w-3.5 h-[3px] bg-white/20 rounded-full" />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      onClick={onCycleMode}
      title="Click to cycle OLED screen mode (Channel Indicator, System Monitor, VU Equalizer, Now Playing, Deck Status)"
      style={{
        filter: `brightness(${brightnessVal}) ${isInverted ? 'invert(1)' : ''}`.trim(),
      }}
      className="oled-screen w-full h-[56px] rounded-md px-2.5 py-1.5 flex flex-col justify-between border border-[#1b2533] cursor-pointer group hover:border-[#00F0FF]/60 transition-all select-none"
    >
      <div className="oled-scanlines absolute inset-0 z-10" />

      {/* Render Channel Stepper Overlay if recently switched OR if mode === 'channel' */}
      {(showChannelOSD || state.mode === 'channel') ? (
        renderChannelScreen()
      ) : (
        <>

      {/* Mode 1: KADOWAZ BRANDED DECK STATUS */}
      {state.mode === 'kadowaz' && (
        <div className="relative z-0 h-full flex flex-col justify-between text-[#00F0FF]">
          <div className="flex items-center justify-between text-[9px] font-mono tracking-wider">
            <div className="flex items-center space-x-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
              <span>{state.customTitle || 'KADOWAZ IND.'}</span>
            </div>
            <span className="text-[8px] text-[#00F0FF]/80 bg-[#00F0FF]/10 px-1 py-0.2 rounded font-semibold truncate max-w-[80px]">
              {activeProfileName.toUpperCase()}
            </span>
          </div>

          <div className="flex items-end justify-between text-[10px] font-mono pt-1">
            <div className="truncate max-w-[110px] font-bold text-white">
              {activeLayerName.toUpperCase()}
            </div>
            <div className="text-[8px] text-[#00F0FF]/80 shrink-0">
              {state.customSubtitle || 'ONLINE'}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: LIVE SYSTEM TELEMETRY */}
      {state.mode === 'system' && (
        <div className="relative z-0 h-full flex flex-col justify-between text-[#00F0FF]">
          <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider text-[#00F0FF]/80">
            <span className="flex items-center gap-1 font-bold">
              <Cpu className="w-2.5 h-2.5" /> SYSTEM METRICS
            </span>
            <span>{state.cpuTemp}°C</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center font-mono pt-0.5">
            <div className="bg-[#00F0FF]/5 rounded px-1 py-0.5 border border-[#00F0FF]/20">
              <div className="text-[7px] text-[#00F0FF]/70">CPU</div>
              <div className="text-[9px] font-bold text-white">{state.cpuLoad}%</div>
            </div>
            <div className="bg-[#00F0FF]/5 rounded px-1 py-0.5 border border-[#00F0FF]/20">
              <div className="text-[7px] text-[#00F0FF]/70">RAM</div>
              <div className="text-[9px] font-bold text-white">{state.ramUsage}%</div>
            </div>
            <div className="bg-[#00F0FF]/5 rounded px-1 py-0.5 border border-[#00F0FF]/20">
              <div className="text-[7px] text-[#00F0FF]/70">GPU</div>
              <div className="text-[9px] font-bold text-white">{state.gpuLoad}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: STEREO AUDIO VU METER */}
      {state.mode === 'visualizer' && (
        <div className="relative z-0 h-full flex flex-col justify-between text-[#00F0FF]">
          <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider text-[#00F0FF]/80">
            <span className="flex items-center gap-1 font-bold">
              <Activity className="w-2.5 h-2.5" /> STEREO AUDIO VU
            </span>
            <span className="text-white text-[8px]">-12 dB</span>
          </div>

          <div className="flex items-end justify-between gap-[3px] h-5 px-1 pb-0.5">
            {eqBars.map((bar, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-[1px] transition-all duration-75"
                style={{
                  height: `${bar}%`,
                  opacity: bar > 75 ? 1 : 0.6 + bar / 200,
                  backgroundColor: bar > 85 ? '#FF5E00' : '#00F0FF'
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mode 4: NOW PLAYING MEDIA */}
      {state.mode === 'media' && (
        <div className="relative z-0 h-full flex flex-col justify-between text-[#00F0FF]">
          <div className="flex items-center justify-between text-[8px] font-mono text-[#00F0FF]/80">
            <span className="flex items-center gap-1 text-[#38EF7D] font-bold">
              <Music className="w-2.5 h-2.5" /> MEDIA PLAYING
            </span>
            <span>{Math.floor(state.trackProgress)}%</span>
          </div>

          <div className="font-mono text-[9px] truncate text-white font-medium">
            {state.nowPlayingTrack} - <span className="text-[#00F0FF]/80">{state.nowPlayingArtist}</span>
          </div>

          {/* Mini Playbar */}
          <div className="w-full bg-[#00F0FF]/20 h-1 rounded-full overflow-hidden">
            <div
              className="bg-[#38EF7D] h-full transition-all duration-300"
              style={{ width: `${state.trackProgress}%` }}
            />
          </div>
        </div>
      )}

        </>
      )}

      {/* Subtle bottom hint for mode cycling on hover */}
      <div className="absolute right-1 bottom-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[7px] font-mono text-[#00F0FF]/50">
        [CLICK TO SWITCH]
      </div>
    </div>
  );
};
