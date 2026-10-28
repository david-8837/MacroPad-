import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Cpu,
  HardDrive,
  CheckCircle,
  AlertTriangle,
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
  const [selectedFile, setSelectedFile] = useState<string | null>('firmware/kadowaz_deck_rp2040_v1.0.0.uf2');
  const [inspection, setInspection] = useState<Uf2Inspection | null>({
    blockCount: 16,
    firmwareBytes: 4096,
    fileBytes: 8192,
    family: 'RP2040',
    targetAddress: '0x10000000',
    firstSeq: 0,
    version: '1.0.0',
  });
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

  // Load official built-in firmware automatically on mount
  useEffect(() => {
    if (!isOpen) return;
    if (window.electronAPI?.getBuiltinFirmware) {
      window.electronAPI.getBuiltinFirmware().then((res) => {
        if (res && res.ok && res.value) {
          setSelectedFile(res.filePath);
          setInspection(res.value);
        }
      }).catch(() => {
        // Fallback to default bundled inspection
      });
    }
  }, [isOpen]);

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

  const handleFlash = async () => {
    if (!window.electronAPI?.flashBuiltinFirmware && !window.electronAPI?.flashFirmwareUf2) return;
    setFlashing(true);
    setFlashError(null);
    setFlashSuccess(null);
    setFlashProgress({ stage: 'copying', percent: 0 });

    try {
      const res = window.electronAPI.flashBuiltinFirmware
        ? await window.electronAPI.flashBuiltinFirmware()
        : await window.electronAPI.flashFirmwareUf2!(selectedFile || 'firmware/kadowaz_deck_rp2040_v1.0.0.uf2');

      if (res.ok) {
        setFlashSuccess(
          res.value?.note ||
            `Official project firmware successfully flashed! The macropad has rebooted and is ready to use.`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl bg-[#0E1118] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FF5E00]/10 border border-[#FF5E00]/30 flex items-center justify-center text-[#FF5E00]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                RP2040 Firmware Flasher
              </h2>
              <p className="text-xs text-white/40">
                Safe USB mass-storage UF2 image validation & flasher
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Bootloader Status Card */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              status?.inBootloader
                ? 'bg-[#10B981]/10 border-[#10B981]/30 text-white'
                : 'bg-black/40 border-white/5 text-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <HardDrive
                  className={`w-5 h-5 ${
                    status?.inBootloader ? 'text-[#38EF7D]' : 'text-white/40'
                  }`}
                />
                <div>
                  <div className="text-xs font-mono font-bold uppercase tracking-wider">
                    Bootloader Detection
                  </div>
                  <div className="text-xs text-white/60">
                    {status?.inBootloader
                      ? `Mounted: ${status.drivePath} (RPI-RP2 Volume)`
                      : 'Not in BOOTSEL mode'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    status?.inBootloader
                      ? 'bg-[#10B981]/20 text-[#38EF7D] border-[#10B981]/40'
                      : 'bg-white/5 text-white/40 border-white/10'
                  }`}
                >
                  {status?.inBootloader ? 'READY TO FLASH' : 'STANDBY'}
                </span>

                <button
                  onClick={checkStatus}
                  disabled={checkingStatus}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition-colors"
                  title="Refresh Bootloader Status"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      checkingStatus ? 'animate-spin text-[#00F0FF]' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {!status?.inBootloader && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5 text-xs text-white/50">
                <div className="flex items-center gap-1.5 text-white/70 font-semibold">
                  <Info className="w-3.5 h-3.5 text-[#FF5E00]" />
                  How to enter BOOTSEL Mode:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed pl-1 text-white/60 font-mono">
                  <li>Unplug the macropad USB cable from your PC.</li>
                  <li>Press and hold the <strong className="text-white">BOOT</strong> button on the board.</li>
                  <li>Plug the USB cable back in, then release the button.</li>
                  <li>Windows mounts the drive automatically as <strong className="text-white">RPI-RP2</strong>.</li>
                </ol>
              </div>
            )}
          </div>

          {/* Official Project Firmware Card */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white/80 uppercase flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#FF5E00]" />
                Official Project Firmware (Built-in)
              </span>
              <span className="text-[10px] font-mono text-[#38EF7D] bg-[#10B981]/10 border border-[#10B981]/30 px-2 py-0.5 rounded-full font-bold">
                v1.0.0 Ready
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121620] border border-white/10 font-mono text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-bold tracking-tight">
                    kadowaz_deck_rp2040_v1.0.0.uf2
                  </div>
                  <div className="text-[10px] text-white/40">
                    Compiled directly from project source (/firmware)
                  </div>
                </div>
                <div className="text-[10px] text-[#00F0FF] bg-[#00F0FF]/10 px-2 py-0.5 rounded border border-[#00F0FF]/30 font-bold">
                  RP2040 Release
                </div>
              </div>

              {inspection && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5 text-[11px]">
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase">Chip Family</span>
                    <span className="text-[#38EF7D] font-bold">{inspection.family}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase">Firmware Size</span>
                    <span className="text-white">
                      {(inspection.firmwareBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase">UF2 Blocks</span>
                    <span className="text-white">{inspection.blockCount} blocks</span>
                  </div>
                  <div>
                    <span className="text-white/40 block text-[9px] uppercase">Target Address</span>
                    <span className="text-[#00F0FF]">{inspection.targetAddress}</span>
                  </div>
                </div>
              )}
            </div>

            {inspectError && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{inspectError}</span>
              </div>
            )}
          </div>

          {/* Progress / Status feedback */}
          {flashProgress && flashing && (
            <div className="p-4 rounded-2xl bg-[#00F0FF]/5 border border-[#00F0FF]/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#00F0FF] font-bold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {flashProgress.stage === 'copying'
                    ? 'Writing UF2 blocks to RPI-RP2 volume...'
                    : 'Board rebooting into new firmware...'}
                </span>
                <span className="text-white/70">{flashProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-[#FF5E00] to-[#00F0FF] transition-all duration-200"
                  style={{ width: `${flashProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {flashSuccess && (
            <div className="p-4 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 text-[#38EF7D] text-xs flex items-start gap-3">
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold font-mono">Flashing Completed Successfully</div>
                <div className="text-white/80 leading-relaxed">{flashSuccess}</div>
              </div>
            </div>
          )}

          {flashError && (
            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold font-mono">Firmware Flashing Failed</div>
                <div className="text-white/70 leading-relaxed">{flashError}</div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex items-center justify-between">
          <div className="text-[11px] text-white/40 font-mono">
            {inspection ? `Target: ${inspection.targetAddress} • Official v1.0.0` : 'RP2040 ROM Bootloader Flasher'}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={flashing}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-mono transition-colors cursor-pointer disabled:opacity-50"
            >
              Close
            </button>
            <button
              onClick={handleFlash}
              disabled={!status?.inBootloader || flashing}
              className={`px-5 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                status?.inBootloader && !flashing
                  ? 'bg-gradient-to-r from-[#FF5E00] to-[#FF8000] text-black shadow-lg shadow-[#FF5E00]/25 hover:brightness-110 active:scale-95'
                  : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
              }`}
            >
              <Zap className="w-4 h-4 fill-current" />
              {flashing ? 'Flashing RP2040...' : 'Flash Official Firmware'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

