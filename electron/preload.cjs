const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  windowControl: (action) => ipcRenderer.send('window-control', action),
  execAction: (action) => ipcRenderer.invoke('exec-action', action),
  onHardwareEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('hardware-event', listener);
    return () => ipcRenderer.removeListener('hardware-event', listener);
  },
  reportDeck: (deck) => ipcRenderer.send('deck-sync', deck),

  getWebhookInfo: () => ipcRenderer.invoke('get-webhook-info'),

  discoverApps: () => ipcRenderer.invoke('discover-apps'),
  launchApp: (appInfo) => ipcRenderer.invoke('launch-app', appInfo),
  browseForApp: () => ipcRenderer.invoke('browse-for-app'),

  onSystemMetrics: (callback) => {
    const listener = (_event, metrics) => callback(metrics);
    ipcRenderer.on('system-metrics', listener);
    return () => ipcRenderer.removeListener('system-metrics', listener);
  },

  // Real Windows Audio & Per-App Mixer
  // Windows media session (SMTC): the track the OS says is playing, or null.
  getNowPlaying: () => ipcRenderer.invoke('media:now-playing'),
  onMediaState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('media-state-changed', listener);
    return () => ipcRenderer.removeListener('media-state-changed', listener);
  },

  getMasterVolume: () => ipcRenderer.invoke('audio:volume:get'),
  setMasterVolume: (percent) => ipcRenderer.invoke('audio:volume:set', percent),
  adjustMasterVolume: (delta) => ipcRenderer.invoke('audio:volume:adjust', delta),
  getMasterMute: () => ipcRenderer.invoke('audio:mute:get'),
  toggleMasterMute: () => ipcRenderer.invoke('audio:mute:toggle'),
  getMic: () => ipcRenderer.invoke('audio:mic:get'),
  setMic: (opts) => ipcRenderer.invoke('audio:mic:set', opts),

  // System Diagnostics & Health Logging
  getDiagnosticLog: () => ipcRenderer.invoke('diag:log'),
  runDiagnosticSelfTest: () => ipcRenderer.invoke('diag:selftest'),

  // In-App RP2040 Firmware Flasher
  getFirmwareStatus: () => ipcRenderer.invoke('firmware:status'),
  getBuiltinFirmware: () => ipcRenderer.invoke('firmware:builtin'),
  flashBuiltinFirmware: () => ipcRenderer.invoke('firmware:flashBuiltin'),
  browseFirmwareUf2: () => ipcRenderer.invoke('firmware:browse'),
  flashFirmwareUf2: (filePath) => ipcRenderer.invoke('firmware:flash', filePath),
  onFirmwareFlashProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('firmware-flash-progress', listener);
    return () => ipcRenderer.removeListener('firmware-flash-progress', listener);
  },
});
