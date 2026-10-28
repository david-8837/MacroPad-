import React from 'react';
import { Layer, OLEDState } from '../types';
import { OLEDDisplay } from './OLEDDisplay';
import { RotaryEncoder } from './RotaryEncoder';
import { KeyMatrix } from './KeyMatrix';
import { Sliders, Keyboard, ChevronRight, Layers, Tv, Zap, ArrowUpRight } from 'lucide-react';

interface DigitalTwinProps {
  layer: Layer;
  channelIndex?: number;
  oledState: OLEDState;
  activeProfileName: string;
  selectedKeyIndex: number | null;
  onSelectKey: (keyIndex: number) => void;
  onOpenDrawer?: (keyIndex?: number) => void;
  onOpenKnobDrawer?: () => void;
  onOpenDisplayDrawer?: () => void;
  onOpenUploadModal?: () => void;
  isDrawerKeyOpen?: boolean;
  isDrawerKnobOpen?: boolean;
  isDrawerDisplayOpen?: boolean;
  onTriggerAction: (actionId: string, actionName: string, category: string, payload?: any) => void;
  onCycleOLEDMode: () => void;
  onCycleDialMode: (explicitChannelIdx?: number) => void;
  connectionStatus: 'simulator' | 'usb_connected';
  onToggleConnection: () => void;
}

export const DigitalTwin: React.FC<DigitalTwinProps> = ({
  layer,
  channelIndex,
  oledState,
  activeProfileName,
  selectedKeyIndex,
  onSelectKey,
  onOpenDrawer,
  onOpenKnobDrawer,
  onOpenDisplayDrawer,
  onOpenUploadModal,
  isDrawerKeyOpen = false,
  isDrawerKnobOpen = false,
  isDrawerDisplayOpen = false,
  onTriggerAction,
  onCycleOLEDMode,
  onCycleDialMode,
  connectionStatus,
  onToggleConnection,
}) => {
  // Derive current active layer index (0, 1, or 2)
  const channels = [
    layer.dial.availableModes[0] || 'Layer 1: Master Volume',
    layer.dial.availableModes[1] || 'Layer 2: Timeline Scrub',
    layer.dial.availableModes[2] || 'Layer 3: Focused App Audio',
  ];
  let currentChannelIdx = channelIndex !== undefined
    ? channelIndex
    : channels.findIndex(m => m === layer.dial.activeModeName);
  if (currentChannelIdx === -1) currentChannelIdx = 0;

  return (
    <div className="flex flex-col items-center justify-center p-2">
      {/* Hardware Status Header */}
      <div className="w-full max-w-[580px] flex items-center justify-between mb-3 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-wider text-[#FF5E00]">
            KADOWAZ IND.
          </span>
          <span className="text-[10px] font-mono text-white/40">DECK-09</span>
        </div>
      </div>

      {/* Main Row: Physical Macropad Chassis (Left) + Side Space Control Dock (Right) */}
      <div className="flex items-start justify-center gap-5">
        {/* Physical Hardware Chassis */}
        <div className="relative w-[340px] rounded-3xl p-4 anodized-orange shadow-chassis select-none shrink-0">
          {/* USB-C Port indicator on top edge */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-[#171920] rounded-b-md border-x border-b border-black/60 flex items-center justify-center">
            <div className="w-5 h-0.5 bg-white/20 rounded-full" />
          </div>

          {/* Chassis Inner Dark Anodized Well */}
          <div className="bg-[#12151C] rounded-2xl p-3 border border-black/40 shadow-inner flex flex-col gap-3">
            {/* Top Section: OLED Display (Left) + Rotary Knob (Right) */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <OLEDDisplay
                  state={oledState}
                  activeLayerName={layer.name}
                  activeProfileName={activeProfileName}
                  onCycleMode={onCycleOLEDMode}
                  channelIndex={currentChannelIdx}
                />
              </div>

              <div className="w-[85px] flex justify-center">
                <RotaryEncoder
                  dial={layer.dial}
                  channelIndex={currentChannelIdx}
                  onTriggerAction={onTriggerAction}
                  onCycleMode={onCycleDialMode}
                />
              </div>
            </div>

            {/* Bottom Section: 3x3 Key Matrix */}
            <div>
              <KeyMatrix
                keys={layer.keys}
                selectedKeyIndex={selectedKeyIndex}
                onSelectKey={onSelectKey}
                onTriggerAction={onTriggerAction}
              />
            </div>
          </div>

          {/* Outer Corner Brass Chamfer Bolts */}
          <div className="absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full bg-[#E5C158] border border-[#7D5B14] flex items-center justify-center shadow-xs">
            <div className="w-1.5 h-[0.5px] bg-[#3B2904]" />
          </div>
          <div className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[#E5C158] border border-[#7D5B14] flex items-center justify-center shadow-xs">
            <div className="w-1.5 h-[0.5px] bg-[#3B2904]" />
          </div>
          <div className="absolute bottom-2.5 left-2.5 w-2.5 h-2.5 rounded-full bg-[#E5C158] border border-[#7D5B14] flex items-center justify-center shadow-xs">
            <div className="w-1.5 h-[0.5px] bg-[#3B2904]" />
          </div>
          <div className="absolute bottom-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-[#E5C158] border border-[#7D5B14] flex items-center justify-center shadow-xs">
            <div className="w-1.5 h-[0.5px] bg-[#3B2904]" />
          </div>
        </div>

        {/* SIDE SPACE CONTROL DOCK */}
        <div className="flex flex-col gap-3.5 w-[215px] select-none pt-1">
          {/* Top: Layer Switch */}
          <div className="glass-panel p-3 rounded-2xl border border-white/10 shadow-lg flex flex-col gap-2.5 bg-[#12151C]/95">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold tracking-wider text-white/50 px-1">
              <span className="flex items-center gap-1.5 text-[#FF5E00]">
                <Layers className="w-3.5 h-3.5 text-[#FF5E00]" />
                LAYER SWITCH
              </span>
              <span className="text-[9px] font-mono text-[#38EF7D] bg-[#38EF7D]/10 px-2 py-0.5 rounded-full border border-[#38EF7D]/25 font-bold">
                Layer {currentChannelIdx + 1}
              </span>
            </div>

            {/* 3 Layers Switch Buttons */}
            <div className="grid grid-cols-3 gap-1.5 bg-[#0A0C12] p-1.5 rounded-xl border border-white/5">
              {[0, 1, 2].map((ch) => {
                const isActive = currentChannelIdx === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => onCycleDialMode(ch)}
                    className={`py-2 px-1 rounded-lg text-xs font-mono font-black flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-b from-[#FF7A1A] to-[#FF5E00] text-black shadow-[0_0_14px_rgba(255,94,0,0.6)] scale-[1.03]'
                        : 'text-white/50 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="tracking-wider">Layer {ch + 1}</span>
                    <span className="text-[7.5px] font-medium opacity-85 uppercase truncate max-w-full">
                      {ch === 0 ? 'Vol' : ch === 1 ? 'Scrub' : 'Audio'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] font-mono text-white/40 truncate px-1 text-center">
              {layer.dial.availableModes[currentChannelIdx] || `Layer ${currentChannelIdx + 1}`}
            </div>

            <div className="text-[8.5px] font-mono text-[#00F0FF]/60 bg-[#00F0FF]/5 rounded px-1.5 py-0.5 text-center border border-[#00F0FF]/15">
              Hold knob {layer.dial.channelHoldThresholdMs || 800}ms to switch • Tap: {layer.dial.pressAction.name}
            </div>
          </div>

          {/* EDIT KEYS BUTTON */}
          <button
            type="button"
            onClick={() => onOpenDrawer?.(selectedKeyIndex ?? 0)}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl font-mono text-left transition-all border cursor-pointer active:scale-95 ${
              isDrawerKeyOpen
                ? 'bg-gradient-to-r from-[#FF5E00] to-[#FF7A1A] text-black border-[#FF5E00] shadow-[0_0_22px_rgba(255,94,0,0.45)]'
                : 'bg-[#12151C] text-white hover:text-white border-white/10 hover:border-[#FF5E00]/60 hover:bg-[#181C26] shadow-md'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                  isDrawerKeyOpen
                    ? 'bg-black text-[#FF5E00]'
                    : 'bg-[#FF5E00]/10 text-[#FF5E00] border border-[#FF5E00]/30 group-hover:scale-105'
                }`}
              >
                <Keyboard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider">EDIT KEYS</div>
                <div
                  className={`text-[10px] font-mono ${
                    isDrawerKeyOpen ? 'text-black/80 font-bold' : 'text-white/40'
                  }`}
                >
                  {selectedKeyIndex !== null ? `Switch #${selectedKeyIndex + 1}` : 'Configure Switches'}
                </div>
              </div>
            </div>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${
                isDrawerKeyOpen ? 'translate-x-1 text-black' : 'text-white/30 group-hover:text-white group-hover:translate-x-0.5'
              }`}
            />
          </button>

          {/* EDIT KNOB BUTTON */}
          <button
            type="button"
            onClick={onOpenKnobDrawer}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl font-mono text-left transition-all border cursor-pointer active:scale-95 ${
              isDrawerKnobOpen
                ? 'bg-gradient-to-r from-[#00F0FF] to-[#00A3FF] text-black border-[#00F0FF] shadow-[0_0_22px_rgba(0,240,255,0.45)]'
                : 'bg-[#12151C] text-white hover:text-white border-white/10 hover:border-[#00F0FF]/60 hover:bg-[#181C26] shadow-md'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                  isDrawerKnobOpen
                    ? 'bg-black text-[#00F0FF]'
                    : 'bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 group-hover:scale-105'
                }`}
              >
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider">EDIT KNOB</div>
                <div
                  className={`text-[10px] font-mono ${
                    isDrawerKnobOpen ? 'text-black/80 font-bold' : 'text-white/40'
                  }`}
                >
                  {`Layer ${currentChannelIdx + 1} Actions & Dial`}
                </div>
              </div>
            </div>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${
                isDrawerKnobOpen ? 'translate-x-1 text-black' : 'text-white/30 group-hover:text-white group-hover:translate-x-0.5'
              }`}
            />
          </button>

          {/* EDIT DISPLAY BUTTON */}
          <button
            type="button"
            onClick={onOpenDisplayDrawer}
            className={`group relative flex items-center justify-between p-3.5 rounded-2xl font-mono text-left transition-all border cursor-pointer active:scale-95 ${
              isDrawerDisplayOpen
                ? 'bg-gradient-to-r from-[#BD00FF] to-[#9D00FF] text-white border-[#BD00FF] shadow-[0_0_22px_rgba(189,0,255,0.45)]'
                : 'bg-[#12151C] text-white hover:text-white border-white/10 hover:border-[#BD00FF]/60 hover:bg-[#181C26] shadow-md'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                  isDrawerDisplayOpen
                    ? 'bg-black text-[#BD00FF]'
                    : 'bg-[#BD00FF]/10 text-[#BD00FF] border border-[#BD00FF]/30 group-hover:scale-105'
                }`}
              >
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider">EDIT DISPLAY</div>
                <div
                  className={`text-[10px] font-mono ${
                    isDrawerDisplayOpen ? 'text-white/80 font-bold' : 'text-white/40'
                  }`}
                >
                  {`OLED Mode: ${oledState.mode.toUpperCase()}`}
                </div>
              </div>
            </div>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${
                isDrawerDisplayOpen ? 'translate-x-1 text-white' : 'text-white/30 group-hover:text-white group-hover:translate-x-0.5'
              }`}
            />
          </button>

          {/* UPLOAD / FLASH TO MACROPAD BUTTON */}
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="group relative flex items-center justify-between p-3.5 rounded-2xl font-mono text-left transition-all border cursor-pointer active:scale-95 bg-gradient-to-r from-[#FF5E00] via-[#FF7A1A] to-[#FFA033] hover:from-[#FF701A] hover:to-[#FFB04D] text-black border-[#FF5E00] shadow-[0_0_25px_rgba(255,94,0,0.45)] hover:shadow-[0_0_35px_rgba(255,94,0,0.65)] mt-1"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-black text-[#FF5E00] flex items-center justify-center font-bold text-sm shadow-md group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="text-xs font-black tracking-wider text-black flex items-center gap-1.5">
                  UPLOAD TO MACROPAD
                </div>
                <div className="text-[10px] font-mono text-black/80 font-bold">
                  Flash 9 Keys & Dial to Hardware
                </div>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Quick Helper Subtext */}
      <div className="mt-3 text-center text-[10.5px] font-mono text-white/40 max-w-[580px]">
        <span>Tap any switch on the macropad to actuate or edit • Use side buttons to configure keys, knob, and OLED</span>
      </div>
    </div>
  );
};
