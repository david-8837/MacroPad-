import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Cpu,
  HardDrive,
  CheckCircle,
  AlertTriangle,
  FolderOpen,
  Zap,
  RefreshCw,
  Info,
} from 'lucide-react';
import { FirmwareStatus, Uf2Inspection, FlashProgress } from '../types/electron';

interface FirmwareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirmwareModal: React.FC<FirmwareModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<FirmwareStatus | null>(null);
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
      const res = await window.electronAPI.getFirmwareStatus();
      setStatus(res);
    } catch (e: unknown) {
      console.error('Failed to get firmware status:', e);
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setFlashSuccess(null);
      setFlashError(null);
      setFlashProgress(null);
      return;
    }
    checkStatus();
    const interval = setInterval(checkStatus, 2500);
    return () => clearInterval(interval);
  }, [isOpen, checkStatus]);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.onFirmwareFlashProgress) return;
    const unsub = window.electronAPI.onFirmwareFlashProgress((progress) => {
      setFlashProgress(progress);
    });
    return unsub;
  }, [isOpen]);

  const handleBrowse = async () => {
    if (!window.electronAPI?.browseFirmwareUf2) return;
    setInspectError(null);
    setFlashSuccess(null);
    setFlashError(null);
    try {
      const res = await window.electronAPI.browseFirmwareUf2();
      if (!res) return;
      setSelectedFile(res.filePath);
      if (res.ok && res.value) {
        setInspection(res.value);
        setInspectError(null);
      } else {
        setInspection(null);
        setInspectError(res.error || 'Invalid UF2 firmware file');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setInspectError(`Failed to open file: ${msg}`);
    }
  };

  const handleFlash = async () => {
    if (!selectedFile || !window.electronAPI?.flashFirmwareUf2) return;
    setFlashing(true);
    setFlashError(null);
    setFlashSuccess(null);
    setFlashProgress({ stage: 'copying', percent: 0 });

    try {
      const res = await window.electronAPI.flashFirmwareUf2(selectedFile);
      if (res.ok) {
        setFlashSuccess(
          res.value?.note ||
            `Firmware successfully flashed! Device has rebooted${
              res.value?.version ? ` (v${res.value.version})` : ''
            }.`
        );
        checkStatus();
      } else {
        setFlashError(res.error || 'Failed to flash firmware to device');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFlashError(`Error during flashing: ${msg}`);
    } finally {
      setFlashing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#EDECE8] animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-[#FFFFFF] border border-[#E3E2DE] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E3E2DE] flex items-center justify-between bg-[#EDECE8]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#EDECE8] border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#141414] flex items-center gap-2">
                RP2040 Firmware Flasher
              </h2>
              <p className="text-xs text-[#646464]">
                Safe USB mass-storage UF2 image validation & flasher
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#444343] hover:text-[#141414] flex items-center justify-center border border-[#E3E2DE] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Bootloader Status Card */}
          <div
            className={`p-4 border transition-all ${
 status?.inBootloader
 ? 'bg-[#EDECE8] border-[#C7C7C7] text-[#141414]'
 : 'bg-[#EDECE8] border-[#E3E2DE] text-[#141414]'
 }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive
                  className={`w-5 h-5 ${
 status?.inBootloader ? 'text-[#1351AA]' : 'text-[#646464]'
 }`}
                />
                <div>
                  <div className="text-xs font-mono font-bold uppercase tracking-wider">
                    Bootloader Detection
                  </div>
                  <div className="text-xs text-[#444343]">
                    {status?.inBootloader
                      ? `Mounted: ${status.drivePath} (RPI-RP2 Volume)`
                      : 'Not in BOOTSEL mode'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 border ${
 status?.inBootloader
 ? 'bg-[#EDECE8] text-[#1351AA] border-[#C7C7C7]'
 : 'bg-[#F4F3F0] text-[#646464] border-[#E3E2DE]'
 }`}
                >
                  {status?.inBootloader ? 'READY TO FLASH' : 'STANDBY'}
                </span>

                <button
                  onClick={checkStatus}
                  disabled={checkingStatus}
                  className="p-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#444343] hover:text-[#141414] border border-[#E3E2DE] transition-colors"
                  title="Refresh Bootloader Status"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
 checkingStatus ? 'animate-spin text-[#1351AA]' : ''
 }`}
                  />
                </button>
              </div>
            </div>

            {!status?.inBootloader && (
              <div className="mt-3 pt-3 border-t border-[#E3E2DE] space-y-1.5 text-xs text-[#646464]">
                <div className="flex items-center gap-1.5 text-[#444343] font-semibold">
                  <Info className="w-3.5 h-3.5 text-[#1351AA]" />
                  How to enter BOOTSEL Mode:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed pl-1 text-[#444343] font-mono">
                  <li>Unplug the macropad USB cable from your PC.</li>
                  <li>Press and hold the <strong className="text-[#141414]">BOOT</strong> button on the board.</li>
                  <li>Plug the USB cable back in, then release the button.</li>
                  <li>Windows mounts the drive automatically as <strong className="text-[#141414]">RPI-RP2</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* UF2 Image Selection Card */}
          <div className="p-4 bg-[#EDECE8] border border-[#E3E2DE] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#444343] uppercase">
                Firmware Image (.uf2)
              </span>
              <button
                onClick={handleBrowse}
                disabled={flashing}
                className="px-3 py-1.5 bg-[#F4F3F0] hover:bg-[#EDECE8] border border-[#E3E2DE] hover:border-[#141414] text-[#141414] text-xs font-mono flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#1351AA]" />
                Browse File...
              </button>
            </div>

            {selectedFile ? (
              <div className="p-3 bg-[#FFFFFF] border border-[#E3E2DE] font-mono text-xs">
                <div className="text-[#141414] truncate font-bold" title={selectedFile}>
                  {selectedFile.split(/[/\\]/).pop()}
                </div>
                <div className="text-[10px] text-[#646464] truncate mt-0.5" title={selectedFile}>
                  {selectedFile}
                </div>

                {inspection && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#E3E2DE] text-[11px]">
                    <div>
                      <span className="text-[#646464] block text-[9px] uppercase">Chip Family</span>
                      <span className="text-[#1351AA] font-bold">{inspection.family}</span>
                    </div>
                    <div>
                      <span className="text-[#646464] block text-[9px] uppercase">Firmware Size</span>
                      <span className="text-[#141414]">
                        {(inspection.firmwareBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <div>
                      <span className="text-[#646464] block text-[9px] uppercase">UF2 Blocks</span>
                      <span className="text-[#141414]">{inspection.blockCount} blocks</span>
                    </div>
                    <div>
                      <span className="text-[#646464] block text-[9px] uppercase">Version</span>
                      <span className="text-[#1351AA]">{inspection.version || 'Embedded'}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 border border-dashed border-[#E3E2DE] text-center text-xs text-[#646464]">
                No .uf2 firmware selected. Click "Browse File..." to select a pre-built firmware binary.
              </div>
            )}

            {inspectError && (
              <div className="p-3 bg-[#141414]/30 border border-[#C7C7C7]/30 text-[#141414] text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#141414] shrink-0 mt-0.5" />
                <span className="leading-snug">{inspectError}</span>
              </div>
            )}
          </div>

          {/* Progress / Status feedback */}
          {flashProgress && flashing && (
            <div className="p-4 bg-[#EDECE8] border border-[#C7C7C7] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#1351AA] font-bold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {flashProgress.stage === 'copying'
                    ? 'Writing UF2 blocks to RPI-RP2 volume...'
                    : 'Board rebooting into new firmware...'}
                </span>
                <span className="text-[#444343]">{flashProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-[#EDECE8] overflow-hidden border border-[#E3E2DE]">
                <div
                  className="h-full  transition-all duration-200"
                  style={{ width: `${flashProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {flashSuccess && (
            <div className="p-4 bg-[#EDECE8] border border-[#C7C7C7] text-[#1351AA] text-xs flex items-start gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold font-mono">Flashing Completed Successfully</div>
                <div className="text-[#444343] leading-relaxed">{flashSuccess}</div>
              </div>
            </div>
          )}

          {flashError && (
            <div className="p-4 bg-[#141414]/40 border border-[#C7C7C7]/40 text-[#141414] text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#141414] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold font-mono">Firmware Flashing Failed</div>
                <div className="text-[#444343] leading-relaxed">{flashError}</div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-[#E3E2DE] bg-[#EDECE8] flex items-center justify-between">
          <div className="text-[11px] text-[#646464] font-mono">
            {inspection ? `Target: ${inspection.targetAddress}` : 'RP2040 ROM Bootloader Flasher'}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={flashing}
              className="px-4 py-2 bg-[#F4F3F0] hover:bg-[#EDECE8] text-[#444343] hover:text-[#141414] text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
            <button
              onClick={handleFlash}
              disabled={!status?.inBootloader || !inspection || flashing}
              className={`px-5 py-2 font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
 status?.inBootloader && inspection && !flashing
 ? 'text-[#E3E2DE] hover:brightness-110 active:scale-95'
 : 'bg-[#F4F3F0] border border-[#E3E2DE] text-[#646464] cursor-not-allowed'
 }`}
            >
              <Zap className="w-4 h-4 fill-current" />
              {flashing ? 'Flashing RP2040...' : 'Flash Firmware'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

