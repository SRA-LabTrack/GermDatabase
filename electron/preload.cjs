const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('germDesktop', {
  isDesktop: true,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  close: () => ipcRenderer.invoke('window:close'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getDataPath: () => ipcRenderer.invoke('app:data-path'),
  flushLocalStorage: () => ipcRenderer.invoke('app:flush-storage'),
  offlineAuth: {
    status: () => ipcRenderer.invoke('offline-auth:status'),
    remember: (payload) => ipcRenderer.invoke('offline-auth:remember', payload),
    unlock: (payload) => ipcRenderer.invoke('offline-auth:unlock', payload),
    forget: () => ipcRenderer.invoke('offline-auth:forget'),
    restoreOnlineSession: (payload) => ipcRenderer.invoke('offline-auth:restore-online-session', payload)
  },
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  }
});
