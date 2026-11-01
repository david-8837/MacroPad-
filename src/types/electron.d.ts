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

/** One frame of the Windows media session, or null when nothing is playing. */
export interface NowPlayingInfo {
  title: string;
  artist: string;
  album: string;
  app: string | null;
  isPlaying: boolean;
  positionS: number;
  durationS: number;
  /** 0-100, derived from positionS / durationS. */
  progress: number;
}

export interface SystemMetrics {
  /** null = not measured on this machine. The panel draws `--` for null. */
  cpu: number | null;
  ram: number | null;
  gpu: number | null;
  temp: number | null;
  /** Which subsystem answered for each value, e.g. {cpu:'typeperf',gpu:'NVIDIA'}. */
  sources?: { cpu: string | null; gpu: string | null; temp: string | null };
  detail?: {
    cores?: number;
    ramUsedGb?: number;
    ramTotalGb?: number;
    gpuSource?: string | null;
    tempSource?: string | null;
  };
}

export interface ElectronAPI {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  execAction: (action: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onHardwareEvent: (callback: (value: ElectronHardwareEvent) => void) => () => void;
  getWebhookInfo: () => Promise<{ port: number; token: string; listening: boolean }>;
  discoverApps: () => Promise<unknown>;
  launchApp: (appInfo: unknown) => Promise<{ success: boolean; error?: string }>;
  browseForApp: () => Promise<unknown>;
  reportDeck: (deck: { id: string; name: string }) => void;
  onSystemMetrics?: (callback: (metrics: SystemMetrics) => void) => () => void;

  getNowPlaying?: () => Promise<{ ok: boolean; value?: NowPlayingInfo | null; error?: string }>;
  onMediaState?: (callback: (state: NowPlayingInfo | null) => void) => () => void;

  getMasterVolume?: () => Promise<{ ok: boolean; value?: number; error?: string }>;
  setMasterVolume?: (percent: number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  adjustMasterVolume?: (delta: number) => Promise<{ ok: boolean; value?: number; error?: string }>;
  getMasterMute?: () => Promise<{ ok: boolean; value?: boolean; error?: string }>;
  toggleMasterMute?: () => Promise<{ ok: boolean; value?: boolean; error?: string }>;
  getMic?: () => Promise<{ ok: boolean; value?: { muted: boolean; level: number }; error?: string }>;
  setMic?: (opts: { muted?: boolean; level?: number }) => Promise<{ ok: boolean; error?: string }>;

  getDiagnosticLog?: () => Promise<{ ok: boolean; value: DiagnosticLogEntry[] }>;
  runDiagnosticSelfTest?: () => Promise<{ ok: boolean; value: DiagnosticSelfTestResult }>;

  // RP2040 Firmware Flashing
  getFirmwareStatus?: () => Promise<FirmwareStatus>;
  listBuiltinFirmware?: () => Promise<FirmwareOption[]>;
  flashBuiltinFirmware?: (id: string, acknowledgedUntested: boolean) => Promise<{ ok: boolean; value?: Uf2Inspection & { flashed: boolean; note?: string }; error?: string }>;
  onFirmwareFlashProgress?: (callback: (progress: FlashProgress) => void) => () => void;
}

export interface FirmwareOption {
  id: string;
  name: string;
  description: string;
  available: boolean;
  untested: boolean;
  inspection?: Uf2Inspection;
  error?: string;
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
  webhook: { ok: boolean; detail: string };
  time: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
