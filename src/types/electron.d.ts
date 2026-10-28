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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
