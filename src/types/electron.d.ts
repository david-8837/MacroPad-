export interface ElectronHardwareEvent {
  source?: string;
  action?: string;
  actionId?: string;
  id?: string;
  endpoint?: string;
  data?: Record<string, unknown>;
  status?: string;
  error?: string;
}

export interface SystemMetrics {
  cpu: number;
  ram: number;
  gpu: number;
  temp: number;
  detail?: {
    cores?: number;
    ramUsedGb?: number;
    ramTotalGb?: number;
    gpuSource?: string | null;
    tempSource?: string | null;
  };
}

export interface ActiveWindowInfo {
  title: string;
  app: string;
  exePath?: string;
  pid?: number;
}

export interface AudioDevice {
  id: string;
  name: string;
  kind: 'input' | 'output';
  active: boolean;
}

export interface NowPlayingInfo {
  title: string;
  artist: string;
  position: number;
  duration: number;
}

export interface ObsState {
  connected: boolean;
  streaming: boolean;
  recording: boolean;
  currentScene: string | null;
  scenes: string[];
  sources: string[];
  mutedSources: string[];
  error?: string;
}

export interface ElectronAPI {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  execAction: (action: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onHardwareEvent: (callback: (value: ElectronHardwareEvent) => void) => () => void;
  sendOLEDUpdate: (data: unknown) => void;
  getWebhookInfo: () => Promise<{ port: number; token: string; listening: boolean }>;
  discoverApps: () => Promise<unknown>;
  launchApp: (appInfo: unknown) => Promise<{ success: boolean; error?: string }>;
  browseForApp: () => Promise<unknown>;
  getAppIcon: (exePath: string) => Promise<string>;
  reportProfiles: (profiles: { id: string; name: string }[], activeId: string) => void;
  getSystemMetrics?: () => Promise<{ ok: boolean; value?: SystemMetrics; error?: string }>;
  onSystemMetrics?: (callback: (metrics: SystemMetrics) => void) => () => void;
  getActiveWindow?: () => Promise<{ ok: boolean; value?: ActiveWindowInfo; error?: string }>;
  onActiveWindowChanged?: (callback: (win: ActiveWindowInfo) => void) => () => void;

  getMasterVolume?: () => Promise<{ ok: boolean; value?: number; error?: string }>;
  setMasterVolume?: (percent: number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  adjustMasterVolume?: (delta: number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  getMasterMute?: () => Promise<{ ok: boolean; value?: boolean; error?: string }>;
  setMasterMute?: (muted: boolean) => Promise<{ ok: boolean; value?: boolean; error?: string }>;
  toggleMasterMute?: () => Promise<{ ok: boolean; value?: boolean; error?: string }>;
  getMic?: () => Promise<{ ok: boolean; value?: { muted: boolean; level: number }; error?: string }>;
  setMic?: (opts: { muted?: boolean; level?: number }) => Promise<{ ok: boolean; error?: string }>;
  listAudioDevices?: () => Promise<{ ok: boolean; value?: AudioDevice[]; error?: string }>;
  setActiveAudioDevice?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  getProcessVolume?: (target: string | number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  setProcessVolume?: (target: string | number, percent: number) => Promise<{ ok: boolean; error?: string }>;
  adjustProcessVolume?: (target: string | number, delta: number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  setProcessMute?: (target: string | number, muted: boolean) => Promise<{ ok: boolean; error?: string }>;
  sampleAudioLevels?: () => Promise<{ master: number; mic: number }>;
  getNowPlaying?: () => Promise<{ ok: boolean; value?: NowPlayingInfo | null; error?: string }>;

  obsConnect?: (url?: string, password?: string) => Promise<{ ok: boolean; error?: string }>;
  obsDisconnect?: () => Promise<{ ok: boolean }>;
  obsGetState?: () => Promise<{ ok: boolean; value: ObsState }>;
  obsCommand?: (action: string, arg?: unknown) => Promise<{ ok: boolean; error?: string }>;
  onObsStateChanged?: (callback: (state: ObsState) => void) => () => void;

  getDiagnosticLog?: () => Promise<{ ok: boolean; value: DiagnosticLogEntry[] }>;
  runDiagnosticSelfTest?: () => Promise<{ ok: boolean; value: DiagnosticSelfTestResult }>;

  // RP2040 Firmware Flashing
  getFirmwareStatus?: () => Promise<FirmwareStatus>;
  browseFirmwareUf2?: () => Promise<({ filePath: string; ok: boolean; value?: Uf2Inspection; error?: string }) | null>;
  inspectFirmwareUf2?: (filePath: string) => Promise<{ ok: boolean; value?: Uf2Inspection; error?: string }>;
  flashFirmwareUf2?: (filePath: string) => Promise<{ ok: boolean; value?: Uf2Inspection & { flashed: boolean; note?: string }; error?: string }>;
  onFirmwareFlashProgress?: (callback: (progress: FlashProgress) => void) => () => void;
}

export interface FirmwareStatus {
  inBootloader: boolean;
  drivePath: string | null;
  driveInfo: string | null;
}

export interface Uf2Inspection {
  blockCount: number;
  firmwareBytes: number;
  fileBytes: number;
  family: string;
  targetAddress: string;
  firstSeq: number;
  version: string | null;
}

export interface FlashProgress {
  stage: 'copying' | 'rebooting' | 'done';
  percent: number;
}

export interface DiagnosticLogEntry {
  at: number;
  where: string;
  message: string;
  extra?: string | null;
}

export interface DiagnosticSelfTestResult {
  system: { ok: boolean; detail: string };
  audio: { ok: boolean; detail: string };
  obs: { ok: boolean; detail: string };
  webhook: { ok: boolean; detail: string };
  time: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
