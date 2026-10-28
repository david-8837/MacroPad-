import React, { useState } from 'react';
import { 
  VIA_BASIC_KEYS, 
  VIA_MEDIA_KEYS, 
  VIA_MACRO_KEYS, 
  VIA_LAYER_KEYS, 
  VIA_SPECIAL_KEYS, 
  ViaKeycodeItem 
} from '../../data/viaKeycodes';
import { Zap } from 'lucide-react';

interface ViaKeycodePickerProps {
  selectedKeyIndex: number | null;
  onAssignKeycode: (keyIndex: number, item: ViaKeycodeItem) => void;
  onAssignCustomCode: (keyIndex: number, rawCode: string) => void;
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
  onAssignKeycode,
  onAssignCustomCode,
}) => {
  const [activeCategory, setActiveCategory] = useState<'basic' | 'media' | 'macro' | 'layers' | 'special' | 'custom'>('basic');
  const [customInput, setCustomInput] = useState('');

  const getActiveList = (): ViaKeycodeItem[] => {
    switch (activeCategory) {
      case 'basic': return VIA_BASIC_KEYS;
      case 'media': return VIA_MEDIA_KEYS;
      case 'macro': return VIA_MACRO_KEYS;
      case 'layers': return VIA_LAYER_KEYS;
      case 'special': return VIA_SPECIAL_KEYS;
      default: return [];
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim() || selectedKeyIndex === null) return;
    onAssignCustomCode(selectedKeyIndex, customInput.trim());
    setCustomInput('');
  };

  return (
    <div className="panel p-3.5 border border-[#E3E2DE] space-y-2.5 w-full select-none">
      
      {/* Row 1: Header Title & Target Switch Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-[#E3E2DE]">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#1351AA]" />
          <span className="text-[11px] font-mono font-bold text-[#141414] uppercase tracking-wider">
            VIA Quick Keycode Tray
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

      {/* Row 2: Category Tabs Pill Bar (100% width, 0 overflow) */}
      <div className="grid grid-cols-6 gap-1 bg-[#FFFFFF] p-1 border border-[#E3E2DE] text-[10px] font-mono text-center">
        {(['basic', 'media', 'macro', 'layers', 'special', 'custom'] as const).map(cat => (
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
            {cat}
          </button>
        ))}
      </div>

      {/* Custom Keycode Direct Input */}
      {activeCategory === 'custom' ? (
        <form onSubmit={handleCustomSubmit} className="flex gap-2 p-2 bg-[#FFFFFF] border border-[#E3E2DE]">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Enter raw QMK / VIA keycode (e.g. KC_LALT, LCTL(KC_C), 0x5D)"
            className="flex-1 px-3 py-1.5 bg-[#FFFFFF] border border-[#E3E2DE] text-xs font-mono text-[#141414] focus:border-[#1351AA] focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={selectedKeyIndex === null || !customInput.trim()}
            className="px-4 py-1.5 bg-[#1351AA] text-[#E3E2DE] font-bold text-xs disabled:opacity-40 cursor-pointer"
          >
            Assign
          </button>
        </form>
      ) : (
        /* Keycode Button Grid - Responsive, No Truncation */
        <div className="grid grid-cols-7 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-1 pr-1.5 select-none scrollbar-thin scrollbar-thumb-white/10">
          {getActiveList().map(item => {
            const displayLabel = formatKeycodeLabel(item);
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  /* No target switch means no assignment, and the header already
                   * says so. This used to be an alert(), which is a dialog the
                   * rest of the app never shows. */
                  if (selectedKeyIndex !== null) onAssignKeycode(selectedKeyIndex, item);
                }}
                disabled={selectedKeyIndex === null}
                title={`${item.code} - ${item.tooltip}${selectedKeyIndex === null ? ' (select a switch first)' : ''}`}
                className="h-9 px-1  border border-[#E3E2DE] enabled:hover:border-[#1351AA] enabled:hover:bg-[#EDECE8] text-[#444343] enabled:hover:text-[#1351AA] disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center justify-center text-center transition-all group enabled:cursor-pointer enabled:active:scale-95"
              >
                <span className="font-mono text-[10.5px] font-bold leading-tight">
                  {displayLabel}
                </span>
                {item.sublabel && (
                  <span className="text-[7px] font-mono text-[#646464] leading-none">
                    {item.sublabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
