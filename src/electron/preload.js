const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
  setStartupSettings: (settings) => ipcRenderer.invoke('set-startup-settings', settings),

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
  onChatUpdate: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('chat-update', subscription);
    return () => ipcRenderer.removeListener('chat-update', subscription);
  },
  sendChatUpdate: (data) => ipcRenderer.send('chat-update-from-renderer', data),

  // Overlay command handling
  sendOverlayCommand: (command) => ipcRenderer.send('overlay-command', command),
  onOverlayCommand: (callback) => {
    const subscription = (event, command) => callback(command);
    ipcRenderer.on('execute-overlay-command', subscription);
    return () => ipcRenderer.removeListener('execute-overlay-command', subscription);
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
