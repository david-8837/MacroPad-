export type ActionCategory = 
  | 'hotkey' 
  | 'media' 
  | 'audio_session' 
  | 'obs' 
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
    // For media
    mediaAction?: 'play_pause' | 'next' | 'prev' | 'volume_up' | 'volume_down' | 'mute';
    // For audio_session (WASAPI)
    processName?: string; // 'spotify.exe', 'discord.exe', 'master', 'focus'
    audioDelta?: number; // +5, -5
    toggleMute?: boolean;
    // For OBS
    obsAction?: 'switch_scene' | 'toggle_stream' | 'toggle_record' | 'mute_source';
    obsTarget?: string;
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
    targetProfileId?: string;
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
}

export interface Profile {
  id: string;
  name: string;
  icon: string;
  targetProcess?: string; // e.g. 'code.exe', 'resolve.exe', 'obs64.exe'
  windowTitleRegex?: string;
  isLocked?: boolean;
  layers: Layer[];
  activeLayerId: string;
}

export type OLEDMode = 'system' | 'visualizer' | 'media' | 'kadowaz' | 'channel';

export interface OLEDState {
  mode: OLEDMode;
  cpuLoad: number;
  gpuLoad: number;
  ramUsage: number;
  cpuTemp: number;
  nowPlayingTrack: string;
  nowPlayingArtist: string;
  isPlaying: boolean;
  trackProgress: number; // 0 to 100
  audioVULeft: number; // 0 to 100
  audioVURight: number;
  customTitle?: string;
  customSubtitle?: string;
  brightness?: number; // 0 to 100
  inverted?: boolean;
  screensaverMinutes?: number;
}

export interface AudioSessionItem {
  id: string;
  name: string;
  process: string;
  icon: string;
  volume: number; // 0 to 100
  isMuted: boolean;
  peakDb: number;
}

export interface OBSState {
  isConnected: boolean;
  isStreaming: boolean;
  isRecording: boolean;
  currentScene: string;
  scenes: string[];
  droppedFrames: number;
  fps: number;
  kbitrate: number;
}

export interface OSDNotification {
  id: string;
  title: string;
  subtitle: string;
  type: 'layer_switch' | 'action_toast' | 'warning';
  icon?: string;
  durationMs?: number;
}
