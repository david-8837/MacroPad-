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

export interface ElectronAPI {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  execAction: (action: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  onHardwareEvent: (callback: (value: ElectronHardwareEvent) => void) => () => void;
  sendOLEDUpdate: (data: unknown) => void;
  discoverApps: () => Promise<unknown>;
  launchApp: (appInfo: unknown) => Promise<{ success: boolean; error?: string }>;
  browseForApp: () => Promise<unknown>;
  getAppIcon: (exePath: string) => Promise<string>;
  reportProfiles: (profiles: { id: string; name: string }[], activeId: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
