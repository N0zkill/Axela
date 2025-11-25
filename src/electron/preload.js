const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  getStartupSettings: () => ipcRenderer.invoke('get-startup-settings'),
  setStartupSettings: (settings) => ipcRenderer.invoke('set-startup-settings', settings),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

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

let appVersion = '1.0.0';
try {
  const fs = require('fs');
  const path = require('path');
  const packagePath = path.join(__dirname, '../../package.json');
  if (fs.existsSync(packagePath)) {
    appVersion = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  }
} catch (e) {
  appVersion = '1.0.0';
}

contextBridge.exposeInMainWorld('appInfo', {
  version: appVersion,
  platform: process.platform,
  arch: process.arch
});
