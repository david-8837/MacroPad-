import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff } from 'lucide-react';

type VolumeQueue = { active: boolean; pending: number | null; confirmed: number | null; revision: number };

/** Windows master output and microphone. No invented audio sessions or meters. */
export const AudioMixerPanel: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const [masterVolume, setMasterVolume] = useState<number | null>(null);
  const [masterMuted, setMasterMuted] = useState(false);
  const [micLevel, setMicLevel] = useState<number | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [muteBusy, setMuteBusy] = useState({ master: false, mic: false });
  const muteRevisions = useRef({ master: 0, mic: 0 });
  const muteInFlight = useRef({ master: false, mic: false });
  const masterQueue = useRef<VolumeQueue>({ active: false, pending: null, confirmed: null, revision: 0 });
  const micQueue = useRef<VolumeQueue>({ active: false, pending: null, confirmed: null, revision: 0 });
  const bridge = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const hasBridge = Boolean(bridge?.getMasterVolume);

  useEffect(() => {
    if (!bridge || !active) return;
    let mounted = true;
    setError(null);
    // Re-read when the panel opens; Windows volume may have changed elsewhere.
    // Ignore an old read if a slider write was already in flight or starts
    // before the read returns, so it cannot overwrite the user's latest input.
    const masterRevision = masterQueue.current.revision;
    const micRevision = micQueue.current.revision;
    const masterWasWriting = masterQueue.current.active;
    const micWasWriting = micQueue.current.active;
    const masterMuteRevision = muteRevisions.current.master;
    const micMuteRevision = muteRevisions.current.mic;
    const masterMuteWasWriting = muteInFlight.current.master;
    const micMuteWasWriting = muteInFlight.current.mic;
    bridge.getMasterVolume?.().then((res) => {
      if (!mounted || masterWasWriting || masterQueue.current.revision !== masterRevision) return;
      if (res.ok && typeof res.value === 'number') {
        masterQueue.current.confirmed = res.value;
        setMasterVolume(res.value);
      } else setError(res.error || 'Windows did not report a master volume.');
    }).catch((err) => {
      if (mounted && !masterWasWriting && masterQueue.current.revision === masterRevision) setError(String(err?.message || err));
    });
    bridge.getMasterMute?.().then((res) => {
      if (mounted && !masterMuteWasWriting && muteRevisions.current.master === masterMuteRevision && res.ok && typeof res.value === 'boolean') setMasterMuted(res.value);
    }).catch(() => { /* mute state is unavailable */ });
    bridge.getMic?.().then((res) => {
      if (!mounted || micWasWriting || micQueue.current.revision !== micRevision) return;
      if (res.ok && res.value) {
        micQueue.current.confirmed = res.value.level;
        setMicLevel(res.value.level);
        if (!micMuteWasWriting && muteRevisions.current.mic === micMuteRevision) setMicMuted(res.value.muted);
      } else { micQueue.current.confirmed = null; setMicLevel(null); }
    }).catch(() => {
      if (mounted && !micWasWriting && micQueue.current.revision === micRevision) { micQueue.current.confirmed = null; setMicLevel(null); }
    });
    return () => { mounted = false; };
  }, [bridge, active]);

  // Serialize updates per device and coalesce intermediate drag positions. If
  // Windows rejects a change, restore the last confirmed value rather than
  // displaying a volume that wasn't actually set.
  const changeVolume = useCallback(async (kind: 'master' | 'mic', next: number) => {
    const queue = kind === 'master' ? masterQueue.current : micQueue.current;
    const setValue = kind === 'master' ? setMasterVolume : setMicLevel;
    queue.revision += 1;
    queue.pending = next;
    setValue(next);
    setControlError(null);
    if (queue.active) return;
    queue.active = true;
    while (queue.pending !== null) {
      const value = queue.pending;
      queue.pending = null;
      try {
        const result = kind === 'master'
          ? await bridge?.setMasterVolume?.(value)
          : await bridge?.setMic?.({ level: value });
        if (!result?.ok) throw new Error(result?.error || 'Audio control is unavailable.');
        const returned = kind === 'master' && 'value' in result ? result.value : undefined;
        queue.confirmed = typeof returned === 'number' ? returned : value;
        if (queue.pending === null) setValue(queue.confirmed);
      } catch (err) {
        if (queue.pending === null) {
          setValue(queue.confirmed);
          setControlError(`${kind === 'master' ? 'Output' : 'Microphone'}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    queue.active = false;
  }, [bridge]);

  const toggleMasterMute = async () => {
    if (muteInFlight.current.master) return;
    muteInFlight.current.master = true;
    muteRevisions.current.master += 1;
    setMuteBusy(prev => ({ ...prev, master: true }));
    try {
      const result = await bridge?.toggleMasterMute?.();
      if (!result?.ok || typeof result.value !== 'boolean') throw new Error(result?.error || 'Mute state could not be changed.');
      setMasterMuted(result.value);
      setControlError(null);
    } catch (err) { setControlError(`Output: ${err instanceof Error ? err.message : String(err)}`); }
    finally { muteInFlight.current.master = false; setMuteBusy(prev => ({ ...prev, master: false })); }
  };

  const toggleMicMute = async () => {
    if (muteInFlight.current.mic) return;
    muteInFlight.current.mic = true;
    muteRevisions.current.mic += 1;
    setMuteBusy(prev => ({ ...prev, mic: true }));
    const next = !micMuted;
    try {
      const result = await bridge?.setMic?.({ muted: next });
      if (!result?.ok) throw new Error(result?.error || 'Mute state could not be changed.');
      setMicMuted(next);
      setControlError(null);
    } catch (err) { setControlError(`Microphone: ${err instanceof Error ? err.message : String(err)}`); }
    finally { muteInFlight.current.mic = false; setMuteBusy(prev => ({ ...prev, mic: false })); }
  };

  const row = (
    label: string, device: string, value: number | null, muted: boolean, busy: boolean,
    onVolume: (v: number) => void, onMute: () => void,
    MuteIcon: React.FC<{ className?: string }>, LevelIcon: React.FC<{ className?: string }>,
  ) => (
    <div className="p-3 bg-white border border-[#E3E2DE] space-y-2">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={onMute} disabled={value === null || busy}
          aria-label={`${muted ? 'Unmute' : 'Mute'} ${label}`} title={`${muted ? 'Unmute' : 'Mute'} ${label}`}
          className={`w-9 h-9 shrink-0 flex items-center justify-center border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            muted ? 'bg-[#EDECE8] text-[#141414] border-[#C7C7C7]' : 'bg-[#F4F3F0] text-[#444343] border-transparent hover:bg-[#EDECE8]'
          }`}>
          {muted ? <MuteIcon className="w-4 h-4" /> : <LevelIcon className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[#141414] truncate">{label}</div>
          <div className="text-[9px] font-mono text-[#646464] truncate">{device}</div>
        </div>
        <span className="shrink-0 text-right font-mono text-xs text-[#444343]" aria-live="polite">
          {value === null ? '--' : muted ? 'MUTE' : `${value}%`}
        </span>
      </div>
      <input type="range" min="0" max="100" value={value ?? 0} disabled={value === null}
        aria-label={`${label} volume`} aria-valuetext={value === null ? 'Unavailable' : `${value}%`}
        onChange={(e) => onVolume(parseInt(e.target.value, 10))}
        className="audio-volume-slider w-full disabled:cursor-not-allowed disabled:opacity-40"
        style={{ '--audio-level': `${value ?? 0}%` } as React.CSSProperties} />
    </div>
  );

  return (
    <div className="panel p-4 border border-[#E3E2DE] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#141414] text-sm flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#1351AA]" /> Windows Audio
          </h3>
          <p className="text-[11px] text-[#646464] leading-relaxed">Master output and microphone, read from Windows.</p>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 border flex-none ${
          hasBridge && !error ? 'text-[#1351AA] bg-[#EDECE8] border-[#C7C7C7]' : 'text-[#646464] bg-[#F4F3F0] border-[#C7C7C7]'
        }`}>{hasBridge && !error ? 'WASAPI' : 'UNAVAILABLE'}</span>
      </div>
      {hasBridge && !error ? (
        <div className="space-y-2">
          {row('Master Output', 'default playback device', masterVolume, masterMuted, muteBusy.master, v => void changeVolume('master', v), () => void toggleMasterMute(), VolumeX, Volume2)}
          {row('Microphone', 'default capture device', micLevel, micMuted, muteBusy.mic, v => void changeVolume('mic', v), () => void toggleMicMute(), MicOff, Mic)}
          {controlError && <p role="alert" className="text-[11px] text-[#8A4B00]">{controlError}</p>}
        </div>
      ) : (
        <div className="text-[11px] font-mono text-[#646464] leading-relaxed border border-[#E3E2DE] bg-[#F4F3F0] p-3">
          {error ? `Windows did not answer: ${error}` : 'Audio levels are available through the Windows desktop app, not the browser preview.'}
        </div>
      )}
    </div>
  );
};
