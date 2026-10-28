import React from 'react';
import { Layer, OLEDState } from '../types';
import { OLEDDisplay } from './OLEDDisplay';
import { RotaryEncoder } from './RotaryEncoder';
import { Sliders, Tv } from 'lucide-react';

interface DigitalTwinProps {
  layer: Layer;
  channelIndex?: number;
  oledState: OLEDState;
  selectedKeyIndex: number | null;
  onSelectKey: (keyIndex: number) => void;
  onOpenDrawer?: (keyIndex?: number) => void;
  onOpenKnobDrawer?: () => void;
  onOpenDisplayDrawer?: () => void;
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
  selectedKeyIndex,
  onSelectKey,
  onOpenDrawer,
  onOpenKnobDrawer,
  onOpenDisplayDrawer,
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
      <div className="w-full max-w-[340px] flex items-center justify-between mb-2.5 px-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-wider text-[#FF5E00]">
            KADOWAZ IND.
          </span>
          <span className="text-[10px] font-mono text-white/40">DECK-09</span>
        </div>
      </div>

      {/* Layer 1, Layer 2, Layer 3 Switch Dock (Clean horizontal dock right above deck) */}
      <div className="w-full max-w-[340px] mb-3 glass-panel p-1 rounded-2xl border border-white/10 shadow-lg bg-[#12151C]/95">
        <div className="grid grid-cols-3 gap-1.5 bg-[#0A0C12] p-1.5 rounded-xl border border-white/5">
          {[0, 1, 2].map((ch) => {
            const isActive = currentChannelIdx === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => onCycleDialMode(ch)}
                className={`py-2 px-1 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-b from-[#FF7A1A] to-[#FF5E00] text-black shadow-[0_0_14px_rgba(255,94,0,0.6)] font-black scale-[1.02]'
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>Layer {ch + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Physical Hardware Chassis */}
      <div className="relative w-[340px] rounded-3xl p-4 anodized-orange shadow-chassis select-none shrink-0">
        {/* USB-C Port indicator on top edge */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-[#171920] rounded-b-md border-x border-b border-black/60 flex items-center justify-center">
          <div className="w-5 h-0.5 bg-white/20 rounded-full" />
        </div>

        {/* Chassis Inner Dark Anodized Well */}
        <div className="bg-[#12151C] rounded-2xl p-3 border border-black/40 shadow-inner flex flex-col gap-3">
          {/* Top Section: OLED Display (Left) + Rotary Knob (Right) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono px-1">
              <button
                type="button"
                onClick={onOpenDisplayDrawer}
                className="text-white/40 hover:text-[#BD00FF] flex items-center gap-1 transition-colors cursor-pointer"
                title="Configure OLED Screen Settings"
              >
                <Tv className="w-3 h-3 text-[#BD00FF]" />
                <span>OLED SCREEN</span>
              </button>
              <button
                type="button"
                onClick={onOpenKnobDrawer}
                className="text-white/40 hover:text-[#00F0FF] flex items-center gap-1 transition-colors cursor-pointer"
                title="Configure Rotary Knob Actions"
              >
                <Sliders className="w-3 h-3 text-[#00F0FF]" />
                <span>ROTARY DIAL</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <OLEDDisplay
                  state={oledState}
                  activeLayerName={layer.name}
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

      {/* Quick Helper Subtext */}
      <div className="mt-3 text-center text-[10.5px] font-mono text-white/40 max-w-[340px]">
        <span>Click any switch, dial, or OLED screen to edit</span>
      </div>
    </div>
  );
};
