import React, { useState } from 'react';
import {
  VIA_BASIC_KEYS, VIA_MEDIA_KEYS, VIA_MACRO_KEYS, VIA_LAYER_KEYS, VIA_OLED_KEYS, VIA_SPECIAL_KEYS,
  type ViaKeycodeItem,
} from '../../data/viaKeycodes';
import { loadStoredMacros } from '../../utils/executeDeckAction';
import { isMacroReady } from '../../utils/macroStorage';
import { Zap } from 'lucide-react';

interface ViaKeycodePickerProps {
  selectedKeyIndex: number | null;
  isDeckLocked?: boolean;
  onAssignKeycode: (keyIndex: number, item: ViaKeycodeItem) => void;
}

// Format long labels cleanly so they never truncate with ugly '...'
const formatKeycodeLabel = (item: ViaKeycodeItem): string => {
  switch (item.code) {
    case 'KC_BSPC': return '⌫';
    case 'KC_ENT': return 'Enter';
    case 'KC_ESC': return 'Esc';
    case 'KC_SPC': return 'Space';
    case 'KC_TAB': return 'Tab';
    case 'KC_CAPS': return 'Caps';
    case 'KC_PSCR': return 'PrtSc';
    case 'KC_SLCK': return 'ScrLk';
    case 'KC_PAUS': return 'Pause';
    case 'KC_INS': return 'Ins';
    case 'KC_DEL': return 'Del';
    case 'KC_HOME': return 'Home';
    case 'KC_END': return 'End';
    case 'KC_PGUP': return 'PgUp';
    case 'KC_PGDN': return 'PgDn';
    case 'KC_MUTE': return 'Mute';
    case 'KC_VOLU': return 'Vol+';
    case 'KC_VOLD': return 'Vol-';
    case 'KC_MNXT': return 'Next';
    case 'KC_MPRV': return 'Prev';
    case 'KC_MPLY': return 'Play';
    case 'KC_MSTP': return 'Stop';
    default: return item.label;
  }
};

export const ViaKeycodePicker: React.FC<ViaKeycodePickerProps> = ({
  selectedKeyIndex,
  isDeckLocked = false,
  onAssignKeycode,
}) => {
  const [activeCategory, setActiveCategory] = useState<ViaKeycodeItem['category']>('basic');
  const definedMacros = new Set(loadStoredMacros().filter(isMacroReady).map(m => m.id));

  const getActiveList = (): ViaKeycodeItem[] => {
    switch (activeCategory) {
      case 'basic': return VIA_BASIC_KEYS;
      case 'media': return VIA_MEDIA_KEYS;
      case 'macro': return VIA_MACRO_KEYS;
      case 'layers': return VIA_LAYER_KEYS;
      case 'oled': return VIA_OLED_KEYS;
      case 'special': return VIA_SPECIAL_KEYS;
      default: return [];
    }
  };

  return (
    <div className="panel p-3.5 border border-[#E3E2DE] space-y-2.5 w-full select-none">
      
      {/* Row 1: Header Title & Target Switch Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E3E2DE]">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#1351AA]" />
          <span className="text-[11px] font-mono font-bold text-[#141414] uppercase tracking-wider">
            MPAD3 Quick Assignments
          </span>
        </div>

        {selectedKeyIndex !== null ? (
          <span className="text-[10px] font-mono text-[#1351AA] bg-[#EDECE8] px-2 py-0.5 border border-[#C7C7C7] font-bold">
            TARGET: SWITCH #{selectedKeyIndex + 1}
          </span>
        ) : (
          <span className="text-[9.5px] font-mono text-[#646464] italic">
            (Select switch above to remap)
          </span>
        )}
      </div>

      <p className="font-mono text-[9px] text-[#646464] leading-relaxed">
        Keys, media, layer switches and OLED NEXT run on the pad after upload. Macros run only in the desktop app with USB events.
      </p>
      {isDeckLocked && <p role="status" className="font-mono text-[10px] font-bold text-[#1351AA]">
        DECK LOCKED · Unlock in the sidebar before assigning or clearing a switch.
      </p>}
      {/* Only categories with a real MPAD3 or PC route are offered. */}
      <div className="grid grid-cols-6 gap-1 bg-[#FFFFFF] p-1 border border-[#E3E2DE] text-[10px] font-mono text-center">
        {(['basic', 'media', 'macro', 'layers', 'oled', 'special'] as const).map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`py-1 uppercase font-bold text-center transition-all cursor-pointer ${
 activeCategory === cat
 ? 'bg-[#1351AA] text-[#E3E2DE] font-black'
 : 'text-[#646464] hover:text-[#141414] hover:bg-[#F4F3F0]'
 }`}
          >
            {cat === 'macro' ? 'PC macros' : cat === 'special' ? 'Clear' : cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-1 pr-1.5 select-none scrollbar-thin scrollbar-thumb-white/10">
        {getActiveList().map(item => {
          const displayLabel = formatKeycodeLabel(item);
          const macroId = item.category === 'macro' ? Number(item.code.slice(1)) : null;
          const missingMacro = macroId !== null && !definedMacros.has(macroId);
          const disabled = selectedKeyIndex === null || missingMacro || isDeckLocked;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                if (!disabled && selectedKeyIndex !== null) onAssignKeycode(selectedKeyIndex, item);
              }}
              disabled={disabled}
              title={isDeckLocked ? 'Unlock deck in the sidebar to change assignments' : missingMacro
                ? `${item.code} has no executable steps. Add combo/text/delay steps in PC Macro Studio before assigning; desktop app and USB events required.`
                : `${item.code} — ${item.tooltip}${selectedKeyIndex === null ? ' (select a switch first)' : ''}`}
              className="min-h-10 px-1 border border-[#E3E2DE] enabled:hover:border-[#1351AA] enabled:hover:bg-[#EDECE8] text-[#444343] enabled:hover:text-[#1351AA] disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center text-center transition-all group enabled:cursor-pointer enabled:active:scale-95"
            >
              <span className="font-mono text-[10.5px] font-bold leading-tight">{displayLabel}</span>
              <span className="text-[7px] font-mono text-[#646464] leading-none">
                {missingMacro ? 'SET UP M' : item.category === 'macro' ? 'PC APP' :
                  item.category === 'special' ? 'REMOVE' : 'ON PAD'}
              </span>
            </button>
          );
        })}
      </div>
      {activeCategory === 'macro' && (
        <p className="font-mono text-[9px] text-[#646464]">
          Greyed out? Create that M-slot in Macro Studio first. The desktop app must stay open and connected to USB serial.
        </p>
      )}
    </div>
  );
};
