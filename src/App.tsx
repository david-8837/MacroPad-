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
import { deckIsLocked, editDeckWhenUnlocked } from './utils/deckLock';
import { getOLEDMode, isOLEDMode, OLED_MODE_IDS, type OLEDMode } from './oled/modes';
import { startOledStreaming, type OledStreamSnapshot } from './oled/streamer';
import { AUTO_CYCLE_DEFAULT_S, capacityFor } from './oled/capacity';
import {
  DEFAULT_PLAYLIST,
  clampAutoCycleS,
  nextInPlaylist,
  normalizePlaylist,
} from './oled/playlist';

import { OSDFlyout } from './components/OSDFlyout';
import { ViaKeyTester } from './components/via/ViaKeyTester';
import { ViaLightingPanel } from './components/via/ViaLightingPanel';
import { ViaMacroEditor } from './components/via/ViaMacroEditor';
import { ViaKeycodePicker } from './components/via/ViaKeycodePicker';
import type { ViaKeycodeItem } from './data/viaKeycodes';
import { viaItemToBinding } from './utils/viaBindings';
import {
  hardwareBridge,
  HardwareConnectionState,
  ConnectedDeviceInfo,
  type UploadProgress,
  type UploadResult,
  type UploadOptions,
} from './utils/hardwareBridge';
import { executeDeckAction } from './utils/executeDeckAction';
import { routePhysicalAction } from './utils/physicalActionRouter';
import { WebhookDocPanel } from './components/WebhookDocPanel';
import { AudioMixerPanel } from './components/AudioMixerPanel';
import { HardwareDiagnosticsPanel, ActionHistoryEntry } from './components/HardwareDiagnosticsPanel';
import { FirmwarePanel } from './components/FirmwarePanel';
import { UploadSheet } from './components/UploadSheet';
import { CommandPalette } from './components/CommandPalette';
import type { ElectronHardwareEvent, NowPlayingInfo, SystemMetrics } from './types/electron';
import {
  Trash2,
  Activity,
  ChevronDown,
  Zap,
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
    merged.brightness = typeof merged.brightness === 'number' && Number.isFinite(merged.brightness)
      ? Math.max(0, Math.min(100, Math.round(merged.brightness))) : fallback.brightness;
    merged.inverted = typeof merged.inverted === 'boolean' ? merged.inverted : fallback.inverted;
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
  // The deck's activeLayerId is the ONE selected layer for display and edits.
  // Adopt the older separate session preference once when loading a deck, then
  // keep it in sync with the deck so changing layers cannot edit another page.
  const [deck, setDeck] = useState<Deck>(() => {
    let restored = normalizeDeckLayers(defaultDeck);
    const saved = localStorage.getItem(DECK_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Deck;
        if (parsed && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
          restored = normalizeDeckLayers(parsed);
        }
      } catch { /* ignore */ }
    }
    const selected = loadSession().activeLayerId;
    return selected && restored.layers.some((l) => l.id === selected)
      ? { ...restored, activeLayerId: selected }
      : restored;
  });

  const activeLayerId = deck.activeLayerId;
  const setActiveLayerId = (id: string) => setDeck(prev =>
    prev.activeLayerId === id || !prev.layers.some((l) => l.id === id)
      ? prev
      : { ...prev, activeLayerId: id },
  );
  const layers = deck.layers;
  /** Short pill label per layer, derived from its name (EDIT / TOOLS / …). */
  const layerNames = layers.map((l, i) =>
    (l.name.split(/[^A-Za-z0-9]+/).find(Boolean) || `L${i}`).toUpperCase().slice(0, 7),
  );

  /* All deck-binding writes use a functional lock guard. The handler also
   * checks before claiming a save: the state guard closes the queued-update
   * race and protects every caller of these shared mutators. */
  const writeActiveLayer = (mutate: (layer: Layer) => Partial<Layer>) => {
    setDeck(prev => editDeckWhenUnlocked(prev, current => ({
      ...current,
      layers: current.layers.map(l => (l.id === current.activeLayerId ? { ...l, ...mutate(l) } : l)),
    })));
  };

  const putKey = (keyIndex: number, next: KeyBinding, layerIndex?: number) => {
    setDeck(prev => editDeckWhenUnlocked(prev, current => ({
      ...current,
      layers: current.layers.map((l, i) => {
        const target = layerIndex !== undefined ? i === layerIndex : l.id === current.activeLayerId;
        if (!target) return l;
        return {
          ...l,
          // The first edit makes the layer yours; the EXAMPLE tag goes away.
          isExample: false,
          keys: l.keys.map(k => (k.keyIndex === keyIndex ? { ...next, keyIndex } : k)),
        };
      }),
    })));
  };

  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(0);
  const [editingKeyBinding, setEditingKeyBinding] = useState<KeyBinding | null>(null);
  const [isEditingKnob, setIsEditingKnob] = useState<boolean>(false);
  const [isEditingDisplay, setIsEditingDisplay] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros'>('designer');
  
  // Hardware Connection State
  const [hardwareState, setHardwareState] = useState<HardwareConnectionState>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<ConnectedDeviceInfo | null>(null);
  /* Editor selection is independent of the pad's active channel. There is no
   * GET_CHANNEL in protocol v3; until a CHANNEL_CHANGE event arrives the actual
   * channel is unknown, not the editor's last selection or saved boot channel. */
  const [padChannelIndex, setPadChannelIndex] = useState<number | null>(null);
  const lastHardwareStateRef = useRef<HardwareConnectionState>('disconnected');

  // Quick assignments come from one reviewed MPAD3 mapper. Raw QMK strings
  // were offered by the old tray but neither our firmware nor desktop runs them.
  const handleAssignViaKeycode = (keyIndex: number, item: ViaKeycodeItem) => {
    if (deckIsLocked(deck)) {
      pushLog('[DECK LOCKED] Unlock deck to change quick assignments', 'deck', 'info');
      return;
    }
    const mapped = viaItemToBinding(keyIndex, item);
    if ('error' in mapped) {
      pushLog(`[NOT ASSIGNED] ${mapped.error}`, 'hardware', 'error');
      return;
    }
    putKey(keyIndex, mapped.binding);
    handleTriggerAction('via-assign', mapped.description, 'info');
  };

  const [osdVisible, setOsdVisible] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionHistoryEntry[]>([]);
  const [isHardwareDiagnosticsExpanded, setIsHardwareDiagnosticsExpanded] = useState(false);
  const hardwareDiagnosticsRef = useRef<HTMLDetailsElement>(null);
  const [isFirmwareExpanded, setIsFirmwareExpanded] = useState(false);
  const firmwareDisclosureRef = useRef<HTMLDetailsElement>(null);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const [isDeckUploadBusy, setIsDeckUploadBusy] = useState(false);
  const uploadBusyRef = useRef(false);
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
    brightness: 56, // SSD1306 reset contrast 0x8F maps to 56% of 0..255
    inverted: false,
    autoCycleS: AUTO_CYCLE_DEFAULT_S,
    playlist: [...DEFAULT_PLAYLIST],
  }));

  // Active layer getters
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const activeChannelIdx = Math.max(0, layers.findIndex(l => l.id === activeLayer.id));
  /* Serial frames read this on a 200ms timer, independently of RAF and drawer
   * visibility. The callback never captures stale layer/media/metrics values. */
  const oledStreamSnapshot = useRef<OledStreamSnapshot>({
    state: oledState, deckName: deck.name, layerName: activeLayer.name,
    layerIndex: activeChannelIdx, layerCount: layers.length,
  });
  oledStreamSnapshot.current = {
    state: oledState, deckName: deck.name, layerName: activeLayer.name,
    layerIndex: activeChannelIdx, layerCount: layers.length,
  };
  const modeFromPadRef = useRef<OLEDMode | null>(null);

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
  }, [oledPrefsJson]);

  // The pad owns mode selection during automatic rotation or an OLED_NEXT
  // gesture. Do not echo its MODE_EVENT back as another selection (which would
  // restart its dwell timer and prevent autonomy). A UI click uses a confirmed
  // binary command; a busy save retries that latest choice instead of silently
  // dropping an unacknowledged ASCII line.
  useEffect(() => {
    const padSelected = modeFromPadRef.current === oledState.mode;
    modeFromPadRef.current = null;
    if (padSelected || OLED_MODE_IDS.indexOf(oledState.mode) < 0) return;
    const selected = oledState.mode;
    const hadVerifiedPad = !!hardwareBridge.protocol?.hasOledStream;
    void hardwareBridge.selectOledMode(selected).then(ok => {
      if (ok || oledStreamSnapshot.current.state.mode !== selected) return;
      if (hadVerifiedPad) {
        const physical = hardwareBridge.physicalOledMode;
        pushLog(`[OLED] Mode ${selected} was not confirmed on the pad`, 'display', 'error');
        if (physical && physical !== selected) {
          modeFromPadRef.current = physical;
          setOledState(prev => prev.mode === selected ? { ...prev, mode: physical } : prev);
        }
      } else if (hardwareBridge.protocol?.hasOled) {
        pushLog(`[OLED] Mode ${selected} could not be sent; the PC preview changed only`, 'display', 'error');
      }
    });
  }, [oledState.mode]);

  // A dedicated CDC producer, not the preview canvas: it runs with the drawer
  // closed or hidden and stops on disconnect. Baked loops always run on-pad.
  const streamReady = hardwareState === 'connected' && !!deviceInfo?.protocolReady &&
    !!deviceInfo.hasOledStream;
  useEffect(() => {
    if (!streamReady) return;
    return startOledStreaming(
      () => oledStreamSnapshot.current,
      (mode, pages) => hardwareBridge.streamOledFrame(mode, pages),
      (err) => pushLog(`[OLED STREAM] ${err instanceof Error ? err.message : String(err)} — retrying`, 'display', 'error'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamReady]);

  /* The rotation timer. Restarted whenever the screen changes, so each screen
   * gets its full dwell — the same rule oled_playlist_tick() applies on the
   * device. Rendering here only drives the previews: the real panel runs its
   * own timer off cfg_global_t.oled_auto_cycle_s. */
  const autoCycleS = clampAutoCycleS(oledState.autoCycleS ?? 0);
  const playlistKey = normalizePlaylist(oledState.playlist ?? DEFAULT_PLAYLIST).join(',');
  useEffect(() => {
    // The SSD1306 rotates itself from its saved settings. A second PC timer
    // would repeatedly force OLED:MODE and prevent its autonomous rotation.
    if (!autoCycleS || (deviceInfo?.protocolReady && deviceInfo.hasOled)) return;
    const t = setTimeout(() => handleCycleOLEDMode(), autoCycleS * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCycleS, playlistKey, oledState.mode, deviceInfo?.protocolReady, deviceInfo?.hasOled]);

  /* Do NOT send OLED:AUTO/PL on every preview edit: those commands mutate the
   * pad's RAM without a flash commit and can race a binary config readback.
   * Only the explicit Save button writes rotation settings to flash. */
  useEffect(() => {
    if (hardwareState !== 'connected' || !deviceInfo?.protocolReady ||
        !deviceInfo.hasFlash || !deviceInfo.hasOled) return;
    let cancelled = false;
    const { mode: modeAtRead, ...otherPrefsAtRead } = oledPreferences(oledState);
    void hardwareBridge.readDisplaySettings().then(settings => {
      if (!cancelled) setOledState(prev => {
        const { mode: currentMode, ...otherPrefs } = oledPreferences(prev);
        if (JSON.stringify(otherPrefs) !== JSON.stringify(otherPrefsAtRead)) return prev;
        const { mode: storedBootMode, ...storedSettings } = settings;
        return {
          ...prev,
          ...storedSettings,
          // v2 GET_OLED_STATE/MODE_EVENT owns the live cursor. GET_CONFIG only
          // supplies saved *boot* settings; a late read must never snap the
          // preview back to a stale boot screen or erase a local click.
          mode: deviceInfo.hasOledStream || currentMode !== modeAtRead ? prev.mode : storedBootMode,
        };
      });
    }).catch(err => {
      if (!cancelled) pushLog(`[OLED] Could not read stored display settings: ${err instanceof Error ? err.message : String(err)}`, 'display', 'error');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardwareState, deviceInfo?.protocolReady, deviceInfo?.hasFlash, deviceInfo?.hasOled, deviceInfo?.hasOledStream]);

  useEffect(() => {
    // Kept so the tray label and local webhook status know which deck is live.
    window.electronAPI?.reportDeck?.({ id: deck.id, name: deck.name });
  }, [deck.id, deck.name]);

  // Global Ctrl+K / Cmd+K listener for Command Palette. A modal upload
  // review (especially a write/readback) must not be covered by another panel.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isUploadSheetOpen) setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isUploadSheetOpen]);

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
    if (deckIsLocked(deck)) {
      pushLog('[DECK LOCKED] Unlock deck to assign an app', 'deck', 'info');
      return;
    }
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

  // Action Dispatcher & Native Application Launcher. Never log success before
  // the desktop shell actually accepts an action; a browser-only preview is not
  // evidence of a keypress, and a failed native action is not a success.
  const handleTriggerAction = (actionId: string, actionName: string, category: string, payload?: ActionDefinition['payload']) => {
    const isSafety = actionName.includes('[SAFETY UNLOCKED]') || actionId === 'safety-aborted';
    if (category === 'navigation' && payload?.targetChannel !== undefined) {
      const ch = payload.targetChannel;
      if (!Number.isInteger(ch) || ch < 0 || ch >= layers.length) {
        pushLog(`[PREVIEW FAILED] Invalid pad channel ${ch}`, 'navigation', 'error');
        return;
      }
      setActiveLayerId(layers[ch].id);
      pushLog(`[EDITOR PREVIEW] ${actionName} — pad unchanged; upload then press the physical switch`,
        'navigation', 'info');
      return;
    }
    if (category === 'navigation' || category === 'info' || category === 'via-assign' ||
        category === 'system' || category === 'display' || category === 'safety' || actionId === 'safety-aborted') {
      pushLog(actionName, category, isSafety || category === 'safety' ? 'safety' : 'info');
      return;
    }
    if (category === 'midi') {
      pushLog('MIDI output is not connected in this build. The action was logged only.', 'midi', 'info');
      return;
    }
    if (category === 'oled') {
      pushLog('[ON-PAD ONLY] OLED NEXT steps the real playlist when its assigned switch is pressed after upload; this preview did not command the pad', 'display', 'info');
      return;
    }

    const action: ActionDefinition = {
      id: actionId,
      category: (category as ActionDefinition['category']) || 'hotkey',
      name: actionName,
      payload: payload || {},
    };
    void executeDeckAction(action).then((res) => {
      if (res.success) {
        pushLog(actionName, category, isSafety ? 'safety' : 'success');
      } else if (res.error?.includes('Native desktop shell')) {
        pushLog(`[PREVIEW] ${actionName} — native OS injection requires Electron`, category, 'info');
      } else {
        pushLog(`[ACTION FAILED] ${actionName}: ${res.error || 'unknown error'}`, category, 'error');
      }
    }).catch((err) => {
      pushLog(`[ACTION FAILED] ${actionName}: ${err instanceof Error ? err.message : String(err)}`, category, 'error');
    });
  };

  // Screen clicks/knob simulation select an EDITOR PREVIEW only. The real pad
  // switches channels via its knob hold or a firmware CHANNEL binding; the
  // unacknowledged OLED:CH ASCII path was never proof of a physical switch.
  const handleCycleDialMode = (explicitChannelIdx?: number, fromPad = false) => {
    if (explicitChannelIdx !== undefined &&
        (!Number.isInteger(explicitChannelIdx) || explicitChannelIdx < 0 || explicitChannelIdx >= layers.length)) return;
    const nextIdx = explicitChannelIdx ?? (activeChannelIdx + 1) % Math.max(layers.length, 1);
    const targetLayer = layers[nextIdx];
    if (!targetLayer) return;
    setActiveLayerId(targetLayer.id);
    if (fromPad) setPadChannelIndex(nextIdx);

    // If a drawer is open, keep the same switch index in the new preview.
    if (editingKeyBinding) {
      const k = targetLayer.keys.find(item => item.keyIndex === (selectedKeyIndex ?? 0));
      if (k) setEditingKeyBinding(k);
    }
    handleTriggerAction('layer-switch', fromPad
      ? `[PAD EVENT] Layer ${nextIdx} (${targetLayer.name}) reported by device; editor followed`
      : `[EDITOR PREVIEW] Layer ${nextIdx} (${targetLayer.name}); pad unchanged`, 'navigation');
  };

  // Subscribe to hardware bridge status & input reports from physical microcontroller
  useEffect(() => {
    let hwDialTimer: ReturnType<typeof setTimeout> | null = null;
    let hwDialHoldTriggered = false;
    let deviceReportsHold = false;

    const unsubState = hardwareBridge.onStateChange((state, info) => {
      setHardwareState(state);
      setDeviceInfo(info);
      if (state !== 'connected' || !info?.protocolReady || !info.hasEvents) setPadChannelIndex(null);
      deviceReportsHold = state === 'connected' && info?.type === 'webserial';
      const previous = lastHardwareStateRef.current;
      lastHardwareStateRef.current = state;
      if (state === 'connected' && previous !== 'connected') {
        handleTriggerAction('mcu-conn', `Connected: ${info?.name || 'Microcontroller'}`, 'info');
      } else if (state === 'disconnected' && previous === 'connected') {
        handleTriggerAction('mcu-disc', 'Macropad disconnected', 'info');
      }
    });

    const unsubInput = hardwareBridge.onInputEvent((keyIdx, actionType, meta) => {
      if (meta) {
        // The pad has already fired every non-empty firmware action before
        // sending this event. Only empty slots can have a PC-owned action.
        // Route by the reported channel, not the possibly stale React selection.
        const routed = routePhysicalAction(layers, keyIdx, actionType, meta);
        if (routed.reason) {
          handleTriggerAction('safety-aborted', routed.reason, 'info');
        }
        if (routed.truncated) {
          handleTriggerAction('hw-batch-capped', 'Knob batch capped at 20 PC actions for safety', 'info');
        }
        if (routed.action) {
          const action = routed.action;
          const label = keyIdx < 9 && layers[meta.channel]?.keys.find(k => k.keyIndex === keyIdx)?.isDestructiveSafety
            ? `[SAFETY UNLOCKED] ${action.name}` : `[HARDWARE] ${action.name}`;
          for (let i = 0; i < routed.count; i++) {
            handleTriggerAction(action.id, label, action.category, action.payload);
          }
        }
        return;
      }
      // Legacy text-only serial devices have no action ownership metadata.
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
      handleCycleDialMode(channelIdx, true);
    });

    const unsubHold = hardwareBridge.onHoldSwitch(() => {
      if (hwDialTimer) {
        clearTimeout(hwDialTimer);
        hwDialTimer = null;
      }
      hwDialHoldTriggered = true;
    });

    const unsubOledMode = hardwareBridge.onOledMode((mode) => {
      modeFromPadRef.current = mode;
      setOledState(prev => prev.mode === mode ? prev : { ...prev, mode });
    });

    return () => {
      unsubState();
      unsubInput();
      unsubChannel();
      unsubHold();
      unsubOledMode();
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

  // Sidebar / palette select a layer for editing, NOT a remote pad channel.
  const handleSelectLayer = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    setActiveLayerId(id);
    triggerOSDFlyout();
    pushLog(`[EDITOR PREVIEW] Layer ${idx} (${layers[idx].name}); pad unchanged`, 'navigation', 'info');
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
    if (deckIsLocked(deck)) {
      pushLog('[DECK LOCKED] Switch edit was not saved; unlock deck first', 'deck', 'info');
      return;
    }
    putKey(updated.keyIndex, updated);
    handleTriggerAction('key-save', `Saved Switch #${updated.keyIndex + 1} (${updated.label})`, 'info');
  };

  // Dial / Rotary Encoder Save handler
  const handleSaveDial = (updatedDial: DialBinding) => {
    if (deckIsLocked(deck)) {
      pushLog('[DECK LOCKED] Knob edit was not saved; unlock deck first', 'deck', 'info');
      return;
    }
    writeActiveLayer(() => ({ dial: updatedDial, isExample: false }));
    handleTriggerAction('dial-save', `Saved Dial Configuration (${updatedDial.activeModeName})`, 'info');
  };

  const handleToggleDeckLock = () => {
    if (uploadBusyRef.current) {
      pushLog('[DECK LOCK] Wait for the active upload/readback to finish', 'deck', 'info');
      return;
    }
    if (!deckIsLocked(deck)) {
      // Avoid keeping a writable draft or an Upload sheet open after locking.
      setEditingKeyBinding(null);
      setIsEditingKnob(false);
      setIsUploadSheetOpen(false);
    }
    setDeck(prev => ({ ...prev, isLocked: !deckIsLocked(prev) }));
  };

  /*
   * Upload to the pad.
   *
   * This is now a real config upload: read the pad's current config (so its
   * gesture timings, OLED playlist and lighting survive), replace the nine keys
   * and four knob slots on each of the four layers, stream the 2272-byte blob as
   * SET_CONFIG chunks, then COMMIT. It reports what the pad acknowledged, and
   * names the bindings that stayed on the PC instead of pretending they went.
   */
  const handleSyncEEPROM = async (
    onProgress?: (p: UploadProgress) => void,
    options?: UploadOptions,
  ): Promise<UploadResult> => {
    if (deckIsLocked(deck)) {
      const message = 'Deck is locked. Unlock deck before uploading bindings.';
      pushLog(`[UPLOAD BLOCKED] ${message}`, 'deck', 'info');
      return { ok: false, message, mapped: 0, unsupported: [] };
    }
    if (uploadBusyRef.current) {
      const message = 'A deck upload is already in progress; wait for its verified readback.';
      pushLog(`[UPLOAD BLOCKED] ${message}`, 'deck', 'info');
      return { ok: false, message, mapped: 0, unsupported: [] };
    }
    if (layers.length < 4) {
      const message = 'The deck must contain all 4 layers (Layer 0–3)';
      handleTriggerAction('sync-fail', message, 'safety');
      return { ok: false, message, mapped: 0, unsupported: [] };
    }

    uploadBusyRef.current = true;
    setIsDeckUploadBusy(true);
    try {
      const summary = layers
        .map((layer, chIdx) => `Layer ${chIdx}: ${layer.keys.filter((k) => k.tapAction).length}/9 keys`)
        .join(' • ');
      handleTriggerAction('sync-start', `Uploading — ${summary}`, 'info');

      const result = await hardwareBridge.uploadDeck(deck, (p) => {
        onProgress?.(p);
        if (p.phase === 'committing') {
          pushLog(`[UPLOAD] ${p.total}/${p.total} config chunks sent, committing to flash`, 'hardware', 'info');
        }
      }, options);

      if (!result.ok) {
        handleTriggerAction('sync-fail', result.message, 'safety');
        return result;
      }

      const pcOnly = result.unsupported.filter(u => u.route === 'desktop');
      const unavailable = result.unsupported.filter(u => u.route === 'unavailable');
      const detail = [
        pcOnly.length ? `${pcOnly.length} require the connected desktop app and enabled key events` : '',
        unavailable.length ? `${unavailable.length} have no working pad or PC route: ${unavailable.slice(0, 2).map(u => u.name).join(', ')}` : '',
      ].filter(Boolean).join('; ');
      handleTriggerAction('sync-eeprom', result.message + (detail ? ` ${detail}.` : ''), 'info');
      return result;
    } finally {
      uploadBusyRef.current = false;
      setIsDeckUploadBusy(false);
    }
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
        // Arbitrary text is not an OLED ASCII command. The independent runtime
        // stream may render it on a verified pad; never call this webhook itself
        // an acknowledged physical text write or claim it lives in flash.
        note(hardwareState === 'connected' && deviceInfo?.protocolReady && deviceInfo.hasOledStream
          ? 'OLED labels saved on this PC; rendered runtime pixels can stream while the verified OLED link is active (not committed to pad flash).'
          : 'OLED labels saved on this PC for preview; no verified live OLED stream is available.');
        return;
      }
      case '/api/v1/action': {
        // Both the server and the local example accept `layer`; the server
        // normalises it to `channel`. Either form selects only an EDITOR preview.
        const selected = data.channel ?? data.layer;
        if (typeof selected === 'number' && Number.isInteger(selected) && selected >= 0 && selected < layers.length) {
          handleCycleDialMode(selected);
        } else note('Invalid editing layer (expected 0–3)', 'safety');
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
      pushLog(`[ACTION FAILED] ${event.error || 'App launch failed'}`, 'app_launch', 'error');
    }
  };

  const openHardwareDiagnostics = () => {
    setActiveTab('designer');
    setEditingKeyBinding(null);
    setIsEditingKnob(false);
    setIsEditingDisplay(false);
    setIsCommandPaletteOpen(false);
    setIsHardwareDiagnosticsExpanded(true);
    if (isHardwareDiagnosticsExpanded && activeTab === 'designer') {
      hardwareDiagnosticsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isHardwareDiagnosticsExpanded && activeTab === 'designer') {
      hardwareDiagnosticsRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isHardwareDiagnosticsExpanded, activeTab]);

  const openFirmwarePanel = () => {
    setIsCommandPaletteOpen(false);
    setIsFirmwareExpanded(true);
    // The sidebar persists on every tab. Move to its heading, not a separate page.
    firmwareDisclosureRef.current?.querySelector('summary')?.focus({ preventScroll: true });
    firmwareDisclosureRef.current?.querySelector('summary')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  useEffect(() => {
    if (isFirmwareExpanded) {
      // There is not enough room for the full flasher below the layer list at
      // laptop heights; reveal its UF2 and Flash controls after expansion.
      firmwareDisclosureRef.current?.querySelector('summary')?.scrollIntoView({ block: 'start' });
    }
  }, [isFirmwareExpanded]);

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
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onOpenDiagnostics={openHardwareDiagnostics}
        onOpenFirmwarePanel={openFirmwarePanel}
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
              onClick={handleToggleDeckLock}
              disabled={isDeckUploadBusy}
              title={isDeckUploadBusy ? 'Wait for the current upload to finish before changing the lock' :
                deck.isLocked ? 'Unlock this PC editing guard' : 'Lock assignments, PC macro edits and deck upload; closes open key/knob editors'}
              className="mt-2 w-full border border-[#C7C7C7] px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#444343] hover:bg-[#141414] hover:text-[#E3E2DE] hover:border-[#141414] disabled:opacity-50 transition-colors"
            >
              {deck.isLocked ? 'Unlock deck' : 'Lock deck'}
            </button>
            {deck.isLocked && <p role="status" className="mt-2 text-[9px] font-mono text-[#444343] leading-relaxed">
              Read-only deck: assignments, PC macros and deck upload are blocked. Unlock here to edit. Display and lighting settings are separate. This is not a device security lock.
            </p>}
          </div>

          {/* layer register */}
          <div className="px-4 py-3 border-b border-[#C7C7C7]">
            <div className="flex items-center justify-between mb-2">
              <span className="eyebrow">Edit Layers</span>
              <span className="idx">{`0${Math.max(layers.findIndex(l => l.id === activeLayer.id), 0)}`}</span>
            </div>
            <div className="flex flex-col">
              {layers.map((l, i) => {
                const on = l.id === activeLayer.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => handleSelectLayer(l.id)}
                    title={`Edit/preview Layer ${i} here; this does not switch the pad`}
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
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
              Editor preview only · pad {hardwareState !== 'connected' || !deviceInfo?.protocolReady
                ? 'not verified' : padChannelIndex === null
                  ? 'layer unknown until a device event' : `reported Layer ${padChannelIndex}`}.
              Hold the physical knob or use an uploaded layer key to switch the pad.
            </p>
          </div>

          {/* Firmware tools live in the left rail, below the layer register. */}
          <details
            ref={firmwareDisclosureRef}
            id="firmware-bootloader"
            open={isFirmwareExpanded}
            onToggle={(event) => setIsFirmwareExpanded(event.currentTarget.open)}
            className="border-b border-[#C7C7C7] group shrink-0"
          >
            <summary className="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-2.5 hover:bg-[#EDECE8] [&::-webkit-details-marker]:hidden">
              <span className="w-7 h-7 shrink-0 flex items-center justify-center border border-[#C7C7C7] text-[#1351AA]">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block leading-snug">RP2040 Firmware &amp; Bootloader</span>
                <span className="block mt-0.5 font-mono text-[9px] text-[#646464]">BOOTSEL · UF2 flasher</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[#646464] transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-[#C7C7C7]">
              <FirmwarePanel isExpanded={isFirmwareExpanded} />
            </div>
          </details>

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
            {/* A desktop studio rail needs 352px pad + 248px dock + 24px gap,
                plus 48px padding/borders. Keep it at 676px so the controls
                never drop below the pad on laptop-sized full-screen windows;
                larger screens grow the inspector instead of stretching the deck. */}
            <div className="flex-1 min-w-0 min-[1264px]:w-[676px] min-[1264px]:flex-none flex flex-col items-center justify-start p-6 border-r border-[#E3E2DE] overflow-y-auto space-y-4">
              <DigitalTwin
                layer={activeLayer}
                channelIndex={activeChannelIdx}
                padChannelIndex={padChannelIndex}
                layerNames={layerNames}
                oledState={oledState}
                deckName={deck.name}
                isDeckLocked={deck.isLocked === true}
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
                  if (deckIsLocked(deck)) {
                    pushLog('[DECK LOCKED] Unlock deck before remapping switches', 'deck', 'info');
                    return;
                  }
                  setIsEditingKnob(false);
                  setIsEditingDisplay(false);
                  const targetIdx = idx ?? selectedKeyIndex ?? 0;
                  setSelectedKeyIndex(targetIdx);
                  const k = activeLayer.keys.find(item => item.keyIndex === targetIdx);
                  if (k) setEditingKeyBinding(k);
                }}
                onOpenKnobDrawer={() => {
                  if (deckIsLocked(deck)) {
                    pushLog('[DECK LOCKED] Unlock deck before editing the knob', 'deck', 'info');
                    return;
                  }
                  setEditingKeyBinding(null);
                  setIsEditingDisplay(false);
                  setIsEditingKnob(true);
                }}
                onOpenDisplayDrawer={() => {
                  setEditingKeyBinding(null);
                  setIsEditingKnob(false);
                  setIsEditingDisplay(true);
                }}
                onOpenUploadSheet={() => setIsUploadSheetOpen(true)}
                onTriggerAction={handleTriggerAction}
                onCycleDialMode={handleCycleDialMode}
                connectionStatus={hardwareState === 'connected' ? 'usb_connected' : 'simulator'}
                onToggleConnection={() => {
                  if (hardwareState === 'connected') {
                    hardwareBridge.disconnect();
                  } else {
                    hardwareBridge.connectSerial();
                  }
                }}
              />

              {/* VIA quick keycode tray */}
              <div className="w-full max-w-[600px] mt-6">
                <ViaKeycodePicker
                  selectedKeyIndex={selectedKeyIndex}
                  isDeckLocked={deck.isLocked === true}
                  onAssignKeycode={handleAssignViaKeycode}
                />
              </div>
            </div>

            {/* Right Column: Key Config Drawer OR Knob Config Drawer OR Display Config Drawer OR Switch Inspector + Telemetry */}
            <div className={`w-[560px] min-w-[360px] shrink min-[1264px]:flex-1 flex flex-col bg-[#FFFFFF] border-l border-[#E3E2DE] ${
 editingKeyBinding || isEditingKnob || isEditingDisplay ? 'overflow-hidden' : 'p-4 overflow-x-hidden overflow-y-auto'
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
                  hardwareState={hardwareState}
                  deviceInfo={deviceInfo}
                  onSaveToPad={(settings) => hardwareBridge.saveDisplaySettings(settings)}
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
                            if (deckIsLocked(deck)) return;
                            setIsEditingKnob(false);
                            const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                            if (k) setEditingKeyBinding(k);
                          }}
                          disabled={deck.isLocked}
                          title={deck.isLocked ? 'Unlock deck to remap a switch' : 'Remap and record this switch'}
                          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1351AA] hover:text-[#141414] disabled:opacity-40 transition-colors"
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

                  {/* Expanded hardware diagnostics stays in the right inspector above Audio Mixer. */}
                  <details
                    ref={hardwareDiagnosticsRef}
                    id="hardware-diagnostics"
                    open={isHardwareDiagnosticsExpanded}
                    onToggle={(event) => setIsHardwareDiagnosticsExpanded(event.currentTarget.open)}
                    className="panel mb-4 shrink-0 min-w-0"
                  >
                    <summary className="px-3 py-2 cursor-pointer select-none flex items-center justify-between gap-2 border-b border-[#E3E2DE]">
                      <span className="eyebrow eyebrow--ink">Hardware Status &amp; Diagnostics</span>
                      <span className="min-w-0 max-w-[42%] flex items-center justify-end gap-2">
                        <span className={`mark shrink-0 ${hardwareState === 'connected' ? 'mark--on' : 'mark--off'}`} aria-hidden="true" />
                        <span className="idx min-w-0 truncate" title={hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}>
                          {hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}
                        </span>
                      </span>
                    </summary>
                    <div className="px-3 pt-2 pb-3">
                      <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#444343] leading-relaxed break-words">
                        {hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}
                      </p>
                    </div>
                    <HardwareDiagnosticsPanel
                      isExpanded={isHardwareDiagnosticsExpanded}
                      actionHistory={actionLogs}
                      onClearHistory={() => setActionLogs([])}
                    />
                  </details>

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
                          onClick={openHardwareDiagnostics}
                          title="Expand Hardware Status & Diagnostics"
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
                isDeckLocked={deck.isLocked === true}
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
            <ViaMacroEditor isDeckLocked={deck.isLocked === true} onTriggerAction={handleTriggerAction} />
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

      {/* Review and upload the deck in a bottom sheet rather than a popup. */}
      <UploadSheet
        isOpen={isUploadSheetOpen}
        onClose={() => setIsUploadSheetOpen(false)}
        deck={deck}
        hardwareState={hardwareState}
        deviceInfo={deviceInfo}
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
        onOpenDiagnostics={openHardwareDiagnostics}
        onOpenFirmwarePanel={openFirmwarePanel}
        onExportDeck={handleExportDeck}
        hardwareState={hardwareState}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onOpenUploadSheet={() => setIsUploadSheetOpen(true)}
        onSelectKey={(idx) => {
          setSelectedKeyIndex(idx);
          if (deckIsLocked(deck)) {
            pushLog('[DECK LOCKED] Unlock deck before remapping switches', 'deck', 'info');
            return;
          }
          const k = activeLayer.keys[idx];
          if (k) setEditingKeyBinding(k);
        }}
        onSelectKnob={() => {
          if (deckIsLocked(deck)) {
            pushLog('[DECK LOCKED] Unlock deck before editing the knob', 'deck', 'info');
            return;
          }
          setIsEditingKnob(true);
        }}
        onTriggerAction={(name, detail, type) => pushLog(name, 'palette', type, detail)}
      />
    </div>
  );
};
