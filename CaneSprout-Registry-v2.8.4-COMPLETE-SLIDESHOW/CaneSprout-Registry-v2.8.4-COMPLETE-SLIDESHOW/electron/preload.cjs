const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('germDesktop', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  close: () => ipcRenderer.invoke('window:close'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateStatus: (callback) => ipcRenderer.on('updates:status', (_event, payload) => callback(payload))
});
