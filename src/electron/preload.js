const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  sendCommand: (command, mode) => ipcRenderer.invoke('send-command', command, mode),

  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  appQuit: () => ipcRenderer.invoke('app-quit'),
  appMinimize: () => ipcRenderer.invoke('app-minimize'),
  appMaximize: () => ipcRenderer.invoke('app-maximize'),

  reloadHotkeys: () => ipcRenderer.invoke('reload-hotkeys'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  isBackendRestarting: () => ipcRenderer.invoke('is-backend-restarting'),

  onBackendLog: (callback) => {
    ipcRenderer.on('backend-log', (event, data) => callback(data));
  },
  onBackendError: (callback) => {
    ipcRenderer.on('backend-error', (event, data) => callback(data));
  },
  onHotkeyPressed: (callback) => {
    ipcRenderer.on('hotkey-pressed', (event, hotkey) => callback(hotkey));
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

contextBridge.exposeInMainWorld('appInfo', {
  version: require('../../package.json').version,
  platform: process.platform,
  arch: process.arch
});
