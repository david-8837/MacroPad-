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
});
