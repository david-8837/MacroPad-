const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('startup', {
  retry: () => ipcRenderer.send('startup:retry'),
  quit: () => ipcRenderer.send('startup:quit'),
  onFailure: (callback) => ipcRenderer.on('startup:failure', () => callback()),
});
