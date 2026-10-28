import React, { useState, useEffect } from 'react';
import { Radio, Disc, Wifi, WifiOff, AlertTriangle, CheckCircle2, RefreshCw, KeyRound, Globe } from 'lucide-react';
import type { ObsState as NativeObsState } from '../types/electron';

interface OBSPanelProps {
  onTriggerScene?: (sceneName: string) => void;
  onToggleStream?: () => void;
  onToggleRecord?: () => void;
}

export const OBSPanel: React.FC<OBSPanelProps> = ({
  onTriggerScene,
  onToggleStream,
  onToggleRecord,
}) => {
  const [url, setUrl] = useState('ws://127.0.0.1:4455');
  const [password, setPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const [obsState, setObsState] = useState<NativeObsState>({
    connected: false,
    streaming: false,
    recording: false,
    currentScene: 'Full Camera',
    scenes: ['Full Camera', 'Gameplay + Facecam', 'BRB Intermission', 'Ending Screen'],
    sources: [],
    mutedSources: [],
    error: undefined,
  });

  useEffect(() => {
    if (!window.electronAPI) return;

    // Fetch initial state
    window.electronAPI.obsGetState?.().then((res) => {
      if (res && res.ok && res.value) {
        setObsState(res.value);
      }
    });

    // Subscribe to state change broadcasts
    const unsubscribe = window.electronAPI.onObsStateChanged?.((state) => {
      setObsState(state);
      setIsConnecting(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleConnectToggle = async () => {
    if (!window.electronAPI) {
      setObsState(prev => ({ ...prev, connected: !prev.connected }));
      return;
    }

    if (obsState.connected) {
      await window.electronAPI.obsDisconnect?.();
    } else {
      setIsConnecting(true);
      const res = await window.electronAPI.obsConnect?.(url, password);
      setIsConnecting(false);
      if (res && !res.ok) {
        setObsState(prev => ({ ...prev, error: res.error }));
      }
    }
  };

  const handleSceneClick = async (sc: string) => {
    setObsState(prev => ({ ...prev, currentScene: sc }));
    onTriggerScene?.(sc);
    if (window.electronAPI?.obsCommand) {
      await window.electronAPI.obsCommand('setScene', sc);
    }
  };

  const handleStreamToggle = async () => {
    setObsState(prev => ({ ...prev, streaming: !prev.streaming }));
    onToggleStream?.();
    if (window.electronAPI?.obsCommand) {
      await window.electronAPI.obsCommand('toggleStreaming');
    }
  };

  const handleRecordToggle = async () => {
    setObsState(prev => ({ ...prev, recording: !prev.recording }));
    onToggleRecord?.();
    if (window.electronAPI?.obsCommand) {
      await window.electronAPI.obsCommand('toggleRecording');
    }
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${obsState.streaming ? 'text-red-500 animate-pulse' : 'text-[#FF5E00]'}`} />
          <div>
            <h3 className="font-semibold text-white text-sm">
              OBS Studio WebSocket v5 Bridge
            </h3>
            <p className="text-[10px] text-white/40">Direct low-latency WebSocket RPC</p>
          </div>
        </div>

        {/* Live Tally & Connection Status Indicator */}
        <div className="flex items-center gap-2">
          {obsState.streaming && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[10px] font-mono text-red-400 font-bold tally-live">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              LIVE ON AIR
            </div>
          )}

          <button
            onClick={handleConnectToggle}
            disabled={isConnecting}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all ${
              obsState.connected
                ? 'text-[#38EF7D] bg-[#38EF7D]/10 border-[#38EF7D]/20 hover:bg-[#38EF7D]/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
            }`}
          >
            {isConnecting ? (
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            ) : obsState.connected ? (
              <Wifi className="w-2.5 h-2.5" />
            ) : (
              <WifiOff className="w-2.5 h-2.5" />
            )}
            {isConnecting ? 'CONNECTING...' : obsState.connected ? 'CONNECTED :4455' : 'OFFLINE (CONNECT)'}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-[10px] text-white/40 hover:text-white transition-colors"
            title="Connection Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Settings Panel (Toggleable) */}
      {showSettings && (
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-white/40" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://127.0.0.1:4455"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-hidden focus:border-[#FF5E00]"
            />
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-white/40" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Server Password (if enabled)"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-hidden focus:border-[#FF5E00]"
            />
          </div>
          {obsState.error && (
            <div className="text-[11px] text-red-400 bg-red-950/40 p-1.5 rounded border border-red-500/20 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{obsState.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick Scene Trigger Palette */}
      <div>
        <label className="text-[11px] font-mono uppercase text-white/40 mb-2 block">
          Scenes ({obsState.scenes.length}) — Click to Switch Program
        </label>
        {obsState.scenes.length === 0 ? (
          <div className="p-3 text-center text-xs text-white/40 italic bg-black/20 rounded-xl border border-white/5">
            No scenes detected. Connect OBS and verify WebSocket Server Settings.
          </div>
        ) : (
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
                    <span className="truncate pr-1">{sc}</span>
                    {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-[#FF5E00] shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Stream & Record Action Bar */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleStreamToggle}
          className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase transition-all flex items-center justify-center gap-2 ${
            obsState.streaming
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30'
              : 'bg-[#1A1F2B] hover:bg-[#222838] text-white border border-white/10'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          {obsState.streaming ? 'Stop Streaming' : 'Start Streaming'}
        </button>

        <button
          onClick={handleRecordToggle}
          className={`flex-1 py-2 rounded-xl text-xs font-bold font-mono uppercase transition-all flex items-center justify-center gap-2 ${
            obsState.recording
              ? 'bg-[#A855F7] text-white shadow-lg shadow-purple-600/30'
              : 'bg-[#1A1F2B] hover:bg-[#222838] text-white border border-white/10'
          }`}
        >
          <Disc className="w-3.5 h-3.5" />
          {obsState.recording ? 'Stop Recording' : 'Record MP4'}
        </button>
      </div>
    </div>
  );
};
