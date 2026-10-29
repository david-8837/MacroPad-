import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import type { FirmwareStatus, FlashProgress, FirmwareOption } from '../types/electron';

interface FirmwarePanelProps {
  isExpanded: boolean;
}

const previewOptions: FirmwareOption[] = [
  { id: 'full', name: 'Full Deck', untested: true, description: 'Display support · LED output varies by build.', available: false, error: 'Open the desktop app to check availability.' },
  { id: 'essential', name: 'Keys & Knob', untested: true, description: 'No display or LEDs.', available: false, error: 'Open the desktop app to check availability.' },
];

/** Full UF2 workflow inside the sidebar disclosure. Opening it never launches an app modal. */
export const FirmwarePanel: React.FC<FirmwarePanelProps> = ({ isExpanded }) => {
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [options, setOptions] = useState<FirmwareOption[]>(previewOptions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acknowledgedUntested, setAcknowledgedUntested] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [flashProgress, setFlashProgress] = useState<FlashProgress | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!window.electronAPI?.getFirmwareStatus) return;
    try {
      setStatus(await window.electronAPI.getFirmwareStatus());
      setStatusError(null);
    } catch {
      setStatus(null); // A stale ready state must never leave Flash enabled.
      setStatusError('Could not check the BOOTSEL drive. Retry in the Windows app.');
    }
  }, []);

  // Poll only while open, but keep the panel mounted across collapses so a
  // selected option and any in-flight flash are not silently discarded.
  useEffect(() => {
    if (!isExpanded) return;
    void checkStatus();
    const timer = window.setInterval(() => { void checkStatus(); }, 2500);
    return () => window.clearInterval(timer);
  }, [isExpanded, checkStatus]);

  // Continue receiving progress if someone collapses the row during a transfer.
  useEffect(() => {
    if ((!isExpanded && !flashing) || !window.electronAPI?.onFirmwareFlashProgress) return;
    return window.electronAPI.onFirmwareFlashProgress(setFlashProgress);
  }, [isExpanded, flashing]);

  useEffect(() => {
    if (!isExpanded || !window.electronAPI?.listBuiltinFirmware) return;
    let active = true;
    window.electronAPI.listBuiltinFirmware().then((items) => {
      if (active) { setOptions(items); setCatalogError(null); }
    }).catch(() => {
      if (active) { setOptions(previewOptions); setCatalogError('Could not load firmware choices. Reopen this panel to retry.'); }
    });
    return () => { active = false; };
  }, [isExpanded]);

  const selected = options.find((option) => option.id === selectedId);

  const handleFlash = async () => {
    if (!selected?.available || (selected.untested && !acknowledgedUntested) || !status?.inBootloader || flashing || !window.electronAPI?.flashBuiltinFirmware) return;
    setFlashing(true);
    setFlashError(null);
    setFlashSuccess(null);
    setFlashProgress({ stage: 'copying', percent: 0 });
    try {
      // The main process rechecks the UF2 and drive before writing anything.
      const res = await window.electronAPI.flashBuiltinFirmware(selected.id, acknowledgedUntested);
      if (res.ok) {
        setFlashSuccess(`${res.value?.note || 'The BOOTSEL drive accepted the UF2 transfer.'} Verify the pad boots and reconnects; the transfer alone does not validate your hardware.`);
        void checkStatus();
      } else {
        setFlashError(res.error || 'Failed to transfer firmware to the device');
      }
    } catch (error: unknown) {
      setFlashError(`Error during transfer: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setFlashing(false);
    }
  };

  if (!isExpanded) return null;

  const nativeAvailable = Boolean(window.electronAPI?.getFirmwareStatus);
  const ready = Boolean(status?.inBootloader);
  const canFlash = ready && Boolean(selected?.available && (!selected.untested || acknowledgedUntested) && window.electronAPI?.flashBuiltinFirmware) && !flashing;

  return (
    <div className="min-w-0 px-3 py-2 space-y-2 bg-[#F4F3F0] text-[#141414]">
      <section className="min-w-0">
        <span className="block font-mono text-[10px] font-bold uppercase">Choose firmware</span>
        <div className="mt-1.5 space-y-1" role="radiogroup" aria-label="Firmware version">
          {options.map((option) => (
            <label key={option.id} className={`flex items-start gap-2 px-2 py-1.5 border cursor-pointer ${selectedId === option.id ? 'border-[#1351AA] bg-[#EDF3FC]' : 'border-[#C7C7C7] bg-white'}`}>
              <input type="radio" name="firmware-version" value={option.id} checked={selectedId === option.id}
                disabled={flashing} onChange={() => { setSelectedId(option.id); setAcknowledgedUntested(false); setFlashSuccess(null); setFlashError(null); }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold">{option.name}</span>
                  {nativeAvailable && <span className={`font-mono text-[8px] ${option.available ? 'text-[#1351AA]' : 'text-[#A23333]'}`}>
                    {option.available ? (option.untested ? 'Untested' : 'Ready') : 'Unavailable'}
                  </span>}
                </span>
                <span className="block mt-0.5 text-[9px] leading-snug text-[#444343]">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        {catalogError && <p role="alert" className="mt-1 text-[10px] text-[#A23333]">{catalogError}</p>}
        {selected && nativeAvailable && !selected.available && <p role="status" className="mt-1 text-[9px] text-[#A23333]">{selected.error || 'Firmware not available yet.'}</p>}
        {selected?.available && selected.untested && (
          <label className="mt-2 flex items-start gap-2 border border-[#D3A24A] bg-[#FFF8E8] p-2 text-[9px] leading-snug text-[#513800]">
            <input type="checkbox" checked={acknowledgedUntested} disabled={flashing}
              onChange={(event) => setAcknowledgedUntested(event.target.checked)} />
            <span>Untested firmware: check that it matches your RP2040 board and wiring. It has not been verified on a physical pad. I understand and want to proceed.</span>
          </label>
        )}
      </section>

      {flashing && flashProgress && (
        <div role="status" className="border border-[#C7C7C7] px-2.5 py-2.5 bg-[#FFFFFF]">
          <p className="text-[10px] font-mono font-bold text-[#1351AA] break-words">
            {flashProgress.stage === 'copying' ? 'Transferring UF2 blocks…' : 'Waiting for board reboot…'} {flashProgress.percent}%
          </p>
          <div className="mt-2 h-1.5 bg-[#E3E2DE] overflow-hidden">
            <div className="h-full bg-[#1351AA]" style={{ width: `${Math.min(100, Math.max(0, flashProgress.percent))}%` }} />
          </div>
        </div>
      )}
      {flashSuccess && (
        <p role="status" className="flex items-start gap-1.5 px-2.5 py-2.5 border border-[#C7C7C7] text-[10px] leading-snug text-[#1351AA] break-words">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" /> {flashSuccess}
        </p>
      )}
      {flashError && (
        <p role="alert" className="flex items-start gap-1.5 px-2.5 py-2.5 border border-[#C7C7C7] text-[10px] leading-snug text-[#A23333] break-words">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {flashError}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => { void handleFlash(); }}
          disabled={!canFlash}
          title="Requires an available firmware choice and an RPI-RP2 BOOTSEL drive"
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border border-[#1351AA] bg-[#1351AA] text-[#FFFFFF] font-mono text-[10px] font-bold disabled:bg-[#EDECE8] disabled:text-[#646464] disabled:border-[#C7C7C7]"
        >
          <Zap className="w-3.5 h-3.5" /> {flashing ? 'Transferring…' : 'Flash Firmware'}
        </button>
        {selected?.available && nativeAvailable && !ready && !flashing && (
          <p role="status" className="mt-1.5 text-[9px] leading-snug text-[#646464]">
            {statusError || 'Connect the pad in BOOTSEL mode: unplug USB, hold BOOT while reconnecting, then release.'}
          </p>
        )}
        {!nativeAvailable && <p className="mt-1 text-[9px] leading-snug text-[#646464]">Open the desktop app to flash.</p>}
        {nativeAvailable && ready && <p className="mt-1 text-[9px] text-[#1351AA]">BOOTSEL connected · verify the pad after flashing.</p>}
      </div>
    </div>
  );
};
