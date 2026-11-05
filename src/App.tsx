import { KNOB_HOLD_MS } from './utils/knobHold';
import { validDeck, validOled, type ParsedBackup } from './utils/backup';
import { version as appVersion } from '../package.json';
import { getLightingStorageError, reloadLightingFromStorage, subscribe as subscribeLighting } from './lighting/store';
import React, { useState, useEffect, useRef, useReducer } from 'react';
import { createDeckHistory, deckHistoryReducer } from './utils/deckHistory';
import { Deck, Layer, KeyBinding, DialBinding, OLEDState, ActionDefinition, DiscoveredApp } from './types';
import { defaultDeck } from './data/defaultDeck';
import { TopNavbar } from './components/TopNavbar';
import { HelpPanel } from './components/HelpPanel';
import { SettingsPage } from './components/SettingsPage';
import { WelcomeTour } from './components/WelcomeTour';
import { INTRO_REPLAY_EVENT } from './intro/config';
import { shouldShowWelcome } from './utils/welcome';
import { applyTheme, readTheme, saveTheme, readOpeningAnimation, saveOpeningAnimation, type AppTheme } from './utils/appPreferences';
import { DigitalTwin } from './components/DigitalTwin';




import { assignShortcutToBinding } from './utils/shortcutBindings';

import { restoreMacropadConfig } from './utils/macropadConfig';
import { getOLEDMode, isOLEDMode, OLED_MODE_IDS, type OLEDMode } from './oled/modes';
import { startOledStreaming, type OledStreamSnapshot } from './oled/streamer';
import { AUTO_CYCLE_DEFAULT_S, capacityFor } from './oled/capacity';
import {
  DEFAULT_PLAYLIST,
  clampAutoCycleS,
  nextInPlaylist,
  normalizePlaylist,
} from './oled/playlist';




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
import { AnimatedDetails } from './components/AnimatedDetails';
import { FirmwarePanel } from './components/FirmwarePanel';
import { BackupPanel } from './components/BackupPanel';
import { PadInspector } from './components/PadInspector';
import { UploadSheet } from './components/UploadSheet';
import { CommandPalette } from './components/CommandPalette';

import { applyLayerPreset, LayerPreset } from './data/layerPresets';
import type { ElectronHardwareEvent, NowPlayingResult, SystemMetrics } from './types/electron';
import {
  Trash2,
  Activity,
  ChevronDown,
  Zap,
  Sun,
} from 'lucide-react';

// These chunks are loaded only when needed (or when the user points at a tab).
const loadShortcuts = () => import('./components/ShortcutsPanel');
const loadApps = () => import('./components/AppLauncherPanel');
const loadTester = () => import('./components/via/ViaKeyTester');
const loadLighting = () => import('./components/via/ViaLightingPanel');
const loadMacros = () => import('./components/via/ViaMacroEditor');
const loadPresets = () => import('./components/PresetsPage');
const ShortcutsPanel = React.lazy(() => loadShortcuts().then(m => ({ default: m.ShortcutsPanel })));
const AppLauncherPanel = React.lazy(() => loadApps().then(m => ({ default: m.AppLauncherPanel })));
const ViaKeyTester = React.lazy(() => loadTester().then(m => ({ default: m.ViaKeyTester })));
const ViaLightingPanel = React.lazy(() => loadLighting().then(m => ({ default: m.ViaLightingPanel })));
const ViaMacroEditor = React.lazy(() => loadMacros().then(m => ({ default: m.ViaMacroEditor })));
const PresetsPage = React.lazy(() => loadPresets().then(m => ({ default: m.PresetsPage })));
type AppTab = React.ComponentProps<typeof TopNavbar>['activeTab'];
const tabLoaders: Partial<Record<AppTab, () => Promise<unknown>>> = {
  shortcuts: loadShortcuts, apps: loadApps, tester: loadTester,
  lighting: loadLighting, macros: loadMacros, presets: loadPresets,
};
function prepareTab(tab: AppTab) {
  // If speculative loading fails, the normal page/error handling still runs on click.
  const load = tabLoaders[tab];
  if (load) void load().catch(() => {});
}

const KeyConfigDrawer = React.lazy(() => import('./components/KeyConfigDrawer').then(m => ({ default: m.KeyConfigDrawer })));
const KnobConfigDrawer = React.lazy(() => import('./components/KnobConfigDrawer').then(m => ({ default: m.KnobConfigDrawer })));
const DisplayConfigDrawer = React.lazy(() => import('./components/DisplayConfigDrawer').then(m => ({ default: m.DisplayConfigDrawer })));
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
  'mode', 'customTitle', 'customSubtitle', 'brightness', 'inverted', 'autoCycleS', 'playlist', 'customScreen', 'customScreenEnabled',
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
    if (!saved || !validOled(saved)) return fallback;
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

export const App: React.FC<{ onReset: () => void }> = ({ onReset }) => {
  // The deck's activeLayerId is the ONE selected layer for display and edits.
  // Adopt the older separate session preference once when loading a deck, then
  // keep it in sync with the deck so changing layers cannot edit another page.
  const [initialDeck] = useState(() => {
    let restored = restoreMacropadConfig(defaultDeck);
    let blocked = false;
    try {
      const saved = localStorage.getItem(DECK_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved) as Deck;
        if (!validDeck(parsed, true)) {
          throw new Error('Invalid saved deck');
        }
        restored = restoreMacropadConfig(parsed);
      }
    } catch { blocked = true; }
    const selected = loadSession().activeLayerId;
    const value = selected && restored.layers.some((l) => l.id === selected)
      ? { ...restored, activeLayerId: selected }
      : restored;
    return { value, blocked };
  });
  const [deckHistory, dispatchDeck] = useReducer(deckHistoryReducer, initialDeck.value, createDeckHistory);
  const deck = deckHistory.deck;
  const setDeck = (update: Deck | ((current: Deck) => Deck)) => dispatchDeck({ type: 'edit', update: typeof update === 'function' ? update : () => update });
  const [deckSaveBlocked, setDeckSaveBlocked] = useState(initialDeck.blocked);
  const [storageErrors, setStorageErrors] = useState<Record<string, boolean>>({});
  // Opt-in and session-only: never affect physical pad events or unrelated tests.
  const [theme, setTheme] = useState<AppTheme>(readTheme);
  const [openingAnimation, setOpeningAnimation] = useState(readOpeningAnimation);
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const themeChangeSequence = useRef(0);
  const changeTheme = (next: AppTheme) => {
    const sequence = ++themeChangeSequence.current;
    setTheme(next);
    const saved = saveTheme(next);
    setPreferenceNotice(saved ? '' : 'Theme could not be saved; it will reset when ZERO restarts.');
    void applyTheme(next, saved).then(splashSaved => {
      if (saved && !splashSaved && sequence === themeChangeSequence.current) setPreferenceNotice('Theme saved, but the loading-screen color could not be saved.');
    }).catch(() => {
      if (saved && sequence === themeChangeSequence.current) setPreferenceNotice('Theme saved, but the loading-screen color could not be saved.');
    });
  };
  const changeOpeningAnimation = (enabled: boolean) => {
    setOpeningAnimation(enabled);
    setPreferenceNotice(saveOpeningAnimation(enabled) ? '' : 'Animation preference could not be saved; it will reset when ZERO restarts.');
  };
  const [safePreview, setSafePreview] = useState(false);
  const safePreviewRef = useRef(false);
  const [brightnessToast, setBrightnessToast] = useState<{ level: number; atLimit: boolean } | null>(null);
  useEffect(() => {
    if (!brightnessToast) return;
    const timer = window.setTimeout(() => setBrightnessToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [brightnessToast]);
  const [virtualFeedback, setVirtualFeedback] = useState<{ type: 'info' | 'success' | 'error'; message: string }>({ type: 'info', message: 'Select a key, assign an action, then press it here to test.' });
  const virtualActionSequence = useRef(0);
  const [macroStorageError, setMacroStorageError] = useState('');
  const [lightingStorageError, setLightingStorageError] = useState(getLightingStorageError);
  useEffect(() => subscribeLighting(() => setLightingStorageError(getLightingStorageError())), []);
  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
      setStorageErrors(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev }; delete next[key]; return next;
      });
    } catch {
      setStorageErrors(prev => prev[key] ? prev : { ...prev, [key]: true });
    }
  };

  const activeLayerId = deck.activeLayerId;
  const setActiveLayerId = (id: string) => dispatchDeck({ type: 'select', id });
  const layers = deck.layers;
  // The four hardware layers are always identified by number in the UI.
  // Keep any legacy names in saved data without displaying or rewriting them.
  const layerNames = layers.map((_, i) => `Layer ${i}`);

  // Edits stay in the local configuration until the user uploads all layers.
  const writeActiveLayer = (mutate: (layer: Layer) => Partial<Layer>) => {
    setDeck(current => ({
      ...current,
      layers: current.layers.map(l => (l.id === current.activeLayerId ? { ...l, ...mutate(l) } : l)),
    }));
  };

  const putKey = (keyIndex: number, next: KeyBinding, layerIndex?: number) => {
    setDeck(current => ({
      ...current,
      layers: current.layers.map((l, i) => {
        const target = layerIndex !== undefined ? i === layerIndex : l.id === current.activeLayerId;
        if (!target) return l;
        return {
          ...l,
          isExample: false,
          keys: l.keys.map(k => (k.keyIndex === keyIndex ? { ...next, keyIndex } : k)),
        };
      }),
    }));
  };

  // Never show onboarding over settings from an existing installation.
  const [firstRunWelcome] = useState(() => {
    try { return shouldShowWelcome(localStorage); } catch { return false; }
  });
  const [showWelcome, setShowWelcome] = useState(firstRunWelcome);
  const [introFinished, setIntroFinished] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Let the existing staged introduction finish (or be skipped) before opening
  // another modal. Observe its class rather than changing its choreography.
  useEffect(() => {
    const update = () => setIntroFinished(!document.documentElement.classList.contains('intro-running'));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (firstRunWelcome) try { localStorage.setItem('kadowaz_welcome_pending', '1'); } catch { /* optional */ }
  }, [firstRunWelcome]);
  const dismissWelcome = () => {
    setShowWelcome(false);
    try {
      localStorage.setItem('kadowaz_guide_seen', '1');
      localStorage.removeItem('kadowaz_welcome_pending');
    } catch { /* storage may be unavailable */ }
  };
  // The entrance is visual only, runs once, and yields immediately to input.
  const [startupAnimationEnabled] = useState(readOpeningAnimation);
  const [isStarting, setIsStarting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsStarting(false), 900);
    return () => window.clearTimeout(timer);
  }, []);
  const [railOpen, setRailOpen] = useState(false);
  const [backupRevision, setBackupRevision] = useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(0);
  const [editingKeyBinding, setEditingKeyBinding] = useState<KeyBinding | null>(null);
  const [isEditingKnob, setIsEditingKnob] = useState<boolean>(false);
  const [isEditingDisplay, setIsEditingDisplay] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AppTab>('designer');
  const [pagePending, startPageTransition] = React.useTransition();
  // Keep the existing page available while a real lazy import is pending.
  // React can cancel an older request if the user chooses another tab.
  const changeTab = (tab: AppTab) => startPageTransition(() => setActiveTab(tab));
  
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
    const mapped = viaItemToBinding(keyIndex, item);
    if ('error' in mapped) {
      pushLog(`[NOT ASSIGNED] ${mapped.error}`, 'hardware', 'error');
      return;
    }
    const previousIcon = activeLayer.keys.find(key => key.keyIndex === keyIndex)?.iconName || '';
    const binding = { ...mapped.binding, iconName: mapped.ownership === 'clear' ? '' : previousIcon };
    putKey(keyIndex, binding);
    // The quick tray remains usable with the drawer open. Refresh the drawer's
    // snapshot too, or its Save button can overwrite this newer assignment.
    setEditingKeyBinding(current => current?.keyIndex === keyIndex ? binding : current);
    handleTriggerAction('via-assign', mapped.description, 'info');
  };

  const [actionLogs, setActionLogs] = useState<ActionHistoryEntry[]>([]);
  const [isHardwareDiagnosticsExpanded, setIsHardwareDiagnosticsExpanded] = useState(false);
  const hardwareDiagnosticsRef = useRef<HTMLDetailsElement>(null);
  const [isFirmwareExpanded, setIsFirmwareExpanded] = useState(false);
  const firmwareDisclosureRef = useRef<HTMLDetailsElement>(null);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
  const uploadBusyRef = useRef(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Do not replace unreadable screen settings with the fallback on startup.
  const [oledSaveBlocked, setOledSaveBlocked] = useState(() => {
    try { const raw = localStorage.getItem(OLED_KEY); if (raw === null) return false; const saved: unknown = JSON.parse(raw); return saved === null || !validOled(saved); }
    catch { return true; }
  });
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
    mediaStatus: window.electronAPI?.onMediaState ? 'checking' : 'unavailable',
    mediaError: null,
    isPlaying: false,
    trackProgress: null,
    // Preferences, with the same defaults the drawer's reset button restores, so
    // the saved object always carries every field instead of leaving the drawer
    // to guess with ?? at each use.
    customTitle: 'ZERO',
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
    state: oledState, deckName: deck.name, layerName: padChannelIndex === null ? '' : `Layer ${padChannelIndex}`,
    layerIndex: padChannelIndex, layerCount: layers.length,
  });
  oledStreamSnapshot.current = {
    state: oledState, deckName: deck.name, layerName: padChannelIndex === null ? '' : `Layer ${padChannelIndex}`,
    layerIndex: padChannelIndex, layerCount: layers.length,
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
    // Never replace an unreadable saved deck with the empty fallback.
    if (!deckSaveBlocked) persist(DECK_KEY, JSON.stringify(deck));
  }, [deck, deckSaveBlocked]);

  useEffect(() => {
    if (!deckSaveBlocked) persist(SESSION_KEY, JSON.stringify({ activeLayerId }));
  }, [activeLayerId, deckSaveBlocked]);

  // Serialised through the preference whitelist so the dependency is the
  // preference slice, not the telemetry: the panel repaints twice a second and
  // this must not write to disk twice a second.
  const oledPrefsJson = JSON.stringify(oledPreferences(oledState));
  useEffect(() => {
    if (!oledSaveBlocked) persist(OLED_KEY, oledPrefsJson);
  }, [oledPrefsJson, oledSaveBlocked]);

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
    const targetChannel = options?.channelIndex !== undefined ? options.channelIndex : activeChannelIdx;

    const binding: KeyBinding = {
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
    };
    putKey(keyIndex, binding, targetChannel);
    if (targetChannel === activeChannelIdx) {
      setEditingKeyBinding(current => current?.keyIndex === keyIndex ? binding : current);
    }

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
    const showVirtualFeedback = !actionName.startsWith('[HARDWARE') && !actionName.startsWith('[WEBHOOK]');
    const sequence = showVirtualFeedback ? ++virtualActionSequence.current : 0;
    if (showVirtualFeedback) setVirtualFeedback({ type: 'info', message: `Sending ${actionName}…` });
    void executeDeckAction(action).then((res) => {
      if (showVirtualFeedback && sequence === virtualActionSequence.current) {
        if (res.success && typeof res.brightness === 'number' && Number.isFinite(res.brightness) && res.brightness >= 0 && res.brightness <= 100) {
          setBrightnessToast({ level: res.brightness, atLimit: Boolean(res.brightnessAtLimit) });
        }
        setVirtualFeedback(res.success
          ? { type: 'success', message: res.brightness !== undefined
            ? `${actionName}: brightness ${res.brightness}%${res.brightnessAtLimit ? ' (already at this limit)' : ' requested'}.`
            : `${actionName}: ${res.message || 'request sent. The active app or Windows must respond.'}` }
          : { type: 'error', message: `${actionName}: ${res.error || 'The action could not be sent.'}` });
      }
      if (res.success) {
        pushLog(actionName, category, isSafety ? 'safety' : 'success');
      } else if (res.error?.includes('Native desktop shell')) {
        pushLog(`[PREVIEW] ${actionName} — native OS injection requires Electron`, category, 'info');
      } else {
        pushLog(`[ACTION FAILED] ${actionName}: ${res.error || 'unknown error'}`, category, 'error');
      }
    }).catch((err) => {
      if (showVirtualFeedback && sequence === virtualActionSequence.current) setVirtualFeedback({ type: 'error', message: `${actionName}: ${err instanceof Error ? err.message : String(err)}` });
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
      ? `[PAD EVENT] Layer ${nextIdx} reported by device; editor followed`
      : `[EDITOR PREVIEW] Layer ${nextIdx}; pad unchanged`, 'navigation');
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
          const threshold = KNOB_HOLD_MS;
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

    let active = true;
    let receivedBroadcast = false;
    const apply = (result: NowPlayingResult) => {
      if (!active) return;
      const state = result.ok ? result.value ?? null : null;
      setOledState(prev => ({
        ...prev,
        mediaStatus: result.ok ? 'ready' : 'error',
        mediaError: result.ok ? null : result.error || 'Could not read the Windows media session.',
        nowPlayingTrack: state?.title || state?.artist || null,
        nowPlayingArtist: state?.title ? state.artist || null : null,
        nowPlayingApp: state?.app ?? null,
        isPlaying: Boolean(state?.isPlaying),
        trackProgress: state ? state.progress : null,
        trackPositionS: state ? state.positionS : null,
        trackDurationS: state ? state.durationS : null,
      }));
    };

    const unsubscribe = api.onMediaState(result => { receivedBroadcast = true; apply(result); });
    // Ignore an older initial response if a newer broadcast already arrived.
    api.getNowPlaying?.()
      .then(res => { if (!receivedBroadcast) apply(res); })
      .catch(() => { if (!receivedBroadcast) apply({ ok: false, error: 'Could not contact the media service.' }); });
    return () => { active = false; unsubscribe(); };
  }, []);

  // Events from the Electron main process: tray menu, localhost webhook, launcher status.
  // A ref keeps the handler fresh without re-subscribing on every state change.
  const hardwareEventHandlerRef = useRef<(event: ElectronHardwareEvent) => void>(() => {});
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onHardwareEvent?.((event) => hardwareEventHandlerRef.current(event));
    return () => { unsubscribe?.(); };
  }, []);

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

  const handleBackupRestored = (restored: ParsedBackup) => {
    setDeckSaveBlocked(false); dispatchDeck({ type: 'replace', deck: restored.deck }); setBackupRevision(n => n + 1);
    if (restored.extras) {
      setOledSaveBlocked(false); setMacroStorageError('');
      reloadLightingFromStorage();
      // Restore editor preferences without issuing an OLED mode command.
      const fallback = { ...oledState, mode: 'kadowaz' as OLEDMode, customTitle: 'ZERO', customSubtitle: 'ONLINE', brightness: 56, inverted: false, autoCycleS: AUTO_CYCLE_DEFAULT_S, playlist: [...DEFAULT_PLAYLIST], customScreen: undefined, customScreenEnabled: undefined };
      const next = loadOledState(fallback);
      modeFromPadRef.current = next.mode === oledState.mode ? null : next.mode;
      setOledState(prev => ({ ...prev, ...oledPreferences(next) }));
    }
    setEditingKeyBinding(null); setIsEditingKnob(false); setIsEditingDisplay(false);
  };

  // Discard drawer drafts so a stale editor cannot undo the history action.
  const stepDeckHistory = (direction: 'undo' | 'redo') => {
    dispatchDeck({ type: direction });
    setEditingKeyBinding(null); setIsEditingKnob(false);
  };

  const changeSafePreview = (next: boolean) => {
    safePreviewRef.current = next; setSafePreview(next); virtualActionSequence.current++; setBrightnessToast(null);
    setVirtualFeedback({ type: 'info', message: next ? 'Safe preview is on. Virtual keys and knob will not send actions to Windows.' : 'Live virtual actions are on. Pressing an assigned key may control this computer.' });
  };

  // Only virtual-deck gestures use this wrapper. Other tests and physical pad
  // events keep their existing routes; switching modes cannot cancel an action
  // already dispatched to Windows.
  const handleVirtualAction = (id: string, name: string, category: string, payload?: ActionDefinition['payload']) => {
    if (!safePreviewRef.current) { handleTriggerAction(id, name, category, payload); return; }
    const detail = payload?.keys?.join(' + ') || (payload?.mediaAction ? payload.mediaAction.replace(/_/g, ' ') : '') ||
      (payload?.macroId !== undefined ? `Macro M${payload.macroId}` : '') ||
      (payload?.text !== undefined ? `Type text: ${payload.text.slice(0, 80)}` : '') ||
      (payload?.appName || payload?.exePath || payload?.keycode || (payload?.targetChannel !== undefined ? `Layer ${payload.targetChannel}` : ''));
    setVirtualFeedback({ type: 'info', message: `Preview only: ${name}${detail ? ` — ${detail}` : ''}. Nothing was sent.` });
  };

  // Sidebar / palette select a layer for editing, NOT a remote pad channel.
  const handleSelectLayer = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    setActiveLayerId(id);
    pushLog(`[EDITOR PREVIEW] Layer ${idx}; pad unchanged`, 'navigation', 'info');
  };

  // Key save handler
  const handleSaveKey = (updated: KeyBinding) => {
    putKey(updated.keyIndex, updated);
    handleTriggerAction('key-save', `Saved Switch #${updated.keyIndex + 1} (${updated.label})`, 'info');
  };

  // Dial / Rotary Encoder Save handler
  const handleSaveDial = (updatedDial: DialBinding) => {
    writeActiveLayer(() => ({ dial: updatedDial, isExample: false }));
    handleTriggerAction('dial-save', `Saved Dial Configuration for Layer ${activeChannelIdx}`, 'info');
  };

  /*
   * Upload to the pad.
   *
   * This is now a real config upload: read the pad's current config (so its
   * other gesture timings, OLED playlist and lighting survive), replace the nine keys
   * and four knob slots on each of the four layers, set the reviewed fixed
   * knob-hold timing, stream the 2272-byte blob as
   * SET_CONFIG chunks, then COMMIT. It reports what the pad acknowledged, and
   * names the bindings that stayed on the PC instead of pretending they went.
   */
  const handleSyncEEPROM = async (
    onProgress?: (p: UploadProgress) => void,
    options?: UploadOptions,
  ): Promise<UploadResult> => {
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
    }
  };

  // Runs a webhook request against the CURRENT deck state. Requests were already
  // authenticated and validated by the main process (electron/webhookServer.cjs).
  const handleWebhookRequest = (endpoint: string, data: Record<string, unknown>) => {
    const note = (msg: string, type: ActionHistoryEntry['type'] = 'info') => pushLog(`[WEBHOOK] ${msg}`, 'webhook', type);
    const run = (action: ActionDefinition | null | undefined, label: string, isSafetyIsolated = false) => {
      if (!action) {
        note(`${label}: no action assigned`);
        return;
      }
      if (isSafetyIsolated) {
        // Safety isolation exists so destructive actions need an intentional physical hold.
        note(`Blocked: ${label} is safety-isolated and can only be run by a physical hold`, 'safety');
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
        const which = typeof data.action === 'string' ? data.action : 'tap';
        const action = which === 'hold' ? key.holdAction : which === 'double' ? key.doubleTapAction : key.tapAction;
        run(action, `Switch #${index + 1} ${which}`, Boolean(key.isDestructiveSafety));
        return;
      }
      case '/api/v1/dial': {
        const dial = activeLayer.dial as unknown as Record<string, unknown>;
        const dialSafe = Boolean(dial?.isDestructiveSafety);
        if (data.direction === 'press') {
          run(activeLayer.dial.pressAction, 'Knob press', dialSafe);
          return;
        }
        const steps = Math.min(10, Math.max(1, Math.floor(Number(data.step)) || 1));
        const action = data.direction === 'ccw' ? activeLayer.dial.ccwAction : activeLayer.dial.cwAction;
        for (let i = 0; i < steps; i++) run(action, `Knob ${String(data.direction)}`, dialSafe);
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
    setRailOpen(true);
    // Narrow windows keep the rail collapsed until it is explicitly opened.
    window.setTimeout(() => {
      firmwareDisclosureRef.current?.querySelector('summary')?.focus({ preventScroll: true });
      firmwareDisclosureRef.current?.querySelector('summary')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  };

  return (
    <div className={`app-shell ${isStarting ? (startupAnimationEnabled ? 'startup-entrance' : 'startup-quiet') : ''} flex flex-col h-screen w-screen bg-[#E3E2DE] text-[#141414] overflow-hidden`}
      onClickCapture={() => { if (isStarting) setIsStarting(false); }}
      onKeyDownCapture={() => { if (isStarting) setIsStarting(false); }}>
      {pagePending && <span className="sr-only" role="status">Opening selected section.</span>}
      {/* Top Application Navbar */}
      <TopNavbar
        activeTab={activeTab}
        onChangeTab={changeTab}
        onTabIntent={prepareTab}
        hardwareState={hardwareState}
        deviceInfo={deviceInfo}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onOpenDiagnostics={openHardwareDiagnostics}
        onOpenFirmwarePanel={openFirmwarePanel}
        onOpenHelp={() => setShowHelp(true)}
      />


      {(deckSaveBlocked || oledSaveBlocked || macroStorageError || lightingStorageError || Object.keys(storageErrors).length > 0) && <div role="alert" className="shrink-0 border-b border-[#aa6200] bg-[#fff2db] px-4 py-2 text-xs text-[#663900]">
        {deckSaveBlocked && <p>Saved deck data could not be read. It has not been overwritten; edits to this temporary layout will not be saved. Restore a trusted backup to replace it.</p>}
        {oledSaveBlocked && <p>Saved screen settings could not be read. They have not been overwritten; temporary screen edits will not be saved. Restore a trusted backup that includes screen settings to replace them.</p>}
        {macroStorageError && <p>{macroStorageError}</p>}
        {lightingStorageError && <p>{lightingStorageError}</p>}
        {Object.keys(storageErrors).length > 0 && <p>Some changes could not be saved on this computer. Check storage permissions or free space before closing the app.</p>}
      </div>}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} onOpenWelcome={() => { setShowHelp(false); setShowWelcome(true); }} onReplayIntro={() => {
        setShowHelp(false);
        // Let the help dialog restore focus before the intro takes it.
        window.setTimeout(() => window.dispatchEvent(new Event(INTRO_REPLAY_EVENT)), 0);
      }} />}
      {showWelcome && introFinished && <WelcomeTour onClose={dismissWelcome} />}

      {/* ── LABEL RAIL · cols 1–2 of the 12-col workspace ─────────────
           The system's sidebar register: metadata only, never content. */}
      <div className="workspace flex-1 flex overflow-hidden">
        <aside id="workspace-rail" className={`workspace-rail ${railOpen ? 'workspace-rail--open' : ''} w-[228px] shrink-0 border-r border-[#C7C7C7] flex flex-col overflow-y-auto bg-[#E3E2DE]`}>

          <div className="px-4 pt-4 pb-3 border-b border-[#C7C7C7]">
            <span className="eyebrow">Your setup</span>
            <p className="mt-2 text-[10px] leading-relaxed text-[#444343]">
              Choose a layer, assign actions to your keys and knob, then try them on the virtual pad. Saved on this PC. Upload to apply to your macropad.
            </p>
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
                          {`Layer ${i}`}
                        </span>
                        {l.isExample && (
                          <span className="ml-auto shrink-0 border border-[#C7C7C7] px-1 py-[1px] font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#646464]">
                            Example
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-[9px] text-[#646464] truncate">
                        {l.keys.length} KEYS
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
          <AnimatedDetails
            ref={firmwareDisclosureRef}
            id="firmware-bootloader"
            open={isFirmwareExpanded}
            onOpenChange={setIsFirmwareExpanded}
            className="border-b border-[#C7C7C7] shrink-0"
            summaryClassName="list-none cursor-pointer select-none px-4 py-3 flex items-center gap-2.5 hover:bg-[#EDECE8] [&::-webkit-details-marker]:hidden"
            summary={<>
              <span className="w-7 h-7 shrink-0 flex items-center justify-center border border-[#C7C7C7] text-[#1351AA]">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow block leading-snug">RP2040 Firmware &amp; Bootloader</span>
                <span className="block mt-0.5 font-mono text-[9px] text-[#646464]">BOOTSEL · UF2 flasher</span>
              </span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[#646464] transition-transform ${isFirmwareExpanded ? 'rotate-180' : ''}`} />
            </>}
          >
            {(renderedOpen) => <div className="border-t border-[#C7C7C7]">
              <FirmwarePanel isExpanded={isFirmwareExpanded} keepVisible={renderedOpen} />
            </div>}
          </AnimatedDetails>



          {/* foot */}
          <div className="mt-auto px-4 py-3 border-t border-[#C7C7C7]">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#646464] leading-relaxed">
              ZERO macropad<br />
              Version {appVersion}
            </p>
          </div>
        </aside>

        {/* ── CONTENT · cols 3–12 ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="mobile-rail-toggle hidden shrink-0 border-b border-[#C7C7C7] bg-[#EDECE8] px-3 py-2">
            <button aria-expanded={railOpen} aria-controls="workspace-rail" onClick={() => setRailOpen(open => !open)} className="text-xs font-bold text-[#1351AA]">{railOpen ? 'Close layers & tools' : 'Layers & firmware'}</button>
          </div>
          <div className="flex-1 flex min-h-0 overflow-hidden">

        <React.Suspense fallback={null}>
        {/* TAB 1: DECK STUDIO */}
        {activeTab === 'designer' && (
          <div className="designer-layout flex-1 flex overflow-hidden">
            {/* A desktop studio rail needs 352px pad + 248px dock + 24px gap,
                plus 48px padding/borders. Keep it at 676px so the controls
                never drop below the pad on laptop-sized full-screen windows;
                larger screens grow the inspector instead of stretching the deck. */}
            <div className="designer-pad flex-1 min-w-[672px] flex flex-col items-center justify-start p-6 border-r border-[#E3E2DE] overflow-y-auto space-y-4">
              <DigitalTwin
                layer={activeLayer}
                channelIndex={activeChannelIdx}
                padChannelIndex={padChannelIndex}
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
                  if (safePreview && k && !k.tapAction && !k.holdAction && !k.doubleTapAction) setVirtualFeedback({ type: 'info', message: `Preview only: Switch ${idx + 1} is unassigned. Nothing was sent.` });
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
                onOpenUploadSheet={() => setIsUploadSheetOpen(true)}
                onTriggerAction={handleVirtualAction}
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

              <div className="intro-preview-tools w-full max-w-[624px] flex flex-wrap items-center justify-between gap-2 border border-[#C7C7C7] bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <button type="button" aria-pressed={safePreview} onClick={() => changeSafePreview(!safePreviewRef.current)} className={`border px-3 py-1.5 text-xs font-bold ${safePreview ? 'border-[#1351AA] bg-[#1351AA] text-white' : 'border-[#777] text-[#141414] hover:border-[#1351AA]'}`}>Safe preview {safePreview ? 'on' : 'off'}</button>
                  <span className="text-[10px] text-[#444343]">Virtual deck only · resets on restart</span>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label="Layout edit history">
                  <button type="button" disabled={!deckHistory.past.length} onClick={() => stepDeckHistory('undo')} className="border border-[#999] px-2 py-1.5 text-xs font-bold disabled:opacity-40">Undo</button>
                  <button type="button" disabled={!deckHistory.future.length} onClick={() => stepDeckHistory('redo')} className="border border-[#999] px-2 py-1.5 text-xs font-bold disabled:opacity-40">Redo</button>
                </div>
                <p className="w-full text-[10px] text-[#444343]">Undo/redo covers key and knob layout edits this session, not macros or device uploads. Safe preview cannot stop actions or macros already started and does not affect other tests or a physical pad.</p>
              </div>
              <div role="status" aria-live="polite" aria-label="Virtual action feedback" className={`intro-preview-feedback w-full max-w-[624px] min-h-[40px] shrink-0 break-words [overflow-wrap:anywhere] border px-3 py-2 text-xs leading-relaxed ${virtualFeedback.type === 'error' ? 'border-[#AA3C20] bg-[#FFF1EB] text-[#76260F]' : virtualFeedback.type === 'success' ? 'border-[#A9BCD8] bg-[#F2F6FC] text-[#17457D]' : 'border-[#C7C7C7] bg-white text-[#444343]'}`}>
                <strong className="mr-2">Virtual test</strong><span>{virtualFeedback.message}</span>
              </div>

              {/* VIA quick keycode tray */}
              <div className="startup-keycode-tray w-full max-w-[624px] mt-2">
                <ViaKeycodePicker
                  selectedKeyIndex={selectedKeyIndex}
                  onAssignKeycode={handleAssignViaKeycode}
                />
              </div>
            </div>

            <div className={`designer-inspector ${editingKeyBinding || isEditingKnob || isEditingDisplay ? 'designer-inspector--editing w-[480px]' : 'w-[360px]'} shrink-0 flex flex-col bg-[#FFFFFF] border-l border-[#E3E2DE] ${
              editingKeyBinding || isEditingKnob || isEditingDisplay ? 'overflow-hidden' : 'p-4 overflow-x-hidden overflow-y-auto'
            }`}>
              <React.Suspense fallback={<div role="status" className="p-4 text-sm text-[#444343]">Loading editor…</div>}>
              {editingKeyBinding ? (
                <KeyConfigDrawer
                  key={`${activeLayerId}-${editingKeyBinding.keyIndex}`}
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
                  onSaveCustomScreen={(updated) => {
                    if (oledSaveBlocked) throw new Error('Saved display data is unreadable; no changes were written. Restore a backup first.');
                    const prefs = oledPreferences(updated);
                    try { localStorage.setItem(OLED_KEY, JSON.stringify(prefs)); }
                    catch { throw new Error('Could not save the screen on this PC. Your previous saved display data was kept.'); }
                    setOledState(prev => ({ ...prev, ...prefs }));
                  }}
                  onClose={() => setIsEditingDisplay(false)}
                  hardwareState={hardwareState}
                  deviceInfo={deviceInfo}
                  onSaveToPad={(settings) => hardwareBridge.saveDisplaySettings(settings)}
                  deckName={deck.name}
                  activeLayerName={`Layer ${activeChannelIdx}`}
                  activeLayerIndex={activeChannelIdx}
                  layerCount={layers.length}
                  onTriggerAction={handleTriggerAction}
                />
              ) : (
                <>
                  {/* The selected switch stays separate from the deck, so tapping a key does not move it. */}
                  <section className="panel mb-4" aria-label="Selected key">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#C7C7C7]">
                      <div className="flex items-baseline gap-2">
                        <span className="eyebrow eyebrow--ink">Selected key</span>
                        <span className="idx">{selectedKeyIndex !== null ? `0${selectedKeyIndex + 1} / 09` : '—'}</span>
                      </div>
                      {selectedKeyIndex !== null && activeLayer.keys.some(k => k.keyIndex === selectedKeyIndex) && (
                        <button type="button" onClick={() => {
                          setIsEditingKnob(false); setIsEditingDisplay(false);
                          const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                          if (k) setEditingKeyBinding(k);
                        }} className="border border-[#1351AA] px-2.5 py-1.5 text-[11px] font-bold text-[#1351AA] hover:bg-[#1351AA] hover:text-white transition-colors">
                          Edit key
                        </button>
                      )}
                    </div>
                    {selectedKeyIndex !== null && activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex) ? (() => {
                      const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex)!;
                      const safety = Boolean(k.isDestructiveSafety && k.safetyConfirmAction);
                      const rows = safety
                        ? [{ label: 'Hold to confirm', action: k.safetyConfirmAction }]
                        : [
                          { label: 'Tap', action: k.tapAction },
                          ...(k.holdAction ? [{ label: 'Hold', action: k.holdAction }] : []),
                          ...(k.doubleTapAction ? [{ label: 'Double tap', action: k.doubleTapAction }] : []),
                        ];
                      return <div className="px-3 py-3">
                        <p className="text-[10px] font-mono uppercase tracking-[0.08em] text-[#646464]">Layer {activeChannelIdx} · Switch {selectedKeyIndex + 1}</p>
                        <dl className="mt-2 space-y-2">
                          {rows.map(({ label, action }) => <div key={label} className="min-w-0">
                            <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#444343]">{label}</dt>
                            <dd className={`mt-0.5 break-words text-sm font-semibold ${action ? 'text-[#141414]' : 'text-[#646464]'}`}>
                              {action?.name || 'Unassigned'}
                            </dd>
                            {action?.payload?.keys?.length ? <dd className="mt-0.5 break-words font-mono text-[11px] text-[#1351AA]">{action.payload.keys.join(' + ')}</dd> : null}
                          </div>)}
                        </dl>
                        {safety && <p className="mt-2 text-[11px] text-[#444343]">Hold for {((k.longPressThresholdMs || 1500) / 1000).toFixed(1)} seconds. Tap is disabled for this key.</p>}
                      </div>;
                    })() : (
                      <p className="px-3 py-3 text-[11px] text-[#646464] leading-relaxed">Select a key on the virtual deck to see its assignment and edit it.</p>
                    )}
                  </section>

                  {activeLayer.keys.length > 0 && activeLayer.keys.every(k =>
                    !k.tapAction && !k.holdAction && !k.doubleTapAction && !(k.isDestructiveSafety && k.safetyConfirmAction)
                  ) && (
                    <section className="panel mb-4 border-[#A9BCD8] bg-[#F2F6FC]" aria-label="Empty layer keys">
                      <div className="px-3 py-3">
                        <p className="eyebrow eyebrow--ink">Layer {activeChannelIdx} · Keys</p>
                        <p className="mt-1 text-sm font-bold text-[#141414]">No keys assigned yet</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#444343]">Start with a shortcut, text, or an app. The knob may have its own assignments.</p>
                        <button type="button" onClick={() => {
                          const target = activeLayer.keys.find(k => k.keyIndex === selectedKeyIndex) || activeLayer.keys[0];
                          if (!target) return;
                          setSelectedKeyIndex(target.keyIndex); setIsEditingKnob(false); setIsEditingDisplay(false); setEditingKeyBinding(target);
                        }} className="mt-3 border border-[#1351AA] bg-[#1351AA] px-3 py-2 text-xs font-bold text-white hover:bg-[#0f407f]">
                          Assign first key
                        </button>
                      </div>
                    </section>
                  )}

                  {/* Expandable inspector panels retain their native disclosure controls. */}
                  <AnimatedDetails
                    ref={hardwareDiagnosticsRef}
                    id="hardware-diagnostics"
                    open={isHardwareDiagnosticsExpanded}
                    onOpenChange={setIsHardwareDiagnosticsExpanded}
                    className="panel mb-4 shrink-0 min-w-0"
                    summaryClassName="px-3 py-2 cursor-pointer select-none flex items-center justify-between gap-2 border-b border-[#E3E2DE]"
                    summary={<>
                      <span className="eyebrow eyebrow--ink">Hardware Status &amp; Diagnostics</span>
                      <span className="min-w-0 max-w-[42%] flex items-center justify-end gap-2">
                        <span className={`mark shrink-0 ${hardwareState === 'connected' ? 'mark--on' : 'mark--off'}`} aria-hidden="true" />
                        <span className="idx min-w-0 truncate" title={hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}>
                          {hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}
                        </span>
                      </span>
                    </>}
                  >
                    {(renderedOpen) => <>
                      <div className="px-3 pt-2 pb-3">
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#444343] leading-relaxed break-words">
                          {hardwareState === 'connected' ? (deviceInfo?.name || 'DEVICE LINKED') : 'NO DEVICE · SIMULATOR'}
                        </p>
                      </div>
                      <HardwareDiagnosticsPanel
                        isExpanded={isHardwareDiagnosticsExpanded}
                        keepVisible={renderedOpen}
                        actionHistory={actionLogs}
                        onClearHistory={() => setActionLogs([])}
                      />
                    </>}
                  </AnimatedDetails>

                  {/* Real Windows WASAPI Audio Mixer */}
                  <AnimatedDetails className="panel mb-4 shrink-0" summaryClassName="px-3 py-2 cursor-pointer select-none flex items-center justify-between border-b border-[#E3E2DE]"
                    summary={<><span className="eyebrow eyebrow--ink">Audio mixer</span><span className="idx">WASAPI</span></>}>
                    {(renderedOpen) => <div className="p-2 pt-0">
                      <AudioMixerPanel active={renderedOpen} />
                    </div>}
                  </AnimatedDetails>

                  {/* Localhost webhook API (collapsed by default) */}
                  <AnimatedDetails className="panel mb-4 shrink-0" summaryClassName="px-3 py-2 cursor-pointer select-none flex items-center justify-between border-b border-[#E3E2DE]"
                    summary={<><span className="eyebrow eyebrow--ink">Webhook API</span><span className="idx">localhost</span></>}>
                    <div className="px-2 pb-2 max-h-80 overflow-y-auto">
                      <WebhookDocPanel onRunLocally={handleWebhookRequest} />
                    </div>
                  </AnimatedDetails>

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
              </React.Suspense>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsPage theme={theme} onThemeChange={changeTheme} openingAnimation={openingAnimation} onOpeningAnimationChange={changeOpeningAnimation} preferenceNotice={preferenceNotice} safePreview={safePreview} onSafePreviewChange={changeSafePreview}
            onReset={onReset}
            backupPanel={<BackupPanel deck={deck} exportBlocked={deckSaveBlocked || oledSaveBlocked || !!macroStorageError || !!lightingStorageError || Object.keys(storageErrors).length > 0} onRestored={handleBackupRestored} />}
            onOpenWelcome={() => setShowWelcome(true)}
            onOpenHelp={() => setShowHelp(true)}
            onReplayIntro={() => {
              setActiveTab('designer');
              window.setTimeout(() => window.dispatchEvent(new Event(INTRO_REPLAY_EVENT)), 0);
            }} />
        )}

        {activeTab === 'presets' && (
          <PresetsPage key={backupRevision} layers={layers} activeLayerId={activeLayerId}
            onApply={(preset: LayerPreset, layerId: string) => {
              setDeck(current => ({ ...current, layers: current.layers.map(layer =>
                layer.id === layerId ? applyLayerPreset(layer, preset) : layer) }));
              setActiveLayerId(layerId);
              setEditingKeyBinding(null);
              setIsEditingKnob(false);
            }}
            onReviewUpload={() => setIsUploadSheetOpen(true)}
            onTestAction={(action) => handleTriggerAction(action.id, action.name, action.category, action.payload)}
          />
        )}

        {/* TAB 2: VIA KEY MATRIX TESTER */}
        {activeTab === 'tester' && (
          <div className="tester-page flex-1 min-w-0 p-4 sm:p-6 md:p-8 overflow-y-auto bg-[#F4F3F0]">
            <ViaKeyTester />
            <PadInspector deck={deck} state={hardwareState} info={deviceInfo} />
          </div>
        )}



        {/* TAB 3: PC SHORTCUTS VAULT */}
        {activeTab === 'shortcuts' && (
          <div className="flex-1 overflow-y-auto">
            <ShortcutsPanel layers={layers} activeLayerId={activeLayerId} onAssign={(shortcut, layer, keyIndex) => {
              setEditingKeyBinding(null);
              setDeck(current => ({ ...current, layers: current.layers.map((item, index) => index !== layer ? item : {
                ...item, isExample: false, keys: item.keys.map(key => key.keyIndex !== keyIndex ? key : assignShortcutToBinding(key, shortcut)),
              }) }));
            }} />
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
                ← Keys
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
            <ViaMacroEditor key={backupRevision} onTriggerAction={handleTriggerAction} onStorageError={setMacroStorageError} />
          </div>
        )}
        </React.Suspense>

          </div>
        </div>
      </div>

      {brightnessToast && <div aria-hidden="true" data-brightness-indicator className="pointer-events-none fixed bottom-5 right-5 z-[90] w-56 max-w-[calc(100vw-2.5rem)] border border-[#A9BCD8] bg-white px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2 text-sm font-bold text-[#141414]"><Sun className="h-4 w-4 text-[#1351AA]" /> Brightness {brightnessToast.level}%</div>
        <div className="mt-2 h-1.5 bg-[#E3E2DE]"><div className="h-full bg-[#1351AA]" style={{ width: `${brightnessToast.level}%` }} /></div>
        <p className="mt-1 text-[10px] text-[#444343]">{brightnessToast.atLimit ? 'Already at this limit' : 'Requested display level'}</p>
      </div>}

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
        onChangeTab={changeTab}
        deck={deck}
        activeLayer={activeLayer}
        onSelectLayer={handleSelectLayer}
        onOpenDiagnostics={openHardwareDiagnostics}
        onOpenFirmwarePanel={openFirmwarePanel}
        hardwareState={hardwareState}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onOpenUploadSheet={() => setIsUploadSheetOpen(true)}
        onSelectKey={(idx) => {
          setSelectedKeyIndex(idx);
          const k = activeLayer.keys[idx];
          if (k) setEditingKeyBinding(k);
        }}
        onSelectKnob={() => {
          setIsEditingKnob(true);
        }}
        onTriggerAction={(name, detail, type) => pushLog(name, 'palette', type, detail)}
      />
    </div>
  );
};
