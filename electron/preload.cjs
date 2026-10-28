const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  windowControl: (action) => ipcRenderer.send('window-control', action),
  execAction: (action) => ipcRenderer.invoke('exec-action', action),
  onHardwareEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('hardware-event', listener);
    return () => ipcRenderer.removeListener('hardware-event', listener);
  },
  sendOLEDUpdate: (data) => ipcRenderer.send('oled-update', data),
  reportProfiles: (items, activeId) => ipcRenderer.send('profiles-sync', { items, activeId }),

  getWebhookInfo: () => ipcRenderer.invoke('get-webhook-info'),

  discoverApps: () => ipcRenderer.invoke('discover-apps'),
  launchApp: (appInfo) => ipcRenderer.invoke('launch-app', appInfo),
  browseForApp: () => ipcRenderer.invoke('browse-for-app'),
  getAppIcon: (exePath) => ipcRenderer.invoke('get-app-icon', exePath),

  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  onSystemMetrics: (callback) => {
    const listener = (_event, metrics) => callback(metrics);
    ipcRenderer.on('system-metrics', listener);
    return () => ipcRenderer.removeListener('system-metrics', listener);
  },

  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  onActiveWindowChanged: (callback) => {
    const listener = (_event, winInfo) => callback(winInfo);
    ipcRenderer.on('active-window-changed', listener);
    return () => ipcRenderer.removeListener('active-window-changed', listener);
  },

  // Real Windows Audio & Per-App Mixer
  getMasterVolume: () => ipcRenderer.invoke('audio:volume:get'),
  setMasterVolume: (percent) => ipcRenderer.invoke('audio:volume:set', percent),
  adjustMasterVolume: (delta) => ipcRenderer.invoke('audio:volume:adjust', delta),
  getMasterMute: () => ipcRenderer.invoke('audio:mute:get'),
  setMasterMute: (muted) => ipcRenderer.invoke('audio:mute:set', muted),
  toggleMasterMute: () => ipcRenderer.invoke('audio:mute:toggle'),
  getMic: () => ipcRenderer.invoke('audio:mic:get'),
  setMic: (opts) => ipcRenderer.invoke('audio:mic:set', opts),
  listAudioDevices: () => ipcRenderer.invoke('audio:devices:list'),
  setActiveAudioDevice: (id) => ipcRenderer.invoke('audio:devices:set', id),
  getProcessVolume: (target) => ipcRenderer.invoke('audio:process:volume:get', target),
  setProcessVolume: (target, percent) => ipcRenderer.invoke('audio:process:volume:set', target, percent),
  adjustProcessVolume: (target, delta) => ipcRenderer.invoke('audio:process:volume:adjust', target, delta),
  setProcessMute: (target, muted) => ipcRenderer.invoke('audio:process:mute:set', target, muted),
  sampleAudioLevels: () => ipcRenderer.invoke('audio:levels:sample'),
  getNowPlaying: () => ipcRenderer.invoke('audio:now-playing:get'),
});
