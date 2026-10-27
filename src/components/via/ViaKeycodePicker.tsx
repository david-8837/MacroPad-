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
    <div className="glass-panel p-3.5 rounded-2xl border border-white/10 space-y-2.5 shadow-xl w-full select-none">
      
      {/* Row 1: Header Title & Target Switch Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#FF5E00]" />
          <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
            VIA Quick Keycode Tray
          </span>
        </div>

        {selectedKeyIndex !== null ? (
          <span className="text-[10px] font-mono text-[#38EF7D] bg-[#38EF7D]/10 px-2 py-0.5 rounded-full border border-[#38EF7D]/30 font-bold">
            TARGET: SWITCH #{selectedKeyIndex + 1}
          </span>
        ) : (
          <span className="text-[9.5px] font-mono text-white/40 italic">
            (Select switch above to remap)
          </span>
        )}
      </div>

      {/* Row 2: Category Tabs Pill Bar (100% width, 0 overflow) */}
      <div className="grid grid-cols-6 gap-1 bg-[#090C12] p-1 rounded-xl border border-white/10 text-[10px] font-mono text-center">
        {(['basic', 'media', 'macro', 'layers', 'special', 'custom'] as const).map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`py-1 rounded-lg uppercase font-bold text-center transition-all cursor-pointer ${
              activeCategory === cat
                ? 'bg-[#FF5E00] text-black shadow-xs font-black'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Custom Keycode Direct Input */}
      {activeCategory === 'custom' ? (
        <form onSubmit={handleCustomSubmit} className="flex gap-2 p-2 bg-[#0E1118] rounded-xl border border-white/5">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Enter raw QMK / VIA keycode (e.g. KC_LALT, LCTL(KC_C), 0x5D)"
            className="flex-1 px-3 py-1.5 bg-[#151923] border border-white/10 rounded-lg text-xs font-mono text-white focus:border-[#FF5E00] focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={selectedKeyIndex === null || !customInput.trim()}
            className="px-4 py-1.5 rounded-lg bg-[#FF5E00] text-black font-bold text-xs disabled:opacity-40 cursor-pointer"
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
                  if (selectedKeyIndex !== null) {
                    onAssignKeycode(selectedKeyIndex, item);
                  } else {
                    alert('Please click any switch on the macropad first to choose where to assign this keycode.');
                  }
                }}
                title={`${item.code} - ${item.tooltip}`}
                className="h-9 px-1 rounded-lg bg-gradient-to-b from-[#181D2A] to-[#121622] border border-white/10 hover:border-[#FF5E00] hover:bg-[#FF5E00]/15 text-white/80 hover:text-[#FF5E00] flex flex-col items-center justify-center text-center transition-all group cursor-pointer shadow-xs active:scale-95"
              >
                <span className="font-mono text-[10.5px] font-bold leading-tight">
                  {displayLabel}
                </span>
                {item.sublabel && (
                  <span className="text-[7px] font-mono text-white/40 leading-none">
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
