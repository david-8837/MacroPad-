import React, { useState } from 'react';
import { Radio, Video, Disc, Wifi, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { OBSState } from '../types';

interface OBSPanelProps {
  onTriggerScene: (sceneName: string) => void;
  onToggleStream: () => void;
  onToggleRecord: () => void;
}

export const OBSPanel: React.FC<OBSPanelProps> = ({
  onTriggerScene,
  onToggleStream,
  onToggleRecord,
}) => {
  const [obsState, setObsState] = useState<OBSState>({
    isConnected: true,
    isStreaming: false,
    isRecording: false,
    currentScene: 'Full Camera',
    scenes: ['Full Camera', 'Gameplay + Facecam', 'BRB Intermission', 'Ending Screen'],
    droppedFrames: 0,
    fps: 60,
    kbitrate: 6000,
  });

  const handleSceneClick = (sc: string) => {
    setObsState(prev => ({ ...prev, currentScene: sc }));
    onTriggerScene(sc);
  };

  const handleStreamToggle = () => {
    setObsState(prev => ({ ...prev, isStreaming: !prev.isStreaming }));
    onToggleStream();
  };

  const handleRecordToggle = () => {
    setObsState(prev => ({ ...prev, isRecording: !prev.isRecording }));
    onToggleRecord();
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${obsState.isStreaming ? 'text-red-500 animate-pulse' : 'text-[#FF5E00]'}`} />
          <h3 className="font-semibold text-white text-sm">
            OBS Studio WebSocket v5 Bridge
          </h3>
        </div>

        {/* Live Tally Indicator */}
        <div className="flex items-center gap-2">
          {obsState.isStreaming && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[10px] font-mono text-red-400 font-bold tally-live">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              LIVE ON AIR
            </div>
          )}
          <span className="text-[10px] font-mono text-[#38EF7D] bg-[#38EF7D]/10 px-2 py-0.5 rounded-full border border-[#38EF7D]/20 flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5" />
            CONNECTED :4455
          </span>
        </div>
      </div>

      {/* Broadcast Telemetry Grid */}
      <div className="grid grid-cols-3 gap-2 text-center font-mono">
        <div className="p-2 rounded-lg bg-[#0F1218] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase">Framerate</div>
          <div className="text-xs font-bold text-white">{obsState.fps} FPS</div>
        </div>
        <div className="p-2 rounded-lg bg-[#0F1218] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase">Bitrate</div>
          <div className="text-xs font-bold text-white">{obsState.kbitrate} Kbps</div>
        </div>
        <div className="p-2 rounded-lg bg-[#0F1218] border border-white/5">
          <div className="text-[9px] text-white/40 uppercase">Dropped Frames</div>
          <div className={`text-xs font-bold ${obsState.droppedFrames > 0 ? 'text-red-400' : 'text-[#38EF7D]'}`}>
            {obsState.droppedFrames} (0.0%)
          </div>
        </div>
      </div>

      {/* Quick Scene Trigger Palette */}
      <div>
        <label className="text-[11px] font-mono uppercase text-white/40 mb-2 block">
          Current Active Scene
        </label>
        <div className="grid grid-cols-2 gap-2">
          {obsState.scenes.map(sc => {
            const isActive = obsState.currentScene === sc;
            return (
              <button
                key={sc}
                onClick={() => handleSceneClick(sc)}
                className={`p-2 rounded-xl text-left border text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#FF5E00]/15 border-[#FF5E00] text-white shadow-[0_0_12px_rgba(255,94,0,0.3)]'
                    : 'bg-[#0F1218] border-white/5 hover:border-white/20 text-white/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{sc}</span>
                  {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-[#FF5E00]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stream & Record Action Bar */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleStreamToggle}
          className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase transition-all flex items-center justify-center gap-2 ${
            obsState.isStreaming
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30'
              : 'bg-[#1A1F2B] hover:bg-[#222838] text-white border border-white/10'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          {obsState.isStreaming ? 'Stop Streaming' : 'Start Streaming'}
        </button>

        <button
          onClick={handleRecordToggle}
          className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase transition-all flex items-center justify-center gap-2 ${
            obsState.isRecording
              ? 'bg-[#A855F7] text-white shadow-lg shadow-purple-600/30'
              : 'bg-[#1A1F2B] hover:bg-[#222838] text-white border border-white/10'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          {obsState.isRecording ? 'Stop Recording' : 'Record MP4'}
        </button>
      </div>
    </div>
  );
};
