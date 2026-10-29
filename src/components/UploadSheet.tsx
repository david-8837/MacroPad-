import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Deck } from '../types';
import {
  ConnectedDeviceInfo,
  HardwareConnectionState,
  type UploadProgress,
  type UploadResult,
  type UploadOptions,
} from '../utils/hardwareBridge';
import { deckToConfig, hasOledNextAction } from '../utils/deckToConfig';
import { loadStoredMacros } from '../utils/executeDeckAction';
import { isMacroReady, requiredPcMacroIds } from '../utils/macroStorage';
import { defaultConfig } from '../../host/protocol/mpad3-protocol.mjs';
import {
  X,
  Zap,
  CheckCircle2,
  Cpu,
  Layers,
  Sliders,
  Keyboard,
  Info,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface UploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  deck: Deck;
  hardwareState: HardwareConnectionState;
  deviceInfo: ConnectedDeviceInfo | null;
  onConnectSerial: () => void;
  /** Runs the real upload and reports the pad's answer. */
  onSyncEEPROM: (onProgress?: (p: UploadProgress) => void, options?: UploadOptions) => Promise<UploadResult>;
}

export const UploadSheet: React.FC<UploadSheetProps> = ({
  isOpen,
  onClose,
  deck,
  hardwareState,
  deviceInfo,
  onConnectSerial,
  onSyncEEPROM,
}) => {
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [phase, setPhase] = useState<UploadProgress['phase'] | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [enablePcEvents, setEnablePcEvents] = useState(false);
  const [rendered, setRendered] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  // Mount below the viewport, then slide up; on close slide down before unmounting.
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let timer = 0;
    if (isOpen) {
      setRendered(true);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timer = window.setTimeout(() => setRendered(false), reducedMotion ? 0 : 320);
    }
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    // The sheet is mounted in a second render; focus only after its close button exists.
    if (!isOpen || !rendered) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen, rendered]);

  useEffect(() => {
    if (!isOpen || !rendered) return;
    // Clicking read-only content (including the knob illustration) can leave
    // focus on <body>. Escape and Tab must still work like a modal sheet.
    const handleDetachedFocus = (event: KeyboardEvent) => {
      if (sheetRef.current?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!isFlashing) onClose();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        (isFlashing ? sheetRef.current : closeButtonRef.current)?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', handleDetachedFocus, true);
    return () => document.removeEventListener('keydown', handleDetachedFocus, true);
  }, [isOpen, rendered, isFlashing, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedLayerIdx(0);
    setResult(null);
    setProgress(null);
    setEnablePcEvents(false);
  }, [isOpen]);

  /* The action mapping depends on the deck, not the pad's global settings.
   * Preview PC-owned vs unavailable bindings BEFORE upload, then re-evaluate
   * with the real pad config under the exclusive update transaction. */
  const preview = useMemo(() => deckToConfig(deck, defaultConfig()), [deck]);
  const requiresOled = hasOledNextAction(preview.config);
  const oledUnavailable = requiresOled && hardwareState === 'connected' && deviceInfo?.protocolReady && !deviceInfo.hasOled;
  const pcOnly = preview.unsupported.filter(u => u.route === 'desktop');
  const unavailable = preview.unsupported.filter(u => u.route === 'unavailable');
  const savedMacros = loadStoredMacros();
  const missingMacros = requiredPcMacroIds(deck).filter(id => !savedMacros.some(m => m.id === id && isMacroReady(m)));
  const nativeAvailable = typeof window !== 'undefined' && !!window.electronAPI?.execAction;
  const emptyCount = deck.layers.reduce((n, layer) => n + layer.keys.filter(k => !k.tapAction).length, 0);

  if (!rendered) return null;
  const canUpload = hardwareState === 'connected' && deviceInfo?.protocolReady === true && deviceInfo.hasFlash === true;
  const currentLayer = deck.layers[selectedLayerIdx] || deck.layers[0];
  // Show the selected layer's actual knob slots, including PC-only/unavailable
  // bindings. A rejected custom hold falls back to the pad's next-layer action.
  const knobBindings = ([
    { slot: 'CW', where: 'Knob CW', action: currentLayer.dial?.cwAction, fallback: 'Unassigned' },
    { slot: 'CCW', where: 'Knob CCW', action: currentLayer.dial?.ccwAction, fallback: 'Unassigned' },
    { slot: 'PRESS', where: 'Knob press', action: currentLayer.dial?.pressAction, fallback: 'Unassigned' },
    { slot: 'HOLD', where: 'Knob hold', action: currentLayer.dial?.holdAction, fallback: 'Next layer (pad default)' },
  ] as const).map(({ slot, where, action, fallback }) => {
    const issue = preview.unsupported.find((binding) => binding.layer === selectedLayerIdx && binding.where === where);
    return {
      slot,
      where,
      issue,
      name: slot === 'HOLD' && issue ? 'Next layer (pad fallback)' : action?.name ?? fallback,
    };
  });

  /*
   * The real upload.
   *
   * No invented progress or success: the final chunk must be acknowledged,
   * the pad must acknowledge the flash commit, and a fresh readback must match
   * the sent configuration before this sheet reports success.
   */
  const handleStartFlash = async () => {
    if (oledUnavailable || isFlashing) return;
    setIsFlashing(true);
    setResult(null);
    setProgress(null);
    setPhase('reading');

    try {
      const outcome = await onSyncEEPROM((p) => {
        setPhase(p.phase);
        setProgress(p);
      }, { enablePcEvents });
      setResult(outcome);
    } catch (error: unknown) {
      setResult({
        ok: false,
        message: `Upload stopped without verified readback: ${error instanceof Error ? error.message : String(error)}`,
        mapped: 0,
        unsupported: [],
      });
    } finally {
      setPhase(null);
      setIsFlashing(false);
    }
  };

  const closeSheet = () => {
    // Do not hide an in-flight write or its mandatory readback verification.
    if (!isFlashing) onClose();
  };

  const handleSheetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!isFlashing) {
        event.preventDefault();
        onClose();
      }
    } else if (event.key === 'Tab') {
      // Keep keyboard focus inside the bottom sheet while the backdrop is up.
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-sheet-heading"
      onKeyDown={handleSheetKeyDown}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <div
        aria-hidden="true"
        onClick={closeSheet}
        className={`absolute inset-0 bg-[#141414]/35 transition-opacity duration-300 motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <section
        id="upload-sheet"
        ref={sheetRef}
        tabIndex={-1}
        data-state={visible ? 'open' : 'closed'}
        className={`relative z-10 w-full h-[min(82vh,760px)] max-h-[calc(100dvh-16px)] border-t-2 border-[#1351AA] bg-[#FFFFFF] shadow-[0_-18px_60px_rgba(0,0,0,0.20)] overflow-hidden flex flex-col transform-gpu transition-transform duration-300 ease-out motion-reduce:transition-none ${visible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="w-full max-w-5xl mx-auto min-h-0 h-full flex flex-col">
          <div className="h-3 shrink-0 flex items-center justify-center" aria-hidden="true">
            <span className="w-12 h-1 bg-[#C7C7C7]" />
          </div>
        {/* Bottom-sheet header */}
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-[#E3E2DE] bg-[#FFFFFF] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#EDECE8] border border-[#C7C7C7] flex items-center justify-center text-[#1351AA]">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 id="upload-sheet-heading" className="text-base font-bold tracking-wide text-[#141414] flex flex-wrap items-center gap-2">
                UPLOAD TO DECK
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#EDECE8] text-[#1351AA] border border-[#C7C7C7]">
                  FLASH MEMORY
                </span>
              </h2>
              <p className="text-xs font-mono text-[#646464]">
                Write supported bindings into RP2040 flash, then read them back
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeSheet}
            disabled={isFlashing}
            aria-label="Close upload sheet"
            className="p-1.5 text-[#646464] hover:text-[#141414] hover:bg-[#EDECE8] disabled:opacity-40 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable review; the header and write action stay visible. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-5">
          
          {/* Deck info & statistics */}
          <div className="bg-[#FFFFFF] border border-[#E3E2DE] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono text-[#1351AA] uppercase tracking-wider font-semibold">
                YOUR MACROPAD
              </div>
              <div className="text-lg font-black text-[#141414]">Macropad configuration</div>
              <div className="text-xs text-[#646464] font-mono mt-0.5">
                {deck.layers.length} layers · 9 keys · 1 knob
              </div>
              <p className="text-xs text-[#646464] mt-1">Upload replaces key and knob assignments on all four pad layers with this PC’s saved configuration. Connecting does not load existing pad bindings into the editor.</p>
            </div>

            {/* The real mapping, not a category heuristic that counts macros as hotkeys. */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              {([
                ['ON PAD', preview.mapped], ['PC APP', pcOnly.length],
                ['NO ROUTE', unavailable.length], ['EMPTY KEYS', emptyCount],
              ] as const).map(([label, count]) => (
                <div key={label} className="bg-[#EDECE8] border border-[#E3E2DE] px-2.5 py-1.5 text-center">
                  <div className="text-[9px] font-mono text-[#646464]">{label}</div>
                  <div className="text-sm font-bold text-[#141414]">{count}</div>
                </div>
              ))}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                </button>
              ))}
            </div>

            {/* Both physical controls appear together; the knob is a read-only
                preview, never the interactive simulator or an upload trigger. */}
            <div className="bg-[#FFFFFF] border border-[#E3E2DE] p-3.5 space-y-2">
              <div className="text-[11px] font-mono text-[#444343] flex flex-wrap items-center justify-between gap-1">
                <span>9 Physical Switches + Rotary Knob on Layer {selectedLayerIdx}:</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_230px] gap-2 items-stretch">
                <div data-testid="upload-key-preview" className="grid grid-cols-3 gap-2 min-w-0">
                  {currentLayer.keys.map((k) => (
                    <div
                      key={k.keyIndex}
                      className="bg-[#EDECE8] border border-[#E3E2DE] p-2 flex flex-col justify-between h-14 min-w-0"
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <span className="text-[#1351AA] font-bold">#{k.keyIndex + 1}</span>
                        <span className="text-[#646464] uppercase text-[8px] truncate max-w-[65px]">
                          {k.tapAction?.category || 'EMPTY'}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-[#141414] truncate">
                        {k.label || 'Empty'}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  role="group"
                  aria-label={`Rotary knob review for Layer ${selectedLayerIdx}`}
                  data-testid="upload-knob-preview"
                  className="min-w-0 bg-[#F4F3F0] border border-[#C7C7C7] px-2.5 py-2 flex flex-col gap-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold tracking-wide text-[#1351AA]">ROTARY KNOB</span>
                    <span className="font-mono text-[9px] text-[#646464]">L{selectedLayerIdx}</span>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      role="img"
                      aria-label={`Static rotary knob for Layer ${selectedLayerIdx}`}
                      className="relative w-[70px] h-[70px] shrink-0 rounded-full border-2 border-[#C7C7C7] bg-[#FFFFFF] flex items-center justify-center"
                    >
                      <div className="relative w-[58px] h-[58px] knob-metal flex items-center justify-center">
                        <span aria-hidden="true" className="absolute top-1 left-1/2 -translate-x-1/2 w-[3px] h-2.5 bg-[#E3E2DE]" />
                        <span aria-hidden="true" className="w-7 h-7 bg-[#E3E2DE] text-[#141414] font-mono text-[9px] font-bold flex items-center justify-center">
                          L{selectedLayerIdx}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5 font-mono text-[9px]">
                      {knobBindings.map(({ slot, where, name, issue }) => (
                        <div
                          key={where}
                          title={issue ? `${issue.name}: ${issue.reason}` : name}
                          className="flex items-center gap-1 min-w-0 leading-4"
                        >
                          <span className="w-[30px] shrink-0 font-bold text-[#1351AA]">{slot}</span>
                          <span className="min-w-0 flex-1 truncate text-[#141414]">{name}</span>
                          {issue && (
                            <span className="shrink-0 text-[8px] font-bold text-[#646464]">
                              {slot === 'HOLD' ? 'DEFAULT' : issue.route === 'desktop' ? 'PC' : '—'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="border-t border-[#C7C7C7] pt-1 font-mono text-[9px] text-[#646464]">
                    Review only · no actions run here
                  </p>
                </div>
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
                    ? `${canUpload ? 'MPAD3 READY' : 'SERIAL PORT OPEN'}: ${deviceInfo?.name || 'Macropad Microcontroller'}`
                    : 'MACROPAD NOT CONNECTED YET'}
                </div>
                <div className="text-[11px] text-[#646464] font-mono">
                  {hardwareState !== 'connected'
                    ? 'Connect the USB serial / COM port to write configuration. HID keystrokes go to the OS automatically.'
                    : !deviceInfo?.protocolReady
                      ? 'The port is open, but no compatible MPAD3 probe has succeeded. Upload is unavailable.'
                      : !deviceInfo.hasFlash
                        ? 'This MPAD3 device reports no flash capability; upload is unavailable.'
                        : !deviceInfo.hasEvents
                          ? 'Flash is available, but firmware has no KEY_EVENT capability: PC-only bindings cannot run.'
                          : 'MPAD3 flash is ready. Saves require acknowledgement and complete readback verification.'}
                </div>
              </div>
            </div>

            {/* Quick Connect Actions if disconnected */}
            {hardwareState !== 'connected' && (
              <div className="flex items-center gap-2 shrink-0">
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

          {oledUnavailable && <p role="status" className="p-3.5 border border-[#1351AA] bg-[#EDECE8] font-mono text-[11px] text-[#141414]">
            OLED NEXT needs a detected SSD1306 panel. This pad reports no OLED; check its wiring before uploading this binding.
          </p>}
          {pcOnly.length > 0 && (
            <div className="p-3.5 bg-[#EDECE8] border border-[#C7C7C7] space-y-2 font-mono text-[10.5px] text-[#444343]">
              <strong className="text-[#141414]">{pcOnly.length} PC-owned binding{pcOnly.length === 1 ? '' : 's'}:</strong>{' '}
              M0–M15 and other desktop actions do not run in firmware. Keep the desktop app connected,
              save the macro steps in Macro Studio, and allow the pad to report USB key events.
              {!deviceInfo?.hasEvents && hardwareState === 'connected' && (
                <p className="font-bold text-[#1351AA]">This firmware cannot report key events. This deck cannot be uploaded with PC-owned actions.</p>
              )}
              {!nativeAvailable && (
                <p className="font-bold text-[#1351AA]">Browser preview has no native executor. Open this deck in the Electron desktop app before uploading PC-owned actions.</p>
              )}
              {missingMacros.length > 0 && (
                <p className="font-bold text-[#1351AA]">M{missingMacros.join(', M')} has no executable saved steps. Define it in Macro Studio before uploading.</p>
              )}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enablePcEvents}
                  onChange={e => setEnablePcEvents(e.target.checked)}
                  disabled={!canUpload || !deviceInfo?.hasEvents || isFlashing}
                  className="mt-0.5 accent-[#1351AA]"
                />
                <span>If the pad's current USB key-event setting is off, enable it as part of this verified upload. Otherwise, refuse the upload instead of silently leaving PC actions inert.</span>
              </label>
            </div>
          )}
          {unavailable.length > 0 && (
            <div className="p-3.5 bg-[#FFFFFF] border border-[#C7C7C7] space-y-1 font-mono text-[10.5px] text-[#444343]">
              <strong className="text-[#1351AA]">{unavailable.length} binding{unavailable.length === 1 ? '' : 's'} cannot run on the pad OR PC:</strong>
              <p>{unavailable.slice(0, 3).map(u => `Layer ${u.layer} ${u.where}: ${u.name}`).join(' · ')}{unavailable.length > 3 ? ` · +${unavailable.length - 3} more` : ''}. Reassign or remove these legacy/unsupported actions.</p>
            </div>
          )}

          {/* Progress comes from the serial transaction, including readback. */}
          {isFlashing && (
            <div className="p-4 bg-[#FFFFFF] border border-[#C7C7C7] space-y-2 font-mono text-[11px]">
              <div className="flex items-center gap-2 text-[#141414]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1351AA]" />
                <span>
                  {phase === 'reading' && 'Reading the pad\u2019s current configuration\u2026'}
                  {phase === 'sending' &&
                    `Sending configuration\u2026 ${progress?.sent ?? 0}/${progress?.total ?? 0} chunks`}
                  {phase === 'committing' && 'Committing to flash\u2026'}
                  {phase === 'verifying' && 'Reading back and verifying the saved configuration\u2026'}
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
                THE PAD ACKNOWLEDGED AND VERIFIED THE CONFIGURATION
              </div>
              <p className="text-xs font-mono text-[#444343] pl-7">{result.message}</p>
              {result.unsupported.length > 0 && (
                <div className="pl-7 space-y-1">
                  <div className="text-[10.5px] font-mono font-bold text-[#444343] uppercase">
                    {result.unsupported.filter(u => u.route === 'desktop').length} need the desktop app ·{' '}
                    {result.unsupported.filter(u => u.route === 'unavailable').length} cannot run anywhere
                  </div>
                  <ul className="text-[10.5px] font-mono text-[#646464] space-y-0.5 max-h-24 overflow-y-auto">
                    {result.unsupported.map((u, i) => (
                      <li key={`${u.layer}-${u.where}-${i}`}>
                        [{u.route === 'desktop' ? 'PC APP' : 'NO ROUTE'}] Layer {u.layer} · {u.where} · {u.name} — {u.reason}
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
                UPLOAD NOT VERIFIED
              </div>
              <p className="text-xs font-mono text-[#444343] pl-7">{result.message}</p>
              <p className="text-[10px] font-mono text-[#646464] pl-7">If a commit was attempted, the pad may have changed. Read and verify it before relying on its bindings.</p>
            </div>
          )}

          {/* How It Works Explainer Callout */}
          <div className="bg-[#EDECE8] border border-[#E3E2DE] p-3.5 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#1351AA] shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-[#444343] leading-relaxed">
              <strong className="text-[#141414]">Ownership:</strong> On-pad keys/media/layers go into RP2040 flash. PC-owned macros and apps leave that pad slot empty, need this desktop app and a verified USB key-event stream; undefined macros cannot run. Legacy codes marked NO ROUTE work on neither side. Review the result after readback.
            </div>
          </div>

        </div>

        {/* Fixed sheet footer: the upload is deliberate, never automatic. */}
        <div className="px-5 sm:px-6 py-3 border-t border-[#E3E2DE] bg-[#FFFFFF] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={closeSheet}
            disabled={isFlashing}
            className="px-4 py-2 text-xs font-mono text-[#444343] hover:text-[#141414] hover:bg-[#F4F3F0] disabled:opacity-40 transition-colors"
          >
            {result ? 'Close' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={() => { void handleStartFlash(); }}
            disabled={!canUpload || Boolean(oledUnavailable) || (pcOnly.length > 0 && (!deviceInfo?.hasEvents || !nativeAvailable || missingMacros.length > 0)) || isFlashing || Boolean(result?.ok)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-[#1351AA] text-[#FFFFFF] border border-[#1351AA] font-black font-mono text-[11px] tracking-wide hover:bg-[#0E4290] active:scale-[0.99] transition-colors disabled:bg-[#EDECE8] disabled:text-[#646464] disabled:border-[#C7C7C7] disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>{isFlashing ? 'WRITING TO HARDWARE...' : 'FLASH / UPLOAD ALL TO MACROPAD NOW'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        </div>
      </section>
    </div>
  );
};
