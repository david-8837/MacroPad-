import React, { useState, useEffect, useRef } from 'react';
import { Deck, Layer, KeyBinding, DialBinding, OLEDState, ActionDefinition, DiscoveredApp } from './types';
import { defaultDeck } from './data/defaultDeck';
import { TopNavbar } from './components/TopNavbar';
import { DigitalTwin } from './components/DigitalTwin';
import { KeyConfigDrawer } from './components/KeyConfigDrawer';
import { KnobConfigDrawer } from './components/KnobConfigDrawer';
import { DisplayConfigDrawer } from './components/DisplayConfigDrawer';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { AppLauncherPanel } from './components/AppLauncherPanel';
import { PCShortcut } from './data/pcShortcuts';
import { normalizeDeckLayers } from './utils/channelLayers';
import { getOLEDMode, isOLEDMode } from './oled/modes';
import { AUTO_CYCLE_DEFAULT_S, capacityFor } from './oled/capacity';
import {
  DEFAULT_PLAYLIST,
  clampAutoCycleS,
  nextInPlaylist,
  normalizePlaylist,
  playlistToMask,
} from './oled/playlist';

import { OSDFlyout } from './components/OSDFlyout';
import { ViaKeyTester } from './components/via/ViaKeyTester';
import { ViaLightingPanel } from './components/via/ViaLightingPanel';
import { ViaMacroEditor } from './components/via/ViaMacroEditor';
import { ViaKeycodePicker } from './components/via/ViaKeycodePicker';
import { ViaKeycodeItem } from './data/viaKeycodes';
import {
  hardwareBridge,
  HardwareConnectionState,
  ConnectedDeviceInfo,
  type UploadProgress,
  type UploadResult,
} from './utils/hardwareBridge';
import { executeDeckAction } from './utils/executeDeckAction';
import { WebhookDocPanel } from './components/WebhookDocPanel';
import { AudioMixerPanel } from './components/AudioMixerPanel';
import { DiagnosticLogDrawer, ActionHistoryEntry } from './components/DiagnosticLogDrawer';
import { FirmwareModal } from './components/FirmwareModal';
import { UploadModal } from './components/UploadModal';
import { CommandPalette } from './components/CommandPalette';
import type { ElectronHardwareEvent, NowPlayingInfo, SystemMetrics } from './types/electron';
import {
  Terminal,
  Trash2,
  Activity,
} from 'lucide-react';

const SESSION_KEY = 'kadowaz_session';
const OLED_KEY = 'kadowaz_oled';
const DECK_KEY = 'kadowaz_deck';

function loadSession(): { activeLayerId?: string } {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Only preferences are persisted. Telemetry and the media session are measured
 * every second, and a saved copy would come back stale on the next launch — the
 * panel would show yesterday's CPU load as if it were now.
 */
const OLED_PREF_KEYS = [
  'mode', 'customTitle', 'customSubtitle', 'brightness', 'inverted', 'autoCycleS', 'playlist',
] as const;

function oledPreferences(state: OLEDState): Partial<OLEDState> {
  const out: Record<string, unknown> = {};
  for (const key of OLED_PREF_KEYS) out[key] = state[key];
  return out as Partial<OLEDState>;
}

function loadOledState(fallback: OLEDState): OLEDState {
  try {
    const raw = localStorage.getItem(OLED_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<OLEDState>;
    const merged: OLEDState = { ...fallback };
    for (const key of OLED_PREF_KEYS) {
      if (saved[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = saved[key];
    }
    // Modes come and go with the catalogue; never hand the panel an unknown id.
    if (!isOLEDMode(merged.mode)) merged.mode = fallback.mode;
    // Same for the rotation: unknown ids out, in-range interval only, and the
    // saved playlist must still fit the flash region it was saved against.
    merged.playlist = normalizePlaylist(merged.playlist ?? fallback.playlist);
    merged.autoCycleS = clampAutoCycleS(merged.autoCycleS ?? AUTO_CYCLE_DEFAULT_S);
    if (!capacityFor(merged.playlist).fits) merged.playlist = normalizePlaylist(fallback.playlist);
    return merged;
  } catch {
    return fallback;
  }
}

export const App: React.FC = () => {
  // One deck. Three independent layers (Layer 1, Layer 2, Layer 3).
  const [deck, setDeck] = useState<Deck>(() => {
    const saved = localStorage.getItem(DECK_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Deck;
        if (parsed && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          return normalizeDeckLayers(parsed);
        }
      } catch { /* ignore */ }
    }
    return normalizeDeckLayers(defaultDeck);
  });

  const layers = deck.layers;
  /** Short pill label per layer, derived from its name (EDIT / TOOLS / …). */
  const layerNames = layers.map((l, i) =>
    (l.name.split(/[^A-Za-z0-9]+/).find(Boolean) || `L${i}`).toUpperCase().slice(0, 7),
  );

  /* Every save goes through these. Before this, the "save" handlers only toggled
   * the deck's lock flag and wrote a log line, so a key you assigned was never
   * actually stored — the deck always showed what it shipped with. */
  const writeActiveLayer = (mutate: (layer: Layer) => Partial<Layer>) => {
    setDeck(prev => ({
      ...prev,
      layers: prev.layers.map(l => (l.id === prev.activeLayerId ? { ...l, ...mutate(l) } : l)),
    }));
  };

  const putKey = (keyIndex: number, next: KeyBinding, layerIndex?: number) => {
    setDeck(prev => ({
      ...prev,
      layers: prev.layers.map((l, i) => {
        const target = layerIndex !== undefined ? i === layerIndex : l.id === prev.activeLayerId;
        if (!target) return l;
        return {
          ...l,
          // The first edit makes the layer yours; the EXAMPLE tag goes away.
          isExample: false,
          keys: l.keys.map(k => (k.keyIndex === keyIndex ? { ...next, keyIndex } : k)),
        };
      }),
    }));
  };

  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    const session = loadSession();
    if (session.activeLayerId && deck.layers.some((l) => l.id === session.activeLayerId)) {
      return session.activeLayerId;
    }
    return deck.activeLayerId || deck.layers[0]?.id || 'layer-edit';
  });
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(0);
  const [editingKeyBinding, setEditingKeyBinding] = useState<KeyBinding | null>(null);
  const [isEditingKnob, setIsEditingKnob] = useState<boolean>(false);
  const [isEditingDisplay, setIsEditingDisplay] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros'>('designer');
  
  // Hardware Connection State
  const [hardwareState, setHardwareState] = useState<HardwareConnectionState>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<ConnectedDeviceInfo | null>(null);
  const lastHardwareStateRef = useRef<HardwareConnectionState>('disconnected');

  // VIA Keycode Assignment Handlers
  /* QMK/VIA keycodes are what the *pad* sends. Some of them are also keys this PC
   * can type, and those become ordinary hotkey actions so the simulator works;
   * the rest (layer keys, raw HID) are stored as keycodes and say so when a
   * simulator press tries to run them on the host. */
  const viaCodeToBinding = (keyIndex: number, code: string, label: string): KeyBinding => {
    const simple: Record<string, string> = {
      KC_ESC: 'Escape', KC_ENT: 'Enter', KC_SPC: 'Space', KC_BSPC: 'Backspace',
      KC_TAB: 'Tab', KC_DEL: 'Delete', KC_INS: 'Insert', KC_HOME: 'Home', KC_END: 'End',
      KC_PGUP: 'PageUp', KC_PGDN: 'PageDown', KC_LEFT: 'Left', KC_RGHT: 'Right',
      KC_UP: 'Up', KC_DOWN: 'Down',
      KC_MPLY: 'PlayPause', KC_MNXT: 'Next', KC_MPRV: 'Prev',
      KC_VOLU: 'VolumeUp', KC_VOLD: 'VolumeDown', KC_MUTE: 'Mute',
    };
    const macro = /^M(\d+)$/.exec(code);
    let tapAction: ActionDefinition | null = null;
    let sublabel = code;

    if (macro) {
      tapAction = { id: `${code}-${keyIndex}`, category: 'script', name: `Macro ${code}`, payload: { command: `macro:${macro[1]}` } };
      sublabel = `Macro ${code}`;
    } else if (simple[code]) {
      tapAction = { id: `${code}-${keyIndex}`, category: 'hotkey', name: label, payload: { keys: [simple[code]] } };
      sublabel = label;
    } else if (/^KC_[A-Z0-9]$/.test(code)) {
      const ch = code.slice(3);
      tapAction = { id: `${code}-${keyIndex}`, category: 'hotkey', name: label, payload: { keys: [ch] } };
      sublabel = label;
    } else if (/^KC_F([1-9]|1[0-2])$/.test(code)) {
      tapAction = { id: `${code}-${keyIndex}`, category: 'hotkey', name: label, payload: { keys: [code.slice(3)] } };
      sublabel = label;
    } else {
      // Layer keys, transparent/no-op codes, anything else: the pad handles it.
      tapAction = { id: `${code}-${keyIndex}`, category: 'hotkey', name: label, payload: { keycode: code } };
    }

    return {
      keyIndex,
      label: label.slice(0, 14),
      sublabel: sublabel.slice(0, 14),
      iconName: 'Square',
      accentColor: '#1351AA',
      tapAction,
      holdAction: null,
      doubleTapAction: null,
    };
  };

  const handleAssignViaKeycode = (keyIndex: number, item: ViaKeycodeItem) => {
    putKey(keyIndex, viaCodeToBinding(keyIndex, item.code, item.label));
    handleTriggerAction('via-assign', `Assigned ${item.code} to Switch #${keyIndex + 1}`, 'info');
  };

  const handleAssignCustomCode = (keyIndex: number, rawCode: string) => {
    putKey(keyIndex, viaCodeToBinding(keyIndex, rawCode, rawCode));
    handleTriggerAction('via-custom', `Assigned Custom Keycode ${rawCode} to Switch #${keyIndex + 1}`, 'info');
  };

  const [osdVisible, setOsdVisible] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionHistoryEntry[]>([]);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isFirmwareModalOpen, setIsFirmwareModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Live OLED state
  const [oledState, setOledState] = useState<OLEDState>(() => loadOledState({
    mode: 'kadowaz',
    // Measured, so unmeasured until the first native sample arrives.
    cpuLoad: null,
    gpuLoad: null,
    ramUsage: null,
    cpuTemp: null,
    nowPlayingTrack: null,
    nowPlayingArtist: null,
    isPlaying: false,
    trackProgress: null,
    // Preferences, with the same defaults the drawer's reset button restores, so
    // the saved object always carries every field instead of leaving the drawer
    // to guess with ?? at each use.
    customTitle: 'KADOWAZ IND.',
    customSubtitle: 'ONLINE',
    brightness: 100,
    inverted: false,
    autoCycleS: AUTO_CYCLE_DEFAULT_S,
    playlist: [...DEFAULT_PLAYLIST],
  }));

  // Active layer getters
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const activeChannelIdx = Math.max(0, layers.findIndex(l => l.id === activeLayer.id));

  // Keep key editor drawer in sync when switching channels
  useEffect(() => {
    if (editingKeyBinding) {
      const k = activeLayer.keys.find(item => item.keyIndex === editingKeyBinding.keyIndex);
      if (k) setEditingKeyBinding(k);
    }
  }, [activeLayerId]);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  }, [deck]);

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ activeLayerId }));
  }, [activeLayerId]);

  // Serialised through the preference whitelist so the dependency is the
  // preference slice, not the telemetry: the panel repaints twice a second and
  // this must not write to disk twice a second.
  const oledPrefsJson = JSON.stringify(oledPreferences(oledState));
  useEffect(() => {
    localStorage.setItem(OLED_KEY, oledPrefsJson);
  }, [oledState]);

  // Tell the panel which catalogue mode is selected. The panel draws the mode
  // itself; this is only the selector, so one short line on change is enough.
  useEffect(() => {
    void hardwareBridge.sendSerialCommand(`OLED:MODE:${oledState.mode}`);
  }, [oledState.mode]);

  /* The rotation timer. Restarted whenever the screen changes, so each screen
   * gets its full dwell — the same rule oled_playlist_tick() applies on the
   * device. Rendering here only drives the previews: the real panel runs its
   * own timer off cfg_global_t.oled_auto_cycle_s. */
  const autoCycleS = clampAutoCycleS(oledState.autoCycleS ?? 0);
  const playlistKey = normalizePlaylist(oledState.playlist ?? DEFAULT_PLAYLIST).join(',');
  useEffect(() => {
    if (!autoCycleS) return;
    const t = setTimeout(() => handleCycleOLEDMode(), autoCycleS * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCycleS, playlistKey, oledState.mode]);

  /* Push the rotation settings to the panel. One short line each, only when
   * they change — the device stores them in its own config, it does not need a
   * heartbeat. */
  useEffect(() => {
    void hardwareBridge.sendSerialCommand(`OLED:AUTO:${autoCycleS}`);
  }, [autoCycleS]);

  useEffect(() => {
    const mask = playlistToMask(normalizePlaylist(oledState.playlist ?? DEFAULT_PLAYLIST));
    void hardwareBridge.sendSerialCommand(`OLED:PL:${mask}`);
  }, [playlistKey, oledState.playlist]);

  useEffect(() => {
    // Kept so the tray label and local webhook status know which deck is live.
    window.electronAPI?.reportDeck?.({ id: deck.id, name: deck.name });
  }, [deck.id, deck.name]);

  // Global Ctrl+K / Cmd+K listener for Command Palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // App Assignment Handler for Application Library & Launcher
  const handleAssignApp = (
    keyIndex: number,
    app: DiscoveredApp,
    options?: {
      customLabel?: string;
      launchArgs?: string;
      focusExisting?: boolean;
      launchMinimized?: boolean;
      channelIndex?: number;
    }
  ) => {
    const targetChannel = options?.channelIndex !== undefined ? options.channelIndex : activeChannelIdx;

    putKey(keyIndex, {
      keyIndex,
      label: (options?.customLabel || app.name).slice(0, 14),
      sublabel: 'App',
      iconName: 'Rocket',
      accentColor: '#1351AA',
      tapAction: {
        id: `app-${app.id}-${keyIndex}`,
        category: 'app_launch',
        name: app.name,
        payload: {
          appId: app.appId,
          appName: app.name,
          exePath: app.exePath,
          launchArgs: options?.launchArgs ?? app.launchArgs ?? '',
          focusExisting: options?.focusExisting ?? false,
          launchMinimized: options?.launchMinimized ?? false,
          targetType: app.targetType,
          source: app.source,
          iconDataUrl: app.iconDataUrl,
        },
      },
      holdAction: null,
      doubleTapAction: null,
    }, targetChannel);

    handleTriggerAction(
      `assign-app-${app.id}`,
      `Assigned ${app.name} to Switch #${keyIndex + 1} (Layer ${targetChannel})`,
      'info'
    );
  };

  const pushLog = (
    name: string,
    category: string,
    type: ActionHistoryEntry['type'] = 'success',
    detail?: string,
    source: ActionHistoryEntry['source'] = 'app'
  ) => {
    setActionLogs(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      at: Date.now(),
      name,
      category,
      type,
      detail,
      source,
    }, ...prev.slice(0, 199)]);
  };

  // Action Dispatcher & Native Application Launcher
  const handleTriggerAction = (actionId: string, actionName: string, category: string, payload?: any) => {
    const isSafety = actionName.includes('[SAFETY UNLOCKED]') || actionName.includes('Hold cancelled');
    pushLog(actionName, category, isSafety ? 'safety' : 'success');

    if (category === 'navigation' || category === 'info' || category === 'via-assign') {
      return;
    }

    const action: ActionDefinition = {
      id: actionId,
      category: (category as ActionDefinition['category']) || 'hotkey',
      name: actionName,
      payload: payload || {},
    };

    if (category === 'midi') {
      pushLog('MIDI output is not connected in this build. The action was logged only.', 'midi', 'info');
      return;
    }

    void executeDeckAction(action).then((res) => {
      if (!res.success && res.error) {
        if (res.error.includes('Native desktop shell')) {
          pushLog(`[PREVIEW] ${actionName} — native OS injection requires Electron`, category, 'info');
          return;
        }
        pushLog(`[ACTION FAILED] ${res.error}`, category, 'safety');
      }
    });
  };

  // Switch or Cycle Layer across the 3 Layers (Layer 1, Layer 2, Layer 3)
  // This switches the active layer so ALL 9 KEYS switch with the layer!
  const handleCycleDialMode = (explicitChannelIdx?: number) => {
    let nextIdx = 0;
    if (explicitChannelIdx !== undefined && explicitChannelIdx >= 0 && explicitChannelIdx < layers.length) {
      nextIdx = explicitChannelIdx;
    } else {
      nextIdx = (activeChannelIdx + 1) % Math.max(layers.length, 1);
    }

    const targetLayer = layers[nextIdx] || layers[0];
    if (targetLayer) {
      setActiveLayerId(targetLayer.id);

      // If drawer is open, smoothly switch drawer to inspect the same switch on the new layer!
      if (editingKeyBinding) {
        const k = targetLayer.keys.find(item => item.keyIndex === (selectedKeyIndex ?? 0));
        if (k) setEditingKeyBinding(k);
      }
    }

    // Send visual layer stepper update to physical OLED display (e.g. OLED:CH:2)
    hardwareBridge.sendSerialCommand(`OLED:CH:${nextIdx}`);

    handleTriggerAction('layer-switch', `Switched Macropad to Layer ${nextIdx} (${targetLayer?.name || `Layer ${nextIdx}`})`, 'navigation');
  };

  // Subscribe to hardware bridge status & input reports from physical microcontroller
  useEffect(() => {
    let hwDialTimer: ReturnType<typeof setTimeout> | null = null;
    let hwDialHoldTriggered = false;
    let deviceReportsHold = false;

    const unsubState = hardwareBridge.onStateChange((state, info) => {
      setHardwareState(state);
      setDeviceInfo(info);
      deviceReportsHold = state === 'connected' && info?.type === 'webserial';
      const previous = lastHardwareStateRef.current;
      lastHardwareStateRef.current = state;
      if (state === 'connected' && previous !== 'connected') {
        handleTriggerAction('mcu-conn', `Connected: ${info?.name || 'Microcontroller'}`, 'info');
      } else if (state === 'disconnected' && previous === 'connected') {
        handleTriggerAction('mcu-disc', 'Macropad disconnected', 'info');
      }
    });

    const unsubInput = hardwareBridge.onInputEvent((keyIdx, actionType) => {
      if (keyIdx >= 0 && keyIdx < 9) {
        const k = activeLayer.keys[keyIdx];
        if (!k) return;
        if (actionType === 'down') {
          if (k.isDestructiveSafety && k.safetyConfirmAction) {
            if (hwDialTimer) clearTimeout(hwDialTimer);
            const threshold = k.longPressThresholdMs || 1500;
            hwDialTimer = setTimeout(() => {
              hwDialHoldTriggered = true;
              handleTriggerAction(
                k.safetyConfirmAction!.id,
                `[SAFETY UNLOCKED] ${k.safetyConfirmAction!.name}`,
                k.safetyConfirmAction!.category,
                k.safetyConfirmAction!.payload
              );
            }, threshold);
            return;
          }
          if (k.tapAction) {
            handleTriggerAction(k.tapAction.id, `[HARDWARE] ${k.tapAction.name}`, k.tapAction.category, k.tapAction.payload);
          }
        } else if (actionType === 'up' && k.isDestructiveSafety) {
          if (hwDialTimer) {
            clearTimeout(hwDialTimer);
            hwDialTimer = null;
          }
          if (!hwDialHoldTriggered) {
            handleTriggerAction('safety-aborted', 'Hold cancelled (Threshold not met)', 'hotkey');
          }
          hwDialHoldTriggered = false;
        }
      } else if (keyIdx === 9) { // Rotary dial
        if (actionType === 'dial_cw') {
          handleTriggerAction(activeLayer.dial.cwAction.id, `[HARDWARE] ${activeLayer.dial.cwAction.name}`, activeLayer.dial.cwAction.category, activeLayer.dial.cwAction.payload);
        } else if (actionType === 'dial_ccw') {
          handleTriggerAction(activeLayer.dial.ccwAction.id, `[HARDWARE] ${activeLayer.dial.ccwAction.name}`, activeLayer.dial.ccwAction.category, activeLayer.dial.ccwAction.payload);
        } else if (actionType === 'down') {
          // Hardware switch pressed down -> Start hold detection timer
          hwDialHoldTriggered = false;
          if (hwDialTimer) clearTimeout(hwDialTimer);
          const threshold = activeLayer.dial.channelHoldThresholdMs || 800;
          if (!deviceReportsHold) {
            hwDialTimer = setTimeout(() => {
              hwDialHoldTriggered = true;
              handleCycleDialMode();
              handleTriggerAction('hw-hold-ch', `[HARDWARE HOLD] Layer Switched (${threshold}ms)`, 'navigation');
            }, threshold);
          }
        } else if (actionType === 'up') {
          // Hardware switch released
          if (hwDialTimer) {
            clearTimeout(hwDialTimer);
            hwDialTimer = null;
          }
          if (!hwDialHoldTriggered) {
            // Released early -> Instant Tap Action!
            handleTriggerAction(
              activeLayer.dial.pressAction.id,
              `[HARDWARE TAP] ${activeLayer.dial.pressAction.name}`,
              activeLayer.dial.pressAction.category,
              activeLayer.dial.pressAction.payload
            );
          }
          hwDialHoldTriggered = false;
        }
      }
    });

    const unsubChannel = hardwareBridge.onChannelSwitch((channelIdx) => {
      if (hwDialTimer) {
        clearTimeout(hwDialTimer);
        hwDialTimer = null;
      }
      hwDialHoldTriggered = true;
      handleCycleDialMode(channelIdx);
    });

    const unsubHold = hardwareBridge.onHoldSwitch(() => {
      if (hwDialTimer) {
        clearTimeout(hwDialTimer);
        hwDialTimer = null;
      }
      hwDialHoldTriggered = true;
    });

    return () => {
      unsubState();
      unsubInput();
      unsubChannel();
      unsubHold();
      if (hwDialTimer) clearTimeout(hwDialTimer);
    };
  }, [activeLayer, activeChannelIdx, layers]);

  // Live telemetry. These numbers come from the OS or they are null: there is no
  // random fallback any more, because a panel that invents a CPU load is lying in
  // the one place a user reads it as fact. In the browser preview there is no
  // native bridge, so the panel shows `--` and the drawer says why.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onSystemMetrics) return;

    const unsubscribe = api.onSystemMetrics((metrics: SystemMetrics) => {
      setOledState(prev => ({
        ...prev,
        cpuLoad: metrics.cpu ?? null,
        gpuLoad: metrics.gpu ?? null,
        ramUsage: metrics.ram ?? null,
        cpuTemp: metrics.temp ?? null,
        metricsSource: metrics.sources ?? null,
      }));
    });
    return () => unsubscribe();
  }, []);

  // Live media session (Windows SMTC): title, artist, transport state, position.
  // null means nothing is playing — the panel says NO MEDIA rather than showing a
  // track name that nobody is listening to.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMediaState) return;

    const apply = (state: NowPlayingInfo | null) => {
      setOledState(prev => ({
        ...prev,
        nowPlayingTrack: state?.title || null,
        nowPlayingArtist: state?.artist || null,
        nowPlayingApp: state?.app ?? null,
        isPlaying: Boolean(state?.isPlaying),
        trackProgress: state ? state.progress : null,
        trackPositionS: state ? state.positionS : null,
        trackDurationS: state ? state.durationS : null,
      }));
    };

    // One immediate read, so the panel is right before the first poll lands.
    api.getNowPlaying?.()
      .then(res => { if (res.ok) apply(res.value ?? null); })
      .catch(() => { /* the panel simply stays at NO MEDIA */ });

    const unsubscribe = api.onMediaState(apply);
    return () => unsubscribe();
  }, []);

  // Events from the Electron main process: tray menu, localhost webhook, launcher status.
  // A ref keeps the handler fresh without re-subscribing on every state change.
  const hardwareEventHandlerRef = useRef<(event: ElectronHardwareEvent) => void>(() => {});
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onHardwareEvent?.((event) => hardwareEventHandlerRef.current(event));
    return () => { unsubscribe?.(); };
  }, []);

  // Show transient OSD helper
  const triggerOSDFlyout = () => {
    setOsdVisible(true);
    setTimeout(() => {
      setOsdVisible(false);
    }, 2200);
  };

  // Step to the next screen in the rotation. The panel has no touchscreen, so
  // this is driven by the timer below or by an OLED NEXT action bound to a key
  // or the knob — never by clicking the screen.
  const handleCycleOLEDMode = () => {
    const next = nextInPlaylist(
      oledState.mode,
      normalizePlaylist(oledState.playlist ?? DEFAULT_PLAYLIST),
    );
    if (next === oledState.mode) return; // single-screen rotation
    setOledState(prev => ({ ...prev, mode: next }));
    handleTriggerAction('oled-cycle', `OLED Mode: ${getOLEDMode(next).label.toUpperCase()}`, 'navigation');
  };

  // Layer selection
  const handleSelectLayer = (id: string) => {
    setActiveLayerId(id);
    triggerOSDFlyout();
  };

  // Export deck to JSON
  const handleExportDeck = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(deck, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `kadowaz_deck_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    handleTriggerAction('export', 'Exported deck configuration to JSON', 'info');
  };

  // Key save handler
  const handleSaveKey = (updated: KeyBinding) => {
    putKey(updated.keyIndex, updated);
    handleTriggerAction('key-save', `Saved Switch #${updated.keyIndex + 1} (${updated.label})`, 'info');
  };

  // Dial / Rotary Encoder Save handler
  const handleSaveDial = (updatedDial: DialBinding) => {
    writeActiveLayer(() => ({ dial: updatedDial, isExample: false }));
    handleTriggerAction('dial-save', `Saved Dial Configuration (${updatedDial.activeModeName})`, 'info');
  };

  /*
   * Upload to the pad.
   *
   * This is now a real config upload: read the pad's current config (so its
   * gesture timings, OLED playlist and lighting survive), replace the nine keys
   * and four knob slots on each of the four layers, stream the 2268-byte blob as
   * SET_CONFIG chunks, then COMMIT. It reports what the pad acknowledged, and
   * names the bindings that stayed on the PC instead of pretending they went.
   */
  const handleSyncEEPROM = async (
    onProgress?: (p: UploadProgress) => void,
  ): Promise<UploadResult> => {
    if (layers.length < 4) {
      const message = 'The deck must contain all 4 layers (Layer 0–3)';
      handleTriggerAction('sync-fail', message, 'safety');
      return { ok: false, message, mapped: 0, unsupported: [] };
    }

    const summary = layers
      .map((layer, chIdx) => `Layer ${chIdx}: ${layer.keys.filter((k) => k.tapAction).length}/9 keys`)
      .join(' • ');
    handleTriggerAction('sync-start', `Uploading — ${summary}`, 'info');

    const result = await hardwareBridge.uploadDeck(deck, (p) => {
      onProgress?.(p);
      if (p.phase === 'committing') {
        pushLog(`[UPLOAD] ${p.total}/${p.total} config chunks sent, committing to flash`, 'hardware', 'info');
      }
    });

    if (!result.ok) {
      handleTriggerAction('sync-fail', result.message, 'safety');
      return result;
    }

    const pcOnly = result.unsupported;
    const detail = pcOnly.length
      ? ` ${pcOnly.length} binding${pcOnly.length === 1 ? '' : 's'} stay on the PC: ` +
        pcOnly.slice(0, 3).map((u) => `${u.name} (Layer ${u.layer} ${u.where})`).join(', ') +
        (pcOnly.length > 3 ? `, +${pcOnly.length - 3} more` : '')
      : '';
    handleTriggerAction('sync-eeprom', result.message + detail, 'info');
    return result;
  };

  // Runs a webhook request against the CURRENT deck state. Requests were already
  // authenticated and validated by the main process (electron/webhookServer.cjs).
  const handleWebhookRequest = (endpoint: string, data: Record<string, unknown>) => {
    const note = (msg: string, type: ActionHistoryEntry['type'] = 'info') => pushLog(`[WEBHOOK] ${msg}`, 'webhook', type);
    const run = (action: ActionDefinition | null | undefined, label: string) => {
      if (!action) {
        note(`${label}: no action assigned`);
        return;
      }
      handleTriggerAction(action.id, `[WEBHOOK] ${action.name}`, action.category, action.payload);
    };

    switch (endpoint) {
      case '/api/v1/trigger': {
        const index = Number(data.index);
        const key = activeLayer.keys.find(k => k.keyIndex === index);
        if (!key) {
          note(`Switch #${index + 1} not found on this layer`, 'safety');
          return;
        }
        if (key.isDestructiveSafety) {
          // Safety isolation exists so destructive actions need an intentional physical hold.
          note(`Blocked: Switch #${index + 1} is safety-isolated and can only be run by a physical hold`, 'safety');
          return;
        }
        const which = typeof data.action === 'string' ? data.action : 'tap';
        const action = which === 'hold' ? key.holdAction : which === 'double' ? key.doubleTapAction : key.tapAction;
        run(action, `Switch #${index + 1} ${which}`);
        return;
      }
      case '/api/v1/dial': {
        const dial = activeLayer.dial;
        if (data.direction === 'press') {
          run(dial.pressAction, 'Knob press');
          return;
        }
        const steps = Math.min(10, Math.max(1, Math.floor(Number(data.step)) || 1));
        const action = data.direction === 'ccw' ? dial.ccwAction : dial.cwAction;
        for (let i = 0; i < steps; i++) run(action, `Knob ${String(data.direction)}`);
        return;
      }
      case '/api/v1/oled': {
        // Strip control characters so a payload cannot inject extra serial commands.
        const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim() : undefined);
        const line1 = clean(data.line1);
        const line2 = clean(data.line2);
        setOledState(prev => ({
          ...prev,
          mode: 'kadowaz',
          customTitle: line1 ?? prev.customTitle,
          customSubtitle: line2 ?? prev.customSubtitle,
        }));
        void hardwareBridge.sendSerialCommand(`OLED:${[line1, line2].filter(Boolean).join(' ')}`);
        note(`OLED text set${hardwareState === 'connected' ? '' : ' (on-screen preview only, no device connected)'}`);
        return;
      }
      case '/api/v1/action': {
        // The only selector this build accepts: a 0-3 layer index. The main
        // process validates it (electron/webhookServer.cjs), so all that is left
        // is stepping the rotation.
        if (typeof data.channel === 'number') handleCycleDialMode(data.channel);
        return;
      }
      default:
        note(`Unhandled endpoint ${endpoint}`, 'safety');
    }
  };

  hardwareEventHandlerRef.current = (event) => {
    if (event.source === 'webhook' && event.endpoint) {
      handleWebhookRequest(event.endpoint, event.data || {});
    } else if (event.source === 'app-launcher' && event.status === 'error') {
      pushLog(`[ACTION FAILED] ${event.error || 'App launch failed'}`, 'app_launch', 'safety');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#E3E2DE] text-[#141414] overflow-hidden">
      {/* Top Application Navbar */}
      <TopNavbar
        deckName={deck.name}
        onTriggerOSD={triggerOSDFlyout}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        hardwareState={hardwareState}
        deviceInfo={deviceInfo}
        onConnectHID={() => hardwareBridge.connectHID()}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onSyncEEPROM={handleSyncEEPROM}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenFirmwareModal={() => setIsFirmwareModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />


      {/* ── LABEL RAIL · cols 1–2 of the 12-col workspace ─────────────
           The system's sidebar register: metadata only, never content. */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[228px] shrink-0 border-r border-[#C7C7C7] flex flex-col overflow-y-auto bg-[#E3E2DE]">

          {/* deck block */}
          <div className="px-4 pt-4 pb-3 border-b border-[#C7C7C7]">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Deck</span>
              <span className={`mark ${deck.isLocked ? 'mark--on' : 'mark--off'}`} />
            </div>
            <p className="mt-2 text-[13px] font-bold leading-tight tracking-[-0.02em] text-[#141414]">
              {deck.name}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#646464]">
              {deck.isLocked ? 'LOCKED' : 'EDITABLE'} · {layers.length} LAYERS · {layers[0]?.keys.length ?? 0} KEYS
            </p>
            <button
              onClick={() => setDeck(prev => ({ ...prev, isLocked: !prev.isLocked }))}
              className="mt-2 w-full border border-[#C7C7C7] px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#444343] hover:bg-[#141414] hover:text-[#E3E2DE] hover:border-[#141414] transition-colors"
            >
              {deck.isLocked ? 'Unlock deck' : 'Lock deck'}
            </button>
          </div>

          {/* layer register */}
          <div className="px-4 py-3 border-b border-[#C7C7C7]">
            <div className="flex items-center justify-between mb-2">
              <span className="eyebrow">Layers</span>
              <span className="idx">{`0${Math.max(layers.findIndex(l => l.id === activeLayer.id), 0)}`}</span>
            </div>
            <div className="flex flex-col">
              {layers.map((l, i) => {
                const on = l.id === activeLayer.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => handleSelectLayer(l.id)}
                    className={`group flex items-start gap-2.5 py-2 text-left border-t border-[#E3E2DE] transition-colors duration-300 ${
                      on ? 'text-[#1351AA]' : 'text-[#444343] hover:text-[#141414]'
                    }`}
                  >
                    <span className={`font-mono text-[9px] pt-[3px] tracking-[0.1em] ${on ? 'text-[#1351AA]' : 'text-[#646464]'}`}>
                      {`0${i}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${on ? 'text-[#1351AA]' : ''}`}>
                          {l.badge || l.name}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#646464] truncate">
                          {l.name}
                        </span>
                        {l.isExample && (
                          <span className="ml-auto shrink-0 border border-[#C7C7C7] px-1 py-[1px] font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#646464]">
                            Example
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-[9px] text-[#646464] truncate">
                        {l.keys.length} KEYS · {l.dial.label.slice(0, 16)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* hardware readout */}
          <div className="px-4 py-3 border-b border-[#C7C7C7]">
            <div className="flex items-center justify-between mb-2">
              <span className="eyebrow">Hardware</span>
              <span className={`mark ${hardwareState === 'connected' ? 'mark--on' : 'mark--off'}`} />
            </div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#444343] leading-relaxed">
              {hardwareState === 'connected'
                ? (deviceInfo?.name || 'DEVICE LINKED')
                : 'NO DEVICE · SIMULATOR'}
            </p>
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="mt-2 w-full flex items-center justify-between border border-[#C7C7C7] px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#444343] hover:bg-[#141414] hover:text-[#E3E2DE] hover:border-[#141414] transition-colors"
            >
              Diagnostics
              <Terminal className="w-3 h-3" />
            </button>
          </div>

          {/* foot */}
          <div className="mt-auto px-4 py-3 border-t border-[#C7C7C7]">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#646464] leading-relaxed">
              Kadowaz deck studio<br />
              12-col grid · build 2.4.1
            </p>
          </div>
        </aside>

        {/* ── CONTENT · cols 3–12 ─────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

        {/* TAB 1: DECK STUDIO */}
        {activeTab === 'designer' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Digital Twin & Hardware Simulator + VIA Quick Tray */}
            <div className="flex-1 flex flex-col items-center justify-start p-6 border-r border-[#E3E2DE] overflow-y-auto space-y-4">
              <DigitalTwin
                layer={activeLayer}
                channelIndex={activeChannelIdx}
                layerNames={layerNames}
                oledState={oledState}
                deckName={deck.name}
                selectedKeyIndex={selectedKeyIndex}
                isDrawerKeyOpen={Boolean(editingKeyBinding)}
                isDrawerKnobOpen={isEditingKnob}
                isDrawerDisplayOpen={isEditingDisplay}
                onSelectKey={(idx) => {
                  setSelectedKeyIndex(idx);
                  const k = activeLayer.keys.find(item => item.keyIndex === idx);
                  // If drawer is already open, tapping any key on macropad switches drawer to edit that key!
                  if (editingKeyBinding && k) {
                    setEditingKeyBinding(k);
                  }
                }}
                onOpenDrawer={(idx) => {
                  setIsEditingKnob(false);
                  setIsEditingDisplay(false);
                  const targetIdx = idx ?? selectedKeyIndex ?? 0;
                  setSelectedKeyIndex(targetIdx);
                  const k = activeLayer.keys.find(item => item.keyIndex === targetIdx);
                  if (k) setEditingKeyBinding(k);
                }}
                onOpenKnobDrawer={() => {
                  setEditingKeyBinding(null);
                  setIsEditingDisplay(false);
                  setIsEditingKnob(true);
                }}
                onOpenDisplayDrawer={() => {
                  setEditingKeyBinding(null);
                  setIsEditingKnob(false);
                  setIsEditingDisplay(true);
                }}
                onOpenUploadModal={() => setIsUploadModalOpen(true)}
                onTriggerAction={handleTriggerAction}
                onCycleDialMode={handleCycleDialMode}
                connectionStatus={hardwareState === 'connected' ? 'usb_connected' : 'simulator'}
                onToggleConnection={() => {
                  if (hardwareState === 'connected') {
                    hardwareBridge.disconnect();
                  } else {
                    hardwareBridge.connectHID();
                  }
                }}
              />

              {/* VIA quick keycode tray */}
              <div className="w-full max-w-[600px] mt-6">
                <ViaKeycodePicker
                  selectedKeyIndex={selectedKeyIndex}
                  onAssignKeycode={handleAssignViaKeycode}
                  onAssignCustomCode={handleAssignCustomCode}
                />
              </div>
            </div>

            {/* Right Column: Key Config Drawer OR Knob Config Drawer OR Display Config Drawer OR Switch Inspector + Telemetry */}
            <div className={`w-[560px] xl:w-[620px] 2xl:w-[680px] shrink-0 flex flex-col bg-[#FFFFFF] overflow-hidden border-l border-[#E3E2DE] ${
 editingKeyBinding || isEditingKnob || isEditingDisplay ? '' : 'p-4'
 }`}>
              {editingKeyBinding ? (
                <KeyConfigDrawer
                  keyBinding={editingKeyBinding}
                  totalKeys={activeLayer.keys.length}
                  onSelectKeyIndex={(idx) => {
                    setSelectedKeyIndex(idx);
                    const k = activeLayer.keys.find(item => item.keyIndex === idx);
                    if (k) setEditingKeyBinding(k);
                  }}
                  onSave={handleSaveKey}
                  onClose={() => setEditingKeyBinding(null)}
                  onTestAction={(act) => handleTriggerAction(act.id, act.name, act.category, act.payload)}
                />
              ) : isEditingKnob ? (
                <KnobConfigDrawer
                  dial={activeLayer.dial}
                  onSave={handleSaveDial}
                  onClose={() => setIsEditingKnob(false)}
                  onTriggerAction={handleTriggerAction}
                  onSelectChannel={(idx) => handleCycleDialMode(idx)}
                />
              ) : isEditingDisplay ? (
                <DisplayConfigDrawer
                  oledState={oledState}
                  onUpdateOLEDState={(updated) => setOledState(prev => ({
                    // The drawer edits preferences; measured fields stay whatever
                    // the last native sample said, so saving cannot stamp a stale
                    // telemetry reading back over the live one.
                    ...prev,
                    ...oledPreferences(updated),
                  }))}
                  onClose={() => setIsEditingDisplay(false)}
                  deckName={deck.name}
                  activeLayerName={activeLayer.name}
                  activeLayerIndex={activeChannelIdx}
                  layerCount={layers.length}
                  onTriggerAction={handleTriggerAction}
                />
              ) : (
                <>
                  {/* Selected key: a spec sheet, not a card */}
                  <div className="panel mb-4">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]">
                      <div className="flex items-baseline gap-2">
                        <span className="eyebrow eyebrow--ink">Switch</span>
                        <span className="idx">
                          {selectedKeyIndex !== null ? `0${selectedKeyIndex + 1} / 09` : '—'}
                        </span>
                      </div>
                      {selectedKeyIndex !== null && (
                        <button
                          onClick={() => {
                            setIsEditingKnob(false);
                            const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                            if (k) setEditingKeyBinding(k);
                          }}
                          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1351AA] hover:text-[#141414] transition-colors"
                        >
                          Remap &amp; record
                        </button>
                      )}
                    </div>

                    {selectedKeyIndex !== null ? (
                      (() => {
                        const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                        if (!k) return null;
                        const rows = [
                          { label: 'Legend', value: k.label, mono: false },
                          { label: 'Shortcut', value: k.tapAction?.name || 'Unassigned', mono: true },
                          { label: 'Category', value: (k.tapAction?.category || 'none').replace(/_/g, ' '), mono: true },
                        ];
                        return (
                          <div>
                            {rows.map((r) => (
                              <div
                                key={r.label}
                                className="flex items-center justify-between gap-4 px-3 py-[7px] border-b border-[#E3E2DE] last:border-b-0"
                              >
                                <span className="eyebrow shrink-0">{r.label}</span>
                                <span
                                  className={`text-right truncate ${
                                    r.mono
                                      ? 'font-mono text-[10.5px] text-[#1351AA]'
                                      : 'text-[12px] font-semibold text-[#141414]'
                                  }`}
                                >
                                  {r.value}
                                </span>
                              </div>
                            ))}
                            {k.isDestructiveSafety && (
                              <div className="flex items-center justify-between gap-4 px-3 py-[7px] bg-[#141414]">
                                <span className="eyebrow eyebrow--cream">Safety hold</span>
                                <span className="font-mono text-[10.5px] text-[#E3E2DE]">
                                  {((k.longPressThresholdMs || 1500) / 1000).toFixed(1)}s required
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <p className="px-3 py-3 text-[11px] text-[#646464] leading-relaxed">
                        Select a switch on the deck to inspect its binding, record a new shortcut, or set a hold-to-confirm.
                      </p>
                    )}
                  </div>

                  {/* Real Windows WASAPI Audio Mixer */}
                  <details className="panel mb-4">
                    <summary className="px-3 py-2 cursor-pointer select-none flex items-center justify-between border-b border-[#E3E2DE]">
                      <span className="eyebrow eyebrow--ink">Audio mixer</span>
                      <span className="idx">WASAPI</span>
                    </summary>
                    <div className="p-2 pt-0">
                      <AudioMixerPanel />
                    </div>
                  </details>

                  {/* Localhost webhook API (collapsed by default) */}
                  <details className="panel mb-4">
                    <summary className="px-3 py-2 cursor-pointer select-none flex items-center justify-between border-b border-[#E3E2DE]">
                      <span className="eyebrow eyebrow--ink">Webhook API</span>
                      <span className="idx">localhost</span>
                    </summary>
                    <div className="px-2 pb-2 max-h-80 overflow-y-auto">
                      <WebhookDocPanel onRunLocally={handleWebhookRequest} />
                    </div>
                  </details>

                  {/* Telemetry: a mono readout table, hairline rows */}
                  <div className="flex-1 panel flex flex-col overflow-hidden min-h-[160px]">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7] shrink-0">
                      <div className="flex items-baseline gap-2">
                        <span className="eyebrow eyebrow--ink">Telemetry</span>
                        <span className="idx">{String(actionLogs.length).padStart(2, '0')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setIsDiagnosticsOpen(true)}
                          title="Open full diagnostics & history"
                          className="w-6 h-6 flex items-center justify-center border border-[#E3E2DE] text-[#646464] hover:border-[#141414] hover:bg-[#141414] hover:text-[#E3E2DE] transition-colors"
                        >
                          <Activity className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setActionLogs([])}
                          title="Clear log"
                          className="w-6 h-6 flex items-center justify-center border border-[#E3E2DE] text-[#646464] hover:border-[#141414] hover:bg-[#141414] hover:text-[#E3E2DE] transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      {actionLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-2 py-8">
                          <span className="mark mark--off" />
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#646464]">
                            Awaiting key events
                          </p>
                        </div>
                      ) : (
                        actionLogs.map(log => (
                          <div
                            key={log.id}
                            className={`flex items-center justify-between gap-3 px-3 py-[6px] border-b border-[#E3E2DE] last:border-b-0 ${
                              log.type === 'safety' ? 'bg-[#141414]' : 'hover:bg-[#EDECE8]'
                            } transition-colors`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`font-mono text-[9px] shrink-0 ${log.type === 'safety' ? 'text-[#C7C7C7]' : 'text-[#646464]'}`}>
                                {log.timestamp}
                              </span>
                              <span className={`text-[11px] truncate ${log.type === 'safety' ? 'text-[#E3E2DE] font-semibold' : 'text-[#141414]'}`}>
                                {log.name}
                              </span>
                            </span>
                            <span className={`font-mono text-[8.5px] uppercase tracking-[0.1em] shrink-0 ${log.type === 'safety' ? 'text-[#C7C7C7]' : 'text-[#646464]'}`}>
                              {log.category}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: VIA KEY MATRIX TESTER */}
        {activeTab === 'tester' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <div className="w-full max-w-4xl">
              <ViaKeyTester />
            </div>
          </div>
        )}



        {/* TAB 3: PC SHORTCUTS VAULT */}
        {activeTab === 'shortcuts' && (
          <div className="flex-1 overflow-y-auto">
            <ShortcutsPanel />
          </div>
        )}

        {/* APPLICATION LIBRARY & SMART LAUNCHER — palette-only page, no nav tab */}
        {activeTab === 'apps' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-4 px-4 h-9 shrink-0 border-b border-[#C7C7C7] bg-[#EDECE8]">
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#141414]">
                  Application Library
                </span>
                <span className="font-mono text-[9px] tracking-[0.1em] text-[#646464] truncate">
                  NO NAV TAB · CTRL+K TO REACH IT · PICK A KEY, THEN A PROGRAM
                </span>
              </div>
              <button
                onClick={() => setActiveTab('designer')}
                className="shrink-0 h-6 px-2 border border-[#C7C7C7] bg-[#FFFFFF] font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#444343] hover:border-[#141414] hover:text-[#141414] transition-colors"
              >
                ← Studio
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AppLauncherPanel
                selectedKeyIndex={selectedKeyIndex}
                onAssignApp={handleAssignApp}
                onTriggerAction={handleTriggerAction}
                activeChannelIndex={activeChannelIdx}
                onSelectChannel={handleCycleDialMode}
              />
            </div>
          </div>
        )}

        {/* TAB 5: VIA LIGHTING STUDIO */}
        {activeTab === 'lighting' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <div className="w-full max-w-4xl">
              <ViaLightingPanel />
            </div>
          </div>
        )}

        {/* TAB 5: VIA MACRO STUDIO */}
        {activeTab === 'macros' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <ViaMacroEditor onTriggerAction={handleTriggerAction} />
          </div>
        )}

        </div>
      </div>

      {/* Transient OSD Overlay */}
      <OSDFlyout
        layer={activeLayer}
        deckName={deck.name}
        isVisible={osdVisible}
        onClose={() => setOsdVisible(false)}
      />

      {/* Full Diagnostics & Action History Drawer */}
      <DiagnosticLogDrawer
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        actionHistory={actionLogs}
        onClearHistory={() => setActionLogs([])}
        onOpenFirmwareModal={() => {
          setIsDiagnosticsOpen(false);
          setIsFirmwareModalOpen(true);
        }}
      />

      {/* RP2040 UF2 Firmware Flasher Modal */}
      <FirmwareModal
        isOpen={isFirmwareModalOpen}
        onClose={() => setIsFirmwareModalOpen(false)}
      />

      {/* Upload All Configuration to Physical Macropad Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        deck={deck}
        hardwareState={hardwareState}
        deviceInfo={deviceInfo}
        onConnectHID={() => hardwareBridge.connectHID()}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onSyncEEPROM={handleSyncEEPROM}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        deck={deck}
        activeLayer={activeLayer}
        onSelectLayer={handleSelectLayer}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenFirmwareModal={() => setIsFirmwareModalOpen(true)}
        onExportDeck={handleExportDeck}
        hardwareState={hardwareState}
        onConnectHID={() => hardwareBridge.connectHID()}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onSyncEEPROM={handleSyncEEPROM}
        onSelectKey={(idx) => {
          setSelectedKeyIndex(idx);
          const k = activeLayer.keys[idx];
          if (k) setEditingKeyBinding(k);
        }}
        onSelectKnob={() => setIsEditingKnob(true)}
        onTriggerAction={(name, detail, type) => pushLog(name, 'palette', type, detail)}
      />
    </div>
  );
};
