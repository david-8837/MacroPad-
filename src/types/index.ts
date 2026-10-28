export type ActionCategory = 
  | 'hotkey' 
  | 'media' 
  | 'audio_session' 
  | 'midi' 
  | 'script' 
  | 'navigation'
  | 'app_launch';

// Discovered Application from the Electron main process
export interface DiscoveredApp {
  id: string;
  name: string;
  exePath: string;
  iconDataUrl: string;
  iconPath?: string;
  category: string;
  source: string;
  isValid: boolean;
  launchArgs: string;
  targetType?: 'executable' | 'uwp' | 'shortcut';
  appId?: string;
  lastAssignedAt?: number;
}

export interface ActionDefinition {
  id: string;
  category: ActionCategory;
  name: string;
  description?: string;
  icon?: string;
  payload: {
    // For hotkey
    keys?: string[];
    /** A raw QMK/VIA keycode the pad sends itself (MO(1), KC_NO, …). The host
     *  cannot type these, and says so instead of pretending. */
    keycode?: string;
    // For media
    mediaAction?: 'play_pause' | 'next' | 'prev' | 'volume_up' | 'volume_down' | 'mute';
    // For audio_session (WASAPI)
    processName?: string; // 'spotify.exe', 'discord.exe', 'master', 'focus'
    audioDelta?: number; // +5, -5
    toggleMute?: boolean;
    // For MIDI
    midiType?: 'note_on' | 'cc' | 'mcu_transport';
    midiChannel?: number;
    midiNote?: number;
    midiCC?: number;
    midiValue?: number;
    // For script
    shellType?: 'powershell' | 'cmd' | 'bash';
    command?: string;
    // For navigation
    targetLayerId?: string;
    // For app_launch
    appId?: string;
    appName?: string;
    exePath?: string;
    launchArgs?: string;
    focusExisting?: boolean;
    launchMinimized?: boolean;
    iconDataUrl?: string;
    targetType?: 'executable' | 'uwp' | 'shortcut';
    source?: string;
  };
}

export interface KeyBinding {
  keyIndex: number; // 0 to 8 (9 keys)
  label: string;
  sublabel?: string;
  iconName: string;
  accentColor?: string;
  
  // Temporal State Mechanics
  tapAction: ActionDefinition | null;
  holdAction: ActionDefinition | null; // Mod-Tap
  doubleTapAction: ActionDefinition | null; // Tap Dance
  
  // Long-Press Safety Isolation
  isDestructiveSafety?: boolean;
  longPressThresholdMs?: number; // default 1500ms
  safetyConfirmAction?: ActionDefinition | null;
}

export interface DialBinding {
  label: string;
  activeModeName: string; // e.g. "Master Vol", "Scrub", "Discord"
  availableModes: string[];
  cwAction: ActionDefinition;
  ccwAction: ActionDefinition;
  pressAction: ActionDefinition; // or mode cycle
  holdAction?: ActionDefinition; // custom action on hold, or channel switch!
  
  // Hold-to-Switch Channel mechanics
  channelHoldThresholdMs?: number; // Duration in ms to hold knob before switching channel (default: 800ms)
  
  // Velocity Acceleration Settings
  accelerationCurve: 'linear' | 'exponential' | 'precision_nudge';
  sensitivity: number; // 1 to 10
}

export interface Layer {
  id: string;
  name: string;
  badge: string;
  accentColor: string;
  keys: KeyBinding[];
  dial: DialBinding;
  /** True until you change something in this layer. The shipped deck fills
   *  layer 0 with an editing set so a new install is not a blank slab; the tag
   *  says so, and editing a key takes the tag away. */
  isExample?: boolean;
}

/**
 * A deck is the single keymap this app edits: four layers, nine keys each.
 * (The old multi-`Profile` model was removed — one deck per install.)
 */
export interface Deck {
  id: string;
  name: string;
  isLocked?: boolean;
  layers: Layer[];
  activeLayerId: string;
}

// The panel catalogue is the single source of truth for what the OLED can show.
// See `src/oled/modes.ts`.
import type { OLEDMode as OLEDModeId } from '../oled/modes';

export type OLEDMode = OLEDModeId;

/**
 * What the panel draws, plus the facts behind it.
 *
 * Every measured value is `number | null`, and `null` means "not measured on this
 * machine", not "zero". The panel prints `--` for null and the drawer names the
 * subsystem that answered, so the screen cannot claim a reading it does not have.
 */
export interface OLEDState {
  mode: OLEDMode;
  cpuLoad: number | null;
  gpuLoad: number | null;
  ramUsage: number | null;
  cpuTemp: number | null;
  nowPlayingTrack: string | null;
  nowPlayingArtist: string | null;
  isPlaying: boolean;
  trackProgress: number | null; // 0 to 100, null when there is no timeline
  /** WM_SESSION / SMTC extras the drawer shows but the 128px panel does not. */
  nowPlayingApp?: string | null;
  trackPositionS?: number | null;
  trackDurationS?: number | null;
  /** Which subsystem answered for each metric: { cpu: 'typeperf', gpu: 'NVIDIA' }. */
  metricsSource?: { cpu: string | null; gpu: string | null; temp: string | null } | null;
  customTitle?: string;
  customSubtitle?: string;
  brightness?: number; // 0 to 100
  inverted?: boolean;
  /**
   * Seconds each playlist entry stays on the panel before the next one. The
   * panel has no touchscreen, so this timer — not a click — is what advances it.
   * 0 disables automatic switching. Stored as one byte in cfg_global_t.
   */
  autoCycleS?: number;
  /**
   * Screens in the rotation, catalogue order. Stored on the device as the
   * `oled_playlist` bitmask; empty/undefined means every mode.
   */
  playlist?: OLEDModeId[];
}

export interface OSDNotification {
  id: string;
  title: string;
  subtitle: string;
  type: 'layer_switch' | 'action_toast' | 'warning';
  icon?: string;
  durationMs?: number;
}
