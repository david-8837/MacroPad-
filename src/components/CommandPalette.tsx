import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Sliders,
  Layers,
  Activity,
  Zap,
  Volume2,
  Cpu,
  RefreshCw,
  Power,
  Download,
  AppWindow,
  Flame,
  CheckCircle,
  Command,
  CornerDownLeft,
} from 'lucide-react';
import { Deck, Layer } from '../types';
import { HardwareConnectionState } from '../utils/hardwareBridge';
import { PC_SHORTCUTS, PCShortcut } from '../data/pcShortcuts';
import { executeDeckAction } from '../utils/executeDeckAction';

export interface PaletteItem {
  id: string;
  group: 'Page' | 'Layer' | 'Key' | 'Hardware' | 'Audio' | 'Shortcut' | 'Action';
  label: string;
  where: string;
  also?: string;
  icon?: React.ReactNode;
  run: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros';
  onChangeTab: (tab: 'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros') => void;
  deck: Deck;
  activeLayer: Layer;
  onSelectLayer: (layerId: string) => void;
  onOpenDiagnostics: () => void;
  onOpenFirmwarePanel: () => void;
  onExportDeck: () => void;
  hardwareState: HardwareConnectionState;
  onConnectSerial: () => void;
  onDisconnectHardware: () => void;
  onOpenUploadSheet: () => void;
  onSelectKey?: (index: number) => void;
  onSelectKnob?: () => void;
  onTriggerAction?: (name: string, detail?: string, type?: 'success' | 'safety' | 'error' | 'info') => void;
}

export function rank(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);

  if (!words.length) {
    // Default initial suggestions: Pages, Layers, Key Tester, Audio, and Diagnostics
    return items.filter((i) => i.group === 'Page' || i.group === 'Layer' || i.group === 'Action').slice(0, 30);
  }

  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    const where = item.where.toLowerCase();
    const also = (item.also ?? '').toLowerCase();
    let score = -1;

    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (words.every((w) => label.includes(w))) score = 2;
    else if (label.includes(q)) score = 3;
    else if (words.every((w) => also.includes(w))) score = 4;
    else if (also.includes(q)) score = 5;
    else if (where.includes(q)) score = 6;

    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 50).map((x) => x.item);
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  activeTab: _activeTab,
  onChangeTab,
  activeLayer,
  onSelectLayer,
  onOpenDiagnostics,
  onOpenFirmwarePanel,
  deck,
  onExportDeck,
  hardwareState,
  onConnectSerial,
  onDisconnectHardware,
  onOpenUploadSheet,
  onSelectKey,
  onSelectKnob,
  onTriggerAction,
}) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build the catalogue of all possible actions
  const items = useMemo(() => {
    const list: PaletteItem[] = [];

    // 1. Pages / Tabs
    list.push(
      {
        id: 'tab-designer',
        group: 'Page',
        label: 'Deck Studio',
        where: 'Layout editor & digital twin',
        also: 'home editor keymap pad simulator twin buttons',
        icon: <Sliders className="w-4 h-4 text-[#1351AA]" />,
        run: () => onChangeTab('designer'),
      },
      {
        id: 'tab-tester',
        group: 'Page',
        label: 'Key Tester (OS events)',
        where: 'Keyboard-event visualizer · not pad timing',
        also: 'tester os keyboard events keydown visualization no hardware measurement',
        icon: <CheckCircle className="w-4 h-4 text-[#1351AA]" />,
        run: () => onChangeTab('tester'),
      },
      {
        id: 'tab-shortcuts',
        group: 'Page',
        label: 'Shortcuts Library',
        where: 'Quick presets and cheatsheet',
        also: 'shortcuts hotkeys presets bindings pc',
        icon: <Flame className="w-4 h-4 text-[#1351AA]" />,
        run: () => onChangeTab('shortcuts'),
      },
      {
        id: 'tab-apps',
        group: 'Page',
        label: 'Application Library',
        where: 'Detected software · palette-only page',
        also: 'apps applications library programs exe launcher discover',
        icon: <AppWindow className="w-4 h-4 text-[#1351AA]" />,
        run: () => onChangeTab('apps'),
      },
      {
        id: 'tab-lighting',
        group: 'Page',
        label: 'RGB Lighting Studio',
        where: 'Backlight patterns & colors',
        also: 'rgb lighting led colors animation brightness',
        icon: <Zap className="w-4 h-4 text-[#444343]" />,
        run: () => onChangeTab('lighting'),
      },
      {
        id: 'tab-macros',
        group: 'Page',
        label: 'Macro Editor',
        where: 'Timed sequential macro chains',
        also: 'macros sequence record automate delay',
        icon: <Cpu className="w-4 h-4 text-[#1351AA]" />,
        run: () => onChangeTab('macros'),
      }
    );

    // 2. Hardware inspector and other actions
    list.push(
      {
        id: 'action-diagnostics',
        group: 'Action',
        label: 'Hardware Status & Diagnostics',
        where: 'Studio inspector · action history, wire log & self-tests',
        also: 'diagnostics action history logs debug health selftest errors',
        icon: <Activity className="w-4 h-4 text-[#1351AA]" />,
        run: onOpenDiagnostics,
      },
      {
        id: 'action-firmware',
        group: 'Action',
        label: 'RP2040 Firmware & Bootloader (.uf2)',
        where: 'Left sidebar · BOOTSEL, UF2 inspection & flash',
        also: 'firmware update flash rp2040 uf2 bootloader bootsel rpi-rp2',
        icon: <Zap className="w-4 h-4 text-[#1351AA]" />,
        run: onOpenFirmwarePanel,
      },
      {
        id: 'action-export-deck',
        group: 'Action',
        label: 'Export Deck to JSON',
        where: 'Backup the deck and its 4 layers',
        also: 'export backup json save share deck layout',
        icon: <Download className="w-4 h-4 text-[#1351AA]" />,
        run: onExportDeck,
      }
    );

    // 3. Hardware Interop Actions
    if (hardwareState === 'connected') {
      if (!deck.isLocked) list.push(
        {
          id: 'hw-sync',
          group: 'Hardware',
          label: 'Review & Upload Config to RP2040 Flash',
          where: 'Bottom sheet · preview, then commit and verify on the pad',
          also: 'sync eeprom flash write memory upload device macropad',
          icon: <RefreshCw className="w-4 h-4 text-[#1351AA]" />,
          run: onOpenUploadSheet,
        }
      );
      list.push(
        {
          id: 'hw-disconnect',
          group: 'Hardware',
          label: 'Disconnect Microcontroller',
          where: 'Close USB connection',
          also: 'disconnect unplug close port release',
          icon: <Power className="w-4 h-4 text-[#141414]" />,
          run: () => {
            onDisconnectHardware();
            onTriggerAction?.('Disconnect Hardware', 'Microcontroller session closed', 'info');
          },
        }
      );
    } else {
      list.push(
        {
          id: 'hw-connect-serial',
          group: 'Hardware',
          label: 'Connect USB Serial / COM Port',
          where: 'CDC Serial protocol (115200 baud)',
          also: 'connect serial com port usb rp2040 arduino cdc uart',
          icon: <Cpu className="w-4 h-4 text-[#1351AA]" />,
          run: onConnectSerial,
        }
      );
    }

    // 4. Deck layers
    deck.layers.forEach((l, idx) => {
      list.push({
        id: `layer-${l.id}`,
        group: 'Layer',
        label: `Edit / preview ${l.name}`,
        where: l.id === activeLayer.id ? 'Editing here · pad unchanged' : `Preview Layer ${idx} · pad unchanged`,
        also: `edit preview layer channel ${l.name} ch${idx} layer${idx}`,
        icon: <Layers className="w-4 h-4 text-[#1351AA]" />,
        run: () => {
          onSelectLayer(l.id);
          onChangeTab('designer');
        },
      });
    });

    // 5. Active layer keys & knob
    activeLayer.keys.forEach((k, idx) => {
      const actionName = k.tapAction?.name || k.label || `Switch #${idx + 1}`;
      list.push({
        id: `key-${idx}`,
        group: 'Key',
        label: `Key ${idx + 1}: ${actionName}`,
        where: `${activeLayer.name} · Switch #${idx + 1}`,
        also: `key ${idx + 1} switch button ${actionName} edit`,
        icon: <Sliders className="w-4 h-4 text-[#646464]" />,
        run: () => {
          onChangeTab('designer');
          onSelectKey?.(idx);
        },
      });
    });

    list.push({
      id: 'knob-edit',
      group: 'Key',
      label: `Rotary Encoder: ${activeLayer.dial.label || 'Dial Controls'}`,
      where: `${activeLayer.name} · Encoder`,
      also: 'knob dial rotary encoder volume scrub cw ccw press',
      icon: <Volume2 className="w-4 h-4 text-[#1351AA]" />,
      run: () => {
        onChangeTab('designer');
        onSelectKnob?.();
      },
    });

    // 7. Direct Audio System Commands
    list.push(
      {
        id: 'audio-master-mute',
        group: 'Audio',
        label: 'Audio: Toggle Master Mute',
        where: 'Windows CoreAudio endpoint',
        also: 'audio master volume mute sound silence speaker',
        icon: <Volume2 className="w-4 h-4 text-[#1351AA]" />,
        run: async () => {
          await window.electronAPI?.toggleMasterMute?.();
          onTriggerAction?.('Master Mute Toggled', 'Windows master mute changed', 'info');
        },
      },
      {
        id: 'audio-mic-mute',
        group: 'Audio',
        label: 'Audio: Toggle Microphone Mute',
        where: 'Default capture device',
        also: 'mic microphone mute input capture silence',
        icon: <Volume2 className="w-4 h-4 text-[#141414]" />,
        run: async () => {
          const mic = await window.electronAPI?.getMic?.();
          if (mic?.ok && mic.value) {
            await window.electronAPI?.setMic?.({ muted: !mic.value.muted });
            onTriggerAction?.('Mic Mute Toggled', `Microphone ${mic.value.muted ? 'unmuted' : 'muted'}`, 'info');
          }
        },
      },
      {
        id: 'audio-vol-up',
        group: 'Audio',
        label: 'Audio: Master Volume Up (+5%)',
        where: 'Windows CoreAudio',
        also: 'volume up louder master sound',
        icon: <Volume2 className="w-4 h-4 text-[#1351AA]" />,
        run: async () => {
          await window.electronAPI?.adjustMasterVolume?.(5);
        },
      },
      {
        id: 'audio-vol-down',
        group: 'Audio',
        label: 'Audio: Master Volume Down (-5%)',
        where: 'Windows CoreAudio',
        also: 'volume down quieter softer sound',
        icon: <Volume2 className="w-4 h-4 text-[#1351AA]" />,
        run: async () => {
          await window.electronAPI?.adjustMasterVolume?.(-5);
        },
      }
    );

    // 9. Shortcuts Catalog (Top ~600 popular PC shortcuts)
    // Every shortcut, not the first 400: the cap truncated nothing at 187 entries
    // and would have hidden the tail of the vault the day the table grew.
    const shortcutsSample: PCShortcut[] = PC_SHORTCUTS;
    for (const s of shortcutsSample) {
      list.push({
        id: `shortcut-${s.id}`,
        group: 'Shortcut',
        label: s.name,
        where: s.appName ? `${s.appName} (${s.keys.join('+')})` : s.keys.join('+'),
        also: `${s.category} ${s.description} ${s.appName || ''} ${s.keys.join(' ')}`,
        icon: <Flame className="w-4 h-4 text-[#1351AA]" />,
        run: async () => {
          await executeDeckAction({
            id: `palette-shortcut-${s.id}`,
            category: 'hotkey',
            name: s.name,
            payload: { keys: s.keys },
          });
          onTriggerAction?.(`Executed: ${s.name}`, `Keys: ${s.keys.join('+')}`, 'success');
        },
      });
    }

    return list;
  }, [
    deck,
    activeLayer,
    hardwareState,
    onChangeTab,
    onSelectLayer,
    onOpenDiagnostics,
    onOpenFirmwarePanel,
    onExportDeck,
    onConnectSerial,
    onDisconnectHardware,
    onOpenUploadSheet,
    onSelectKey,
    onSelectKnob,
    onTriggerAction,
  ]);

  // Ranked query results
  const results = useMemo(() => rank(items, query), [items, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelected(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeItem = listRef.current.querySelector(`[data-index="${selected}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  const choose = async (index: number) => {
    const item = results[index];
    if (!item) return;
    onClose();
    await item.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((prev) => Math.min(results.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setSelected((prev) => Math.min(results.length - 1, prev + 6));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setSelected((prev) => Math.max(0, prev - 6));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelected(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(selected);
    }
  };

  if (!isOpen) return null;

  const getGroupBadgeColor = (group: PaletteItem['group']) => {
    switch (group) {
      case 'Page': return 'bg-[#EDECE8] text-[#1351AA] border-[#C7C7C7]';
      case 'Layer': return 'bg-[#EDECE8] text-[#1351AA] border-[#C7C7C7]';
      case 'Key': return 'bg-white/10 text-white/80 border-white/15';
      case 'Hardware': return 'bg-[#EDECE8] text-[#1351AA] border-[#C7C7C7]';
      case 'Audio': return 'bg-[#EDECE8]/15 text-[#1351AA] border-[#C7C7C7]/30';
      case 'Shortcut': return 'bg-[#EDECE8]/15 text-[#1351AA] border-[#C7C7C7]/30';
      case 'Action': return 'bg-[#EDECE8]/15 text-[#1351AA] border-[#C7C7C7]/30';
      default: return 'bg-white/10 text-white/70 border-white/10';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-[#EDECE8] animate-in fade-in duration-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
    >
      <div className="relative w-full max-w-2xl bg-[#FFFFFF] border border-[#C7C7C7] flex flex-col overflow-hidden animate-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="relative px-5 py-4 border-b border-[#E3E2DE] flex items-center gap-3 bg-[#EDECE8]">
          <Search className="w-5 h-5 text-[#1351AA] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, shortcut, layer, key, or page..."
            className="w-full bg-transparent text-sm text-[#141414] placeholder-[#7A7A7A] focus:outline-hidden font-sans"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results-list"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#EDECE8] text-[#646464] border border-[#E3E2DE]">
              ESC
            </span>
          </div>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="palette-results-list"
          role="listbox"
          className="max-h-[50vh] overflow-y-auto p-2 space-y-1 font-mono text-xs"
        >
          {results.length === 0 ? (
            <div className="py-12 px-4 text-center text-[#646464] italic space-y-1">
              <div>No actions or shortcuts matching “{query.trim()}”</div>
              <div className="text-[11px] text-[#646464]">Try searching for "Mute", "DaVinci", "Tester", "Layer", or "EEPROM"</div>
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selected;
              return (
                <button
                  key={item.id}
                  data-index={index}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => choose(index)}
                  className={`w-full flex items-center justify-between p-3 text-left transition-all cursor-pointer ${
 isSelected
 ? 'bg-[#FFFFFF] border border-[#C7C7C7] text-[#141414] '
 : 'border border-transparent text-[#444343] hover:bg-[#F4F3F0]'
 }`}
                >
                  <div className="flex items-center gap-3 truncate pr-2">
                    <div className="p-1.5 bg-[#EDECE8] border border-[#E3E2DE] shrink-0">
                      {item.icon || <Command className="w-4 h-4 text-[#646464]" />}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 border ${getGroupBadgeColor(
 item.group
 )}`}
                        >
                          {item.group}
                        </span>
                        <span className="font-semibold text-xs text-[#141414] truncate">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#646464] font-mono truncate max-w-[200px]">
                      {item.where}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-[#1351AA] shrink-0" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-[#E3E2DE] bg-[#EDECE8] flex items-center justify-between text-[11px] font-mono text-[#646464]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-[#EDECE8] text-[#444343] border border-[#E3E2DE] text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-[#EDECE8] text-[#444343] border border-[#E3E2DE] text-[10px]">↵</kbd>
              Execute
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 bg-[#EDECE8] text-[#444343] border border-[#E3E2DE] text-[10px]">Esc</kbd>
              Close
            </span>
          </div>

          <div className="text-[10px] text-[#646464]">
            {results.length} action{results.length === 1 ? '' : 's'} available
          </div>
        </div>
      </div>
    </div>
  );
};

