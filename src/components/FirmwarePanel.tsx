import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, FolderOpen, HardDrive, RefreshCw, Zap } from 'lucide-react';
import type { FirmwareStatus, FlashProgress, Uf2Inspection } from '../types/electron';

interface FirmwarePanelProps {
  isExpanded: boolean;
}

/** Full UF2 workflow inside the sidebar disclosure. Opening it never launches an app modal. */
export const FirmwarePanel: React.FC<FirmwarePanelProps> = ({ isExpanded }) => {
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Uf2Inspection | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [flashProgress, setFlashProgress] = useState<FlashProgress | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!window.electronAPI?.getFirmwareStatus) return;
    setCheckingStatus(true);
    try {
      setStatus(await window.electronAPI.getFirmwareStatus());
      setStatusError(null);
    } catch {
      setStatus(null); // A stale ready state must never leave Flash enabled.
      setStatusError('Could not check the BOOTSEL drive. Retry in the Windows app.');
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  // Poll only while open, but keep the panel mounted across collapses so a
  // selected/inspected file and any in-flight flash are not silently discarded.
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

  const handleBrowse = async () => {
    if (!window.electronAPI?.browseFirmwareUf2 || flashing) return;
    setInspectError(null);
    setFlashSuccess(null);
    setFlashError(null);
    try {
      // This explicit action opens the native Windows FILE picker. Expanding
      // the sidebar row itself never opens a dialog.
      const res = await window.electronAPI.browseFirmwareUf2();
      if (!res) return;
      setSelectedFile(res.filePath);
      if (res.ok && res.value) {
        setInspection(res.value);
      } else {
        setInspection(null);
        setInspectError(res.error || 'Invalid UF2 firmware file');
      }
    } catch (error: unknown) {
      setInspection(null);
      setInspectError(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleFlash = async () => {
    if (!selectedFile || !inspection || !status?.inBootloader || flashing || !window.electronAPI?.flashFirmwareUf2) return;
    setFlashing(true);
    setFlashError(null);
    setFlashSuccess(null);
    setFlashProgress({ stage: 'copying', percent: 0 });
    try {
      // The main process rechecks the UF2 and drive before writing anything.
      const res = await window.electronAPI.flashFirmwareUf2(selectedFile);
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
  const canFlash = ready && Boolean(inspection && selectedFile && window.electronAPI?.flashFirmwareUf2) && !flashing;

  return (
    <div className="min-w-0 px-3 pt-3 pb-2 space-y-3 bg-[#F4F3F0] text-[#141414]">
      <p className="font-mono text-[9px] leading-relaxed text-[#444343]">
        Detect the RP2040 BOOTSEL drive (RPI-RP2) and inspect a UF2 before transfer. No image here is boot-verified on your pad.
      </p>

      {!nativeAvailable && (
        <p role="status" className="px-2.5 py-2 border border-[#C7C7C7] text-[10px] leading-snug text-[#444343]">
          Windows app required for BOOTSEL and UF2 controls. Browser preview is read-only.
        </p>
      )}

      <section className="min-w-0 border border-[#C7C7C7] bg-[#FFFFFF] px-2.5 py-3">
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] font-bold uppercase">
            <HardDrive className="w-3.5 h-3.5 text-[#1351AA] shrink-0" /> BOOTSEL Drive
          </span>
          <button
            type="button"
            onClick={() => { void checkStatus(); }}
            disabled={!nativeAvailable || checkingStatus || flashing}
            title="Refresh BOOTSEL drive status"
            aria-label="Refresh BOOTSEL drive status"
            className="w-6 h-6 shrink-0 flex items-center justify-center border border-[#C7C7C7] hover:border-[#1351AA] disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className={`mt-2 font-mono text-[9px] font-bold uppercase ${ready ? 'text-[#1351AA]' : 'text-[#646464]'}`}>
          {ready ? 'Ready to flash' : nativeAvailable ? 'Waiting for BOOTSEL' : 'Unavailable in browser'}
        </p>
        <p className="mt-1 text-[10px] text-[#444343] leading-snug break-words">
          {statusError || (ready
            ? `Mounted: ${status?.drivePath || 'RPI-RP2'}`
            : nativeAvailable
              ? checkingStatus && !status ? 'Checking for RPI-RP2…' : 'No RPI-RP2 drive detected.'
              : 'Drive detection requires the Windows app.')}
        </p>
        {!ready && nativeAvailable && (
          <div className="mt-2 pt-2 border-t border-[#E3E2DE] text-[9px] leading-relaxed text-[#444343]">
            <strong className="block text-[#141414]">To enter BOOTSEL:</strong>
            Unplug USB. Hold BOOT on the RP2040-Zero while reconnecting USB, then release. Windows should mount RPI-RP2.
          </div>
        )}
      </section>

      <section className="min-w-0 border border-[#C7C7C7] bg-[#FFFFFF] px-2.5 py-3">
        <span className="block font-mono text-[10px] font-bold uppercase">Firmware Image (.uf2)</span>
        <p className="mt-1 text-[9px] text-[#646464] leading-relaxed">Choose a pre-built RP2040 image for your exact hardware. Inspection does not prove it boots.</p>
        <button
          type="button"
          onClick={() => { void handleBrowse(); }}
          disabled={!window.electronAPI?.browseFirmwareUf2 || flashing}
          className="mt-2 w-full px-2.5 py-2 flex items-center justify-center gap-1.5 border border-[#C7C7C7] bg-[#EDECE8] hover:border-[#1351AA] font-mono text-[10px] font-bold text-[#141414] disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#1351AA]" /> Browse .uf2 File…
        </button>
        {selectedFile && (
          <p title={selectedFile} className="mt-2 font-mono text-[9px] font-semibold text-[#141414] break-all">
            {selectedFile.split(/[/\\]/).pop()}
          </p>
        )}
        {inspection && (
          <dl className="mt-2 pt-2 border-t border-[#E3E2DE] grid grid-cols-2 gap-x-2 gap-y-1.5 font-mono text-[9px]">
            <div><dt className="text-[#646464]">Chip</dt><dd>{inspection.family}</dd></div>
            <div><dt className="text-[#646464]">Size</dt><dd>{(inspection.firmwareBytes / 1024).toFixed(1)} KB</dd></div>
            <div><dt className="text-[#646464]">Blocks</dt><dd>{inspection.blockCount}</dd></div>
            <div><dt className="text-[#646464]">Version</dt><dd>{inspection.version || 'Unknown'}</dd></div>
            <div className="col-span-2"><dt className="text-[#646464]">Target</dt><dd>{inspection.targetAddress}</dd></div>
          </dl>
        )}
        {inspectError && <p role="alert" className="mt-2 text-[10px] leading-snug text-[#A23333] break-words">{inspectError}</p>}
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

      <div className="-mx-3 px-3 pt-2.5 pb-1 bg-[#F4F3F0] border-t border-[#C7C7C7]">
        <button
          type="button"
          onClick={() => { void handleFlash(); }}
          disabled={!canFlash}
          title="Requires a validated RP2040 UF2 image and an RPI-RP2 BOOTSEL drive"
          className="w-full flex items-center justify-center gap-1.5 px-2 py-2.5 border border-[#1351AA] bg-[#1351AA] text-[#FFFFFF] font-mono text-[10px] font-bold disabled:bg-[#EDECE8] disabled:text-[#646464] disabled:border-[#C7C7C7]"
        >
          <Zap className="w-3.5 h-3.5" /> {flashing ? 'Transferring…' : 'Flash Firmware'}
        </button>
        <p className="mt-1.5 font-mono text-[8.5px] leading-snug text-[#646464]">
          Requires a validated UF2 and a BOOTSEL drive. Verify the pad after transfer.
        </p>
      </div>
    </div>
  );
};
