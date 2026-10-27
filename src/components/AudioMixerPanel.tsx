import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff, Music, MessageSquare, Gamepad2, Laptop } from 'lucide-react';
import { AudioSessionItem } from '../types';

interface AudioMixerPanelProps {
  onAdjustVolume: (processName: string, delta: number) => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({ onAdjustVolume }) => {
  const [sessions, setSessions] = useState<AudioSessionItem[]>([
    { id: 'master', name: 'Master Output', process: 'master', icon: 'Laptop', volume: 75, isMuted: false, peakDb: -6 },
    { id: 'spotify', name: 'Spotify Music', process: 'spotify.exe', icon: 'Music', volume: 60, isMuted: false, peakDb: -12 },
    { id: 'discord', name: 'Discord Voice', process: 'discord.exe', icon: 'MessageSquare', volume: 85, isMuted: false, peakDb: -4 },
    { id: 'game', name: 'Active Game / Window', process: 'focus', icon: 'Gamepad2', volume: 70, isMuted: false, peakDb: -9 },
    { id: 'mic', name: 'Microphone Input', process: 'mic', icon: 'Mic', volume: 90, isMuted: false, peakDb: -3 },
  ]);

  const toggleMute = (id: string) => {
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, isMuted: !s.isMuted } : s)
    );
  };

  const setVolume = (id: string, vol: number) => {
    setSessions(prev =>
      prev.map(s => s.id === id ? { ...s, volume: vol } : s)
    );
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#FF5E00]" />
            WASAPI Per-Process Audio Mixer
          </h3>
          <p className="text-[11px] text-white/40">
            Control discrete application volumes via rotary encoder or macropad switches
          </p>
        </div>
        <span className="text-[10px] font-mono text-[#38EF7D] bg-[#38EF7D]/10 px-2 py-0.5 rounded-full border border-[#38EF7D]/20">
          WASAPI ACTIVE
        </span>
      </div>

      {/* Audio Sliders Grid */}
      <div className="space-y-3">
        {sessions.map(s => (
          <div
            key={s.id}
            className="p-2.5 rounded-xl bg-[#0F1218] border border-white/5 flex items-center gap-3 hover:border-white/10 transition-colors"
          >
            {/* Mute Button */}
            <button
              onClick={() => toggleMute(s.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                s.isMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-white/5 text-white/80 hover:bg-white/10'
              }`}
            >
              {s.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Label & Process info */}
            <div className="w-36">
              <div className="text-xs font-medium text-white truncate">{s.name}</div>
              <div className="text-[9px] font-mono text-white/40 truncate">{s.process}</div>
            </div>

            {/* Volume Slider */}
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={s.isMuted ? 0 : s.volume}
                onChange={(e) => setVolume(s.id, parseInt(e.target.value))}
                className="w-full accent-[#FF5E00] cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
              />
              <span className="w-8 text-right font-mono text-xs text-white/70">
                {s.isMuted ? 'MUTE' : `${s.volume}%`}
              </span>
            </div>

            {/* Live Peak Meter Bar */}
            <div className="w-8 h-4 bg-black/60 rounded flex items-end p-0.5 border border-white/5">
              <div
                className={`w-full rounded-xs transition-all duration-150 ${
                  s.isMuted ? 'h-0' : s.volume > 85 ? 'bg-red-500' : 'bg-[#38EF7D]'
                }`}
                style={{ height: s.isMuted ? '0%' : `${Math.min(100, (s.volume / 100) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
