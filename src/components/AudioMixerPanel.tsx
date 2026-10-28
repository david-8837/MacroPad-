import React, { useCallback, useEffect, useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff } from 'lucide-react';

/**
 * Master output and microphone, measured on Windows.
 *
 * This panel used to seed five plausible-looking sessions — "Spotify Music 60 %",
 * "Discord Voice 85 %", an "Active Game" at 70 % — and paint a peak meter from the
 * volume number. None of it was measured: the rows appeared whether or not those
 * apps were running, and the "peak" was the slider value. It now shows the two
 * things the bridge can actually read, and says so when it cannot read them.
 *
 * Per-app volume still exists, but as a key action: bind a switch to
 * `audio_session` and `actionExecutor` calls the WASAPI session API directly. That
 * is why the per-app bridge channels were removed from here but the engine stayed.
 */
export const AudioMixerPanel: React.FC = () => {
  const [masterVolume, setMasterVolume] = useState<number | null>(null);
  const [masterMuted, setMasterMuted] = useState(false);
  const [micLevel, setMicLevel] = useState<number | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bridge = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const hasBridge = Boolean(bridge?.getMasterVolume);

  useEffect(() => {
    if (!bridge) return;

    bridge.getMasterVolume?.()
      .then((res) => {
        if (res.ok && typeof res.value === 'number') setMasterVolume(res.value);
        else if (!res.ok) setError(res.error || 'Windows did not report a master volume.');
      })
      .catch((err) => setError(String(err?.message || err)));

    bridge.getMasterMute?.()
      .then((res) => { if (res.ok && typeof res.value === 'boolean') setMasterMuted(res.value); })
      .catch(() => { /* the mute state simply stays unknown */ });

    bridge.getMic?.()
      .then((res) => {
        if (res.ok && res.value) {
          setMicLevel(res.value.level);
          setMicMuted(res.value.muted);
        }
      })
      .catch(() => { /* no microphone on this machine */ });
  }, [bridge]);

  const changeMaster = useCallback(async (next: number) => {
    setMasterVolume(next);
    await bridge?.setMasterVolume?.(next);
  }, [bridge]);

  const changeMic = useCallback(async (next: number) => {
    setMicLevel(next);
    await bridge?.setMic?.({ level: next });
  }, [bridge]);

  const toggleMasterMute = async () => {
    const next = !masterMuted;
    setMasterMuted(next);
    await bridge?.toggleMasterMute?.();
  };

  const toggleMicMute = async () => {
    const next = !micMuted;
    setMicMuted(next);
    await bridge?.setMic?.({ muted: next });
  };

  const row = (
    label: string,
    device: string,
    value: number | null,
    muted: boolean,
    onVolume: (v: number) => void,
    onMute: () => void,
    MuteIcon: React.FC<{ className?: string }>,
    LevelIcon: React.FC<{ className?: string }>,
  ) => (
    <div className="p-2.5 bg-[#FFFFFF] border border-[#E3E2DE] flex items-center gap-3">
      <button
        type="button"
        onClick={onMute}
        title={muted ? `Unmute ${device}` : `Mute ${device}`}
        className={`w-8 h-8 flex items-center justify-center border transition-colors ${
          muted
            ? 'bg-[#EDECE8] text-[#141414] border-[#C7C7C7]'
            : 'bg-[#F4F3F0] text-[#444343] border-transparent hover:bg-[#EDECE8]'
        }`}
      >
        {muted ? <MuteIcon className="w-4 h-4" /> : <LevelIcon className="w-4 h-4" />}
      </button>

      <div className="w-36">
        <div className="text-xs font-medium text-[#141414] truncate">{label}</div>
        <div className="text-[9px] font-mono text-[#646464] truncate">{device}</div>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="100"
          value={value ?? 0}
          disabled={value === null}
          onChange={(e) => onVolume(parseInt(e.target.value, 10))}
          className="w-full accent-[#1351AA] cursor-pointer h-1.5 bg-[#EDECE8] appearance-none disabled:cursor-not-allowed"
        />
        <span className="w-12 text-right font-mono text-xs text-[#444343]">
          {value === null ? '--' : muted ? 'MUTE' : `${value}%`}
        </span>
      </div>
    </div>
  );

  return (
    <div className="panel p-4 border border-[#E3E2DE] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#141414] text-sm flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#1351AA]" />
            Windows Audio
          </h3>
          <p className="text-[11px] text-[#646464] leading-relaxed">
            Master output and microphone, read from Windows. Per-app volume is a key
            action — bind a switch to <span className="font-mono">AUDIO SESSION</span>.
          </p>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 border flex-none ${
          hasBridge && !error
            ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]'
            : 'text-[#646464] bg-[#F4F3F0] border-[#C7C7C7]'
        }`}>
          {hasBridge && !error ? 'WASAPI' : 'UNAVAILABLE'}
        </span>
      </div>

      {hasBridge && !error ? (
        <div className="space-y-2">
          {row('Master Output', 'default playback device', masterVolume, masterMuted, changeMaster, toggleMasterMute, VolumeX, Volume2)}
          {row('Microphone', 'default capture device', micLevel, micMuted, changeMic, toggleMicMute, MicOff, Mic)}
        </div>
      ) : (
        <div className="text-[11px] font-mono text-[#646464] leading-relaxed border border-[#E3E2DE] bg-[#F4F3F0] p-3">
          {error
            ? `Windows did not answer: ${error}`
            : 'No audio bridge. These values come from Windows through PowerShell, so they exist only in the desktop app — the browser preview has nothing to read. Per-app volume keys still work on the device.'}
        </div>
      )}
    </div>
  );
};
