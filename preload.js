const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  console.log('Goed Acsess desktop siap.');
});

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, data) => callback(data)),
  checkUpdateNow: () => ipcRenderer.invoke('check-update-now'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getCameraStatus: () => ipcRenderer.invoke('get-camera-status'),
  requestCameraAccess: () => ipcRenderer.invoke('request-camera-access')
});
