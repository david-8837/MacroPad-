import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Sliders,
  Layers,
  Activity,
  Zap,
  Volume2,
  Radio,
  Usb,
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
import { Profile, Layer } from '../types';
import { HardwareConnectionState } from '../utils/hardwareBridge';
import { PC_SHORTCUTS, PCShortcut } from '../data/pcShortcuts';
import { executeDeckAction } from '../utils/executeDeckAction';

export interface PaletteItem {
  id: string;
  group: 'Page' | 'Profile' | 'Layer' | 'Key' | 'Hardware' | 'Audio' | 'OBS' | 'Shortcut' | 'Action';
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
  profiles: Profile[];
  activeProfile: Profile;
  onSelectProfile: (profileId: string) => void;
  onOpenProfileModal: () => void;
  activeLayer: Layer;
  onSelectLayer: (layerId: string) => void;
  onOpenDiagnostics: () => void;
  onOpenFirmwareModal: () => void;
  onExportProfiles: () => void;
  autoProfileSwitch: boolean;
  onToggleAutoProfileSwitch: () => void;
  hardwareState: HardwareConnectionState;
  onConnectHID: () => void;
  onConnectSerial: () => void;
  onDisconnectHardware: () => void;
  onSyncEEPROM: () => void;
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
  profiles,
  activeProfile,
  onSelectProfile,
  onOpenProfileModal,
  activeLayer,
  onSelectLayer,
  onOpenDiagnostics,
  onOpenFirmwareModal,
  onExportProfiles,
  autoProfileSwitch,
  onToggleAutoProfileSwitch,
  hardwareState,
  onConnectHID,
  onConnectSerial,
  onDisconnectHardware,
  onSyncEEPROM,
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
        icon: <Sliders className="w-4 h-4 text-[#FF5E00]" />,
        run: () => onChangeTab('designer'),
      },
      {
        id: 'tab-tester',
        group: 'Page',
        label: 'Key Tester',
        where: 'Interactive matrix validator',
        also: 'tester matrix actuation switches check',
        icon: <CheckCircle className="w-4 h-4 text-[#38EF7D]" />,
        run: () => onChangeTab('tester'),
      },
      {
        id: 'tab-shortcuts',
        group: 'Page',
        label: 'Shortcuts Library',
        where: 'Quick presets and cheatsheet',
        also: 'shortcuts hotkeys presets bindings pc',
        icon: <Flame className="w-4 h-4 text-amber-400" />,
        run: () => onChangeTab('shortcuts'),
      },
      {
        id: 'tab-apps',
        group: 'Page',
        label: 'Application Library',
        where: 'Detected Windows software & launchers',
        also: 'apps applications library programs exe launcher discover',
        icon: <AppWindow className="w-4 h-4 text-blue-400" />,
        run: () => onChangeTab('apps'),
      },
      {
        id: 'tab-lighting',
        group: 'Page',
        label: 'RGB Lighting Studio',
        where: 'Backlight patterns & colors',
        also: 'rgb lighting led colors animation brightness',
        icon: <Zap className="w-4 h-4 text-purple-400" />,
        run: () => onChangeTab('lighting'),
      },
      {
        id: 'tab-macros',
        group: 'Page',
        label: 'Macro Editor',
        where: 'Timed sequential macro chains',
        also: 'macros sequence record automate delay',
        icon: <Cpu className="w-4 h-4 text-[#00F0FF]" />,
        run: () => onChangeTab('macros'),
      }
    );

    // 2. Modals, Diagnostics & Drawers
    list.push(
      {
        id: 'action-diagnostics',
        group: 'Action',
        label: 'Open Action History & Diagnostics',
        where: 'Real-time telemetry, wire log & self-tests',
        also: 'diagnostics action history logs debug health selftest errors',
        icon: <Activity className="w-4 h-4 text-[#00F0FF]" />,
        run: onOpenDiagnostics,
      },
      {
        id: 'action-firmware',
        group: 'Action',
        label: 'RP2040 Firmware Flasher (.uf2)',
        where: 'ROM bootloader UF2 flasher',
        also: 'firmware update flash rp2040 uf2 bootloader bootsel rpi-rp2',
        icon: <Zap className="w-4 h-4 text-[#FF5E00]" />,
        run: onOpenFirmwareModal,
      },
      {
        id: 'action-manage-profiles',
        group: 'Action',
        label: 'Manage Profiles...',
        where: 'Create, clone or delete profiles',
        also: 'profile manager new delete clone rename',
        icon: <Sliders className="w-4 h-4 text-white/70" />,
        run: onOpenProfileModal,
      },
      {
        id: 'action-export-profiles',
        group: 'Action',
        label: 'Export Profiles to JSON',
        where: 'Backup layout configuration',
        also: 'export backup json save share profiles',
        icon: <Download className="w-4 h-4 text-[#00F0FF]" />,
        run: onExportProfiles,
      },
      {
        id: 'action-toggle-autoprofile',
        group: 'Action',
        label: `Auto-Profile Switching: ${autoProfileSwitch ? 'Turn OFF' : 'Turn ON'}`,
        where: 'Foreground active window detection',
        also: 'auto profile switch window focus process tracking automatic',
        icon: <RefreshCw className="w-4 h-4 text-[#38EF7D]" />,
        run: onToggleAutoProfileSwitch,
      }
    );

    // 3. Hardware Interop Actions
    if (hardwareState === 'connected') {
      list.push(
        {
          id: 'hw-sync',
          group: 'Hardware',
          label: 'Sync Keymap to Flash / EEPROM',
          where: 'Commit configuration to hardware',
          also: 'sync eeprom flash write memory upload device macropad',
          icon: <RefreshCw className="w-4 h-4 text-[#38EF7D]" />,
          run: () => {
            onSyncEEPROM();
            onTriggerAction?.('Sync Keymap', 'Flashing profile to hardware EEPROM', 'success');
          },
        },
        {
          id: 'hw-disconnect',
          group: 'Hardware',
          label: 'Disconnect Microcontroller',
          where: 'Close USB connection',
          also: 'disconnect unplug close port release',
          icon: <Power className="w-4 h-4 text-red-400" />,
          run: () => {
            onDisconnectHardware();
            onTriggerAction?.('Disconnect Hardware', 'Microcontroller session closed', 'info');
          },
        }
      );
    } else {
      list.push(
        {
          id: 'hw-connect-hid',
          group: 'Hardware',
          label: 'Connect WebHID Macropad',
          where: 'QMK / Raw HID endpoint (0xFF60)',
          also: 'connect hid webhid usb qmk macropad',
          icon: <Usb className="w-4 h-4 text-[#FF5E00]" />,
          run: onConnectHID,
        },
        {
          id: 'hw-connect-serial',
          group: 'Hardware',
          label: 'Connect USB Serial / COM Port',
          where: 'CDC Serial protocol (115200 baud)',
          also: 'connect serial com port usb rp2040 arduino cdc uart',
          icon: <Cpu className="w-4 h-4 text-[#38EF7D]" />,
          run: onConnectSerial,
        }
      );
    }

    // 4. Profiles
    for (const p of profiles) {
      list.push({
        id: `profile-${p.id}`,
        group: 'Profile',
        label: `Switch Profile: ${p.name}`,
        where: p.id === activeProfile.id ? 'Currently active' : p.targetProcess ? `Target: ${p.targetProcess}` : 'Switch deck profile',
        also: `profile ${p.name} ${p.targetProcess || ''}`,
        icon: <Layers className="w-4 h-4 text-amber-400" />,
        run: () => onSelectProfile(p.id),
      });
    }

    // 5. Active Profile Layers / Channels
    activeProfile.layers.forEach((l, idx) => {
      list.push({
        id: `layer-${l.id}`,
        group: 'Layer',
        label: `Switch to ${l.name}`,
        where: l.id === activeLayer.id ? 'Current active layer' : `Channel #${idx + 1}`,
        also: `layer channel ${l.name} ch${idx + 1} layer${idx + 1}`,
        icon: <Layers className="w-4 h-4 text-[#00F0FF]" />,
        run: () => {
          onSelectLayer(l.id);
          onChangeTab('designer');
        },
      });
    });

    // 6. Active Layer Keys & Knob
    activeLayer.keys.forEach((k, idx) => {
      const actionName = k.tapAction?.name || k.label || `Switch #${idx + 1}`;
      list.push({
        id: `key-${idx}`,
        group: 'Key',
        label: `Key ${idx + 1}: ${actionName}`,
        where: `${activeLayer.name} · Switch #${idx + 1}`,
        also: `key ${idx + 1} switch button ${actionName} edit`,
        icon: <Sliders className="w-4 h-4 text-white/50" />,
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
      icon: <Volume2 className="w-4 h-4 text-[#FF5E00]" />,
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
        icon: <Volume2 className="w-4 h-4 text-[#FF5E00]" />,
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
        icon: <Volume2 className="w-4 h-4 text-red-400" />,
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
        icon: <Volume2 className="w-4 h-4 text-[#38EF7D]" />,
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
        icon: <Volume2 className="w-4 h-4 text-[#38EF7D]" />,
        run: async () => {
          await window.electronAPI?.adjustMasterVolume?.(-5);
        },
      }
    );

    // 8. Direct OBS Streaming Commands
    list.push(
      {
        id: 'obs-toggle-stream',
        group: 'OBS',
        label: 'OBS: Toggle Stream (Start / Stop)',
        where: 'OBS WebSocket v5',
        also: 'obs studio toggle stream live broadcast twitch youtube',
        icon: <Radio className="w-4 h-4 text-purple-400" />,
        run: async () => {
          await window.electronAPI?.obsCommand?.('toggle_stream');
          onTriggerAction?.('OBS Stream Toggle', 'Dispatched toggle stream to OBS WebSocket', 'info');
        },
      },
      {
        id: 'obs-toggle-record',
        group: 'OBS',
        label: 'OBS: Toggle Recording (Start / Stop)',
        where: 'OBS WebSocket v5',
        also: 'obs record recording capture video clip',
        icon: <Radio className="w-4 h-4 text-red-400" />,
        run: async () => {
          await window.electronAPI?.obsCommand?.('toggle_record');
          onTriggerAction?.('OBS Record Toggle', 'Dispatched toggle record to OBS WebSocket', 'info');
        },
      }
    );

    // 9. Shortcuts Catalog (Top ~600 popular PC shortcuts)
    const shortcutsSample: PCShortcut[] = PC_SHORTCUTS.slice(0, 400);
    for (const s of shortcutsSample) {
      list.push({
        id: `shortcut-${s.id}`,
        group: 'Shortcut',
        label: s.name,
        where: s.appName ? `${s.appName} (${s.keys.join('+')})` : s.keys.join('+'),
        also: `${s.category} ${s.description} ${s.appName || ''} ${s.keys.join(' ')}`,
        icon: <Flame className="w-4 h-4 text-amber-400" />,
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
    profiles,
    activeProfile,
    activeLayer,
    hardwareState,
    autoProfileSwitch,
    onChangeTab,
    onSelectProfile,
    onOpenProfileModal,
    onSelectLayer,
    onOpenDiagnostics,
    onOpenFirmwareModal,
    onExportProfiles,
    onToggleAutoProfileSwitch,
    onConnectHID,
    onConnectSerial,
    onDisconnectHardware,
    onSyncEEPROM,
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
      case 'Page': return 'bg-[#FF5E00]/15 text-[#FF5E00] border-[#FF5E00]/30';
      case 'Profile': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'Layer': return 'bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/30';
      case 'Key': return 'bg-white/10 text-white/80 border-white/15';
      case 'Hardware': return 'bg-[#38EF7D]/15 text-[#38EF7D] border-[#38EF7D]/30';
      case 'Audio': return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'OBS': return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'Shortcut': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'Action': return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      default: return 'bg-white/10 text-white/70 border-white/10';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
    >
      <div className="relative w-full max-w-2xl bg-[#0E1118] border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="relative px-5 py-4 border-b border-white/10 flex items-center gap-3 bg-black/40">
          <Search className="w-5 h-5 text-[#00F0FF] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, shortcut, profile, key, or page..."
            className="w-full bg-transparent text-sm text-white placeholder-white/40 focus:outline-hidden font-sans"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results-list"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-white/50 border border-white/10">
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
            <div className="py-12 px-4 text-center text-white/40 italic space-y-1">
              <div>No actions or shortcuts matching “{query.trim()}”</div>
              <div className="text-[11px] text-white/20">Try searching for "OBS", "Mute", "DaVinci", "Tester", or "EEPROM"</div>
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
                  className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#161D2C] border border-[#00F0FF]/40 text-white shadow-md'
                      : 'border border-transparent text-white/80 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate pr-2">
                    <div className="p-1.5 rounded-lg bg-black/40 border border-white/5 shrink-0">
                      {item.icon || <Command className="w-4 h-4 text-white/40" />}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full border ${getGroupBadgeColor(
                            item.group
                          )}`}
                        >
                          {item.group}
                        </span>
                        <span className="font-semibold text-xs text-white truncate">
                          {item.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-white/40 font-mono truncate max-w-[200px]">
                      {item.where}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 border-t border-white/10 bg-black/50 flex items-center justify-between text-[11px] font-mono text-white/40">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/10 text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/10 text-[10px]">↵</kbd>
              Execute
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70 border border-white/10 text-[10px]">Esc</kbd>
              Close
            </span>
          </div>

          <div className="text-[10px] text-white/30">
            {results.length} action{results.length === 1 ? '' : 's'} available
          </div>
        </div>
      </div>
    </div>
  );
};
