import React from 'react';
import { Layer, OLEDState } from '../types';
import { OLEDDisplay } from './OLEDDisplay';
import { RotaryEncoder } from './RotaryEncoder';
import { KeyMatrix } from './KeyMatrix';
import { useLedFrame } from '../lighting/useLedFrame';
import { LIGHTING_CHANNELS } from '../lighting/store';
import { Sliders, Keyboard, ChevronRight, Tv, Zap, ArrowUpRight } from 'lucide-react';

interface DigitalTwinProps {
  layer: Layer;
  channelIndex?: number;
  /** Short label per layer, index-aligned. */
  layerNames?: string[];
  oledState: OLEDState;
  deckName: string;
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
  onCycleDialMode: (explicitChannelIdx?: number) => void;
  connectionStatus: 'simulator' | 'usb_connected';
  onToggleConnection: () => void;
}

export const DigitalTwin: React.FC<DigitalTwinProps> = ({
  layer,
  channelIndex,
  layerNames = ['EDIT', 'TOOLS', 'CUSTOM', 'MACROS'],
  oledState,
  deckName,
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
  onCycleDialMode,
  connectionStatus,
}) => {
  /* The dial keeps one mode per layer — four modes, four layers — so the pill
   * list below is the layer list and there is nothing to hard-code here. An
   * unknown active mode falls back to the first layer rather than an invented
   * "Layer 3: Focused App Audio" row that the deck never had. */
  const currentChannelIdx = channelIndex !== undefined
    ? channelIndex
    : Math.max(layer.dial.availableModes.indexOf(layer.dial.activeModeName), 0);

  /* The same engine the Lighting page previews with, on the deck's own channel.
   * There is one lighting channel per layer on both sides of the wire, so the
   * layer index is the channel index; the clamp only guards a stale prop. */
  const lightingChannel = Math.min(currentChannelIdx, LIGHTING_CHANNELS - 1);
  const { hex: ledColors } = useLedFrame(lightingChannel);

  /* The three side controls share one anatomy: index · title · meta · arrow */
  const controls = [
    {
      index: '01',
      title: 'Keys',
      meta: selectedKeyIndex !== null ? `Switch #${selectedKeyIndex + 1}` : 'Configure switches',
      icon: <Keyboard className="w-3.5 h-3.5" />,
      open: isDrawerKeyOpen,
      onClick: () => onOpenDrawer?.(selectedKeyIndex ?? 0),
    },
    {
      index: '02',
      title: 'Knob',
      meta: `Layer ${currentChannelIdx} actions & dial`,
      icon: <Sliders className="w-3.5 h-3.5" />,
      open: isDrawerKnobOpen,
      onClick: onOpenKnobDrawer,
    },
    {
      index: '03',
      title: 'Display',
      meta: `OLED mode · ${oledState.mode}`,
      icon: <Tv className="w-3.5 h-3.5" />,
      open: isDrawerDisplayOpen,
      onClick: onOpenDisplayDrawer,
    },
  ];

  return (
    <div className="w-full flex flex-col items-center">

      {/* ── section header: label + readout ─────────────────────── */}
      <div className="w-full flex items-end justify-between border-b border-[#C7C7C7] pb-2 mb-5">
        <div className="flex items-baseline gap-3">
          <span className="eyebrow eyebrow--ink">Deck · 09</span>
          <span className="idx whitespace-nowrap">9 keys · 1 encoder · 128×32</span>
        </div>
        <span className="idx">
          {connectionStatus === 'usb_connected' ? 'USB · LINKED' : 'SIMULATOR'}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6">

        {/* ── the physical object: an ink slab ──────────────────── */}
        <div className="chassis relative w-[352px] shrink-0 select-none">

          {/* top edge: usb-c notch */}
          <div className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-11 h-[5px] bg-[#E3E2DE]" />

          <div className="p-4">
            {/* screen + knob share a row, split by a hairline */}
            <div className="flex items-stretch gap-4 pb-4 border-b border-[#E3E2DE]">
              <div className="flex-1 min-w-0">
                <OLEDDisplay
                  state={oledState}
                  activeLayerName={layer.name}
                  deckName={deckName}
                  channelIndex={currentChannelIdx}
                  layerCount={layerNames.length}
                />
              </div>
              <div className="w-[76px] shrink-0 flex flex-col items-center justify-center gap-2 pl-4 border-l border-[#E3E2DE]">
                <RotaryEncoder
                  dial={layer.dial}
                  channelIndex={currentChannelIdx}
                  onTriggerAction={onTriggerAction}
                  onCycleMode={onCycleDialMode}
                />
              </div>
            </div>

            {/* key field */}
            <div className="pt-4">
              <KeyMatrix
                keys={layer.keys}
                ledColors={ledColors}
                selectedKeyIndex={selectedKeyIndex}
                onSelectKey={onSelectKey}
                onTriggerAction={onTriggerAction}
              />
            </div>
          </div>

          {/* corner registration marks — squared, cream */}
          {['top-1.5 left-1.5', 'top-1.5 right-1.5', 'bottom-1.5 left-1.5', 'bottom-1.5 right-1.5'].map((pos) => (
            <span key={pos} className={`absolute ${pos} w-1.5 h-1.5 bg-[#E3E2DE]`} />
          ))}
        </div>

        {/* ── control dock: flat panels, 1px rules ──────────────── */}
        <div className="flex flex-col gap-3 w-[248px] shrink-0 grow-0">

          {/* layer selector — one cell per layer, 0-based */}
          <div className="panel">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]">
              <span className="eyebrow">Layer</span>
              <span className="idx text-[#1351AA]">
                {`0${currentChannelIdx} / 0${Math.max(layerNames.length - 1, 0)}`}
              </span>
            </div>

            <div
              className="grid divide-x divide-[#C7C7C7]"
              style={{ gridTemplateColumns: `repeat(${layerNames.length}, minmax(0, 1fr))` }}
            >
              {layerNames.map((label, ch) => {
                const isActive = currentChannelIdx === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => onCycleDialMode(ch)}
                    className={`py-2.5 flex flex-col items-center gap-1 transition-colors duration-300 ${
                      isActive
                        ? 'bg-[#141414] text-[#E3E2DE]'
                        : 'text-[#646464] hover:bg-[#EDECE8] hover:text-[#141414]'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold tracking-[0.1em]">
                      {`0${ch}`}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.14em] opacity-80 truncate max-w-full px-1">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-3 py-2 border-t border-[#C7C7C7]">
              <p className="text-[10px] text-[#444343] truncate">
                {layer.dial.availableModes[currentChannelIdx] || `Layer ${currentChannelIdx}`}
              </p>
              <p className="mt-1 font-mono text-[9px] text-[#646464] leading-relaxed">
                HOLD {layer.dial.channelHoldThresholdMs || 800}MS TO SWITCH · TAP {layer.dial.pressAction.name.toUpperCase()}
              </p>
            </div>
          </div>

          {/* edit rows — the typographic list item pattern */}
          <div className="panel">
            <div className="px-3 py-2 border-b border-[#C7C7C7]">
              <span className="eyebrow">Configure</span>
            </div>
            {controls.map((c) => (
              <button
                key={c.index}
                type="button"
                onClick={c.onClick}
                className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-[#E3E2DE] last:border-b-0 text-left transition-colors duration-300 group ${
                  c.open ? 'bg-[#141414] text-[#E3E2DE]' : 'text-[#141414] hover:bg-[#EDECE8]'
                }`}
              >
                <span className={`idx w-6 shrink-0 ${c.open ? 'text-[#C7C7C7]' : ''}`}>{c.index}</span>
                <span className={`shrink-0 ${c.open ? 'text-[#E3E2DE]' : 'text-[#646464]'}`}>{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.1em] leading-tight">
                    {c.title}
                  </span>
                  <span className={`block font-mono text-[9px] truncate ${c.open ? 'text-[#C7C7C7]' : 'text-[#646464]'}`}>
                    {c.meta}
                  </span>
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-300 ${
                    c.open ? 'text-[#E3E2DE] translate-x-0.5' : 'text-[#646464] group-hover:translate-x-0.5'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* the one primary action in this column */}
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="btn w-full justify-between h-[46px]"
          >
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              Upload to deck
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-5 w-full text-[10px] font-mono uppercase tracking-[0.12em] text-[#646464] border-t border-[#C7C7C7] pt-3">
        Tap a switch to actuate · long-press for alternate · open a drawer to rebind
      </p>
    </div>
  );
};
