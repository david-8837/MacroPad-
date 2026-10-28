import React, { useState } from 'react';
import { Deck } from '../types';
import {
  ConnectedDeviceInfo,
  HardwareConnectionState,
  type UploadProgress,
  type UploadResult,
} from '../utils/hardwareBridge';
import {
  X,
  Zap,
  CheckCircle2,
  Usb,
  Cpu,
  Layers,
  Sliders,
  Keyboard,
  Info,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  hardwareState: HardwareConnectionState;
  deviceInfo: ConnectedDeviceInfo | null;
  onConnectHID: () => void;
  onConnectSerial: () => void;
  /** Runs the real upload and reports the pad's answer. */
  onSyncEEPROM: (onProgress?: (p: UploadProgress) => void) => Promise<UploadResult>;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  deck,
  hardwareState,
  deviceInfo,
  onConnectHID,
  onConnectSerial,
  onSyncEEPROM,
}) => {
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [phase, setPhase] = useState<UploadProgress['phase'] | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  if (!isOpen) return null;

  const currentLayer = deck.layers[selectedLayerIdx] || deck.layers[0];

  // Statistics across all four layers
  let totalKeys = 0;
  let hotkeysCount = 0;
  let appCount = 0;
  let mediaCount = 0;
  let emptyCount = 0;
  let safetyCount = 0;

  deck.layers.forEach(layer => {
    totalKeys += layer.keys.length;
    layer.keys.forEach(k => {
      /* An empty slot used to fall into the hotkey branch, so a fresh deck
       * reported "36 HOTKEYS" while holding 18 bindings and 18 empty slots. */
      const cat = k.tapAction?.category;
      if (k.isDestructiveSafety) safetyCount++;
      else if (!cat) emptyCount++;
      else if (cat === 'app_launch') appCount++;
      else if (cat === 'media') mediaCount++;
      else hotkeysCount++;
    });
  });

  /*
   * The real upload.
   *
   * What used to happen here: four setTimeout'd steps with invented text
   * ("Encoding 1,708-byte configuration blob", "Flash verification complete!
   * CRC32 verified"), then isSuccess = true — unconditionally, even when the sync
   * handler had thrown. The progress bar was a decoration and the success panel
   * was a lie. Now every line on screen comes from the pad: chunks it accepted,
   * and the COMMIT it acknowledged.
   */
  const handleStartFlash = async () => {
    setIsFlashing(true);
    setResult(null);
    setProgress(null);
    setPhase('reading');

    const outcome = await onSyncEEPROM((p) => {
      setPhase(p.phase);
      setProgress(p);
    });

    setPhase(null);
    setIsFlashing(false);
    setResult(outcome);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#EDECE8] animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FFFFFF] border border-[#C7C7C7] -[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E3E2DE] bg-[#FFFFFF]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EDECE8] border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide text-[#141414] flex items-center gap-2">
                UPLOAD TO PHYSICAL MACROPAD
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7]">
                  FLASH MEMORY
                </span>
              </h2>
              <p className="text-xs font-mono text-[#646464]">
                Write the deck configuration directly into physical EEPROM / onboard flash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#646464] hover:text-[#141414] hover:bg-[#EDECE8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          
          {/* Deck info & statistics */}
          <div className="bg-[#FFFFFF] border border-[#E3E2DE] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono text-[#1351AA] uppercase tracking-wider font-semibold">
                TARGET DECK
              </div>
              <div className="text-lg font-black text-[#141414]">{deck.name}</div>
              <div className="text-xs text-[#646464] font-mono mt-0.5">
                {deck.layers.length} Independent Layers • 9 Switches • 1 Continuous Rotary Encoder
              </div>
            </div>

            {/* Stats Pills */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="bg-[#EDECE8] border border-[#E3E2DE] px-2.5 py-1.5 text-center">
                <div className="text-[9px] font-mono text-[#646464]">HOTKEYS</div>
                <div className="text-sm font-bold text-[#141414]">{hotkeysCount}</div>
              </div>
              <div className="bg-[#EDECE8] border border-[#E3E2DE] px-2.5 py-1.5 text-center">
                <div className="text-[9px] font-mono text-[#646464]">EMPTY</div>
                <div className="text-sm font-bold text-[#646464]">{emptyCount}</div>
              </div>
              {safetyCount > 0 && (
                <div className="bg-[#EDECE8] border border-[#C7C7C7] px-2.5 py-1.5 text-center">
                  <div className="text-[9px] font-mono text-[#646464]">HOLD-CONFIRM</div>
                  <div className="text-sm font-bold text-[#1351AA]">{safetyCount}</div>
                </div>
              )}
              <div className="bg-[#EDECE8] border border-[#E3E2DE] px-2.5 py-1.5 text-center">
                <div className="text-[9px] font-mono text-[#646464]">APP LAUNCH</div>
                <div className="text-sm font-bold text-[#1351AA]">{appCount}</div>
              </div>
              <div className="bg-[#EDECE8] border border-[#E3E2DE] px-2.5 py-1.5 text-center">
                <div className="text-[9px] font-mono text-[#646464]">MEDIA</div>
                <div className="text-sm font-bold text-[#1351AA]">{mediaCount}</div>
              </div>
            </div>
          </div>

          {/* Layer Selector & Preview */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-[#444343] flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#1351AA]" />
                <span>REVIEW LAYERS TO BE FLASHED:</span>
              </div>
              <div className="text-[11px] font-mono text-[#646464]">
                Click a layer to inspect keys
              </div>
            </div>

            {/* Layer Tabs */}
            <div className="grid grid-cols-3 gap-2">
              {deck.layers.map((layer, idx) => (
                <button
                  key={layer.id}
                  onClick={() => setSelectedLayerIdx(idx)}
                  className={`p-3 border text-left font-mono transition-all ${
 selectedLayerIdx === idx
 ? 'bg-[#EDECE8] border-[#1351AA] text-[#141414]'
 : 'bg-[#FFFFFF] border-[#E3E2DE] text-[#444343] hover:text-[#141414] hover:border-[#C7C7C7]'
 }`}
                >
                  <div className="text-[10px] text-[#1351AA] font-bold">LAYER {idx}</div>
                  <div className="text-xs font-bold truncate text-[#141414]">{layer.name}</div>
                  <div className="text-[10px] text-[#646464] mt-1">
                    Dial: {layer.dial?.activeModeName || 'Volume'}
                  </div>
                </button>
              ))}
            </div>

            {/* Selected Layer Key Grid Preview */}
            <div className="bg-[#FFFFFF] border border-[#E3E2DE] p-3.5 space-y-2">
              <div className="text-[11px] font-mono text-[#444343] flex items-center justify-between">
                <span>9 Physical Switches on {currentLayer.name}:</span>
                <span className="text-[#1351AA] text-[10px]">Dial CW / CCW: {currentLayer.dial?.activeModeName}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {currentLayer.keys.map((k) => (
                  <div
                    key={k.keyIndex}
                    className="bg-[#EDECE8] border border-[#E3E2DE] p-2 flex flex-col justify-between h-14"
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-[#1351AA] font-bold">#{k.keyIndex + 1}</span>
                      <span className="text-[#646464] uppercase text-[8px] truncate max-w-[65px]">
                        {k.tapAction?.category || 'HOTKEY'}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-[#141414] truncate">
                      {k.label || 'Empty'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Connection Status Box */}
          <div className={`p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
 hardwareState === 'connected'
 ? 'bg-[#EDECE8] border-[#C7C7C7] text-[#1351AA]'
 : 'bg-[#EDECE8]/10 border-[#C7C7C7]/30 text-[#1351AA]'
 }`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 ${
 hardwareState === 'connected' ? 'bg-[#1351AA] animate-ping' : 'bg-[#EDECE8]'
 }`} />
              <div>
                <div className="text-xs font-bold font-mono">
                  {hardwareState === 'connected'
                    ? `CONNECTED: ${deviceInfo?.name || 'Macropad Microcontroller'}`
                    : 'MACROPAD NOT CONNECTED YET'}
                </div>
                <div className="text-[11px] text-[#646464] font-mono">
                  {hardwareState !== 'connected'
                    ? 'Connect your device via USB to write the configuration to hardware.'
                    : deviceInfo?.type === 'webhid'
                      ? 'HID interface connected: it carries key events only. Configuration is written over the COM port.'
                      : 'USB serial bridge ready. The configuration is written to the pad\u2019s flash and read back to verify.'}
                </div>
              </div>
            </div>

            {/* Quick Connect Actions if disconnected */}
            {hardwareState !== 'connected' && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={onConnectHID}
                  className="px-3 py-1.5 bg-[#EDECE8] hover:bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7] text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Usb className="w-3.5 h-3.5" />
                  Connect HID
                </button>
                <button
                  onClick={onConnectSerial}
                  className="px-3 py-1.5 bg-[#EDECE8] hover:bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7] text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Connect COM
                </button>
              </div>
            )}
          </div>

          {/* Progress — three real phases, no invented ones */}
          {isFlashing && (
            <div className="p-4 bg-[#FFFFFF] border border-[#C7C7C7] space-y-2 font-mono text-[11px]">
              <div className="flex items-center gap-2 text-[#141414]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1351AA]" />
                <span>
                  {phase === 'reading' && 'Reading the pad\u2019s current configuration\u2026'}
                  {phase === 'sending' &&
                    `Sending configuration\u2026 ${progress?.sent ?? 0}/${progress?.total ?? 0} chunks`}
                  {phase === 'committing' && 'Committing to flash\u2026'}
                  {phase === null && 'Starting\u2026'}
                </span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: progress?.total || 9 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2 flex-1 ${
                      phase !== 'sending' || i < (progress?.sent ?? 0) ? 'bg-[#1351AA]' : 'bg-[#EDECE8]'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {result && result.ok && (
            <div className="p-4 bg-[#EDECE8] border border-[#1351AA] text-[#141414] space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1351AA]">
                <CheckCircle2 className="w-5 h-5" />
                THE PAD ACKNOWLEDGED THE COMMIT
              </div>
              <p className="text-xs font-mono text-[#444343] pl-7">{result.message}</p>
              {result.unsupported.length > 0 && (
                <div className="pl-7 space-y-1">
                  <div className="text-[10.5px] font-mono font-bold text-[#444343] uppercase">
                    {result.unsupported.length} binding
                    {result.unsupported.length === 1 ? '' : 's'} stay on this PC
                  </div>
                  <ul className="text-[10.5px] font-mono text-[#646464] space-y-0.5 max-h-24 overflow-y-auto">
                    {result.unsupported.map((u, i) => (
                      <li key={`${u.layer}-${u.where}-${i}`}>
                        Layer {u.layer} · {u.where} · {u.name} — {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result && !result.ok && (
            <div className="p-4 bg-[#FFFFFF] border border-[#C7C7C7] text-[#141414] space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1351AA]">
                <Info className="w-5 h-5" />
                NOTHING WAS WRITTEN
              </div>
              <p className="text-xs font-mono text-[#444343] pl-7">{result.message}</p>
            </div>
          )}

          {/* How It Works Explainer Callout */}
          <div className="bg-[#EDECE8] border border-[#E3E2DE] p-3.5 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#1351AA] shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-[#444343] leading-relaxed">
              <strong className="text-[#141414]">Live Companion vs Onboard Memory:</strong> While this software is open on your PC, every shortcut and app launcher works in real-time. Uploading to the macropad writes the configuration into the physical device's onboard EEPROM so it stays active anywhere.
            </div>
          </div>

        </div>

        {/* Modal Footer / Flash CTA Button */}
        <div className="px-6 py-4 border-t border-[#E3E2DE] bg-[#FFFFFF] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-[#444343] hover:text-[#141414] hover:bg-[#F4F3F0] transition-colors"
          >
            {result ? 'Close' : 'Cancel'}
          </button>

          <button
            onClick={handleStartFlash}
            disabled={isFlashing || Boolean(result?.ok)}
            className="flex items-center gap-2 px-6 py-3  hover:hover:text-[#E3E2DE] font-black font-mono text-xs tracking-wider active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isFlashing ? 'WRITING TO HARDWARE...' : 'FLASH / UPLOAD ALL TO MACROPAD NOW'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
