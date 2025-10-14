const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage, net } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store');

const store = new Store();

class AxelaDesktop {
  constructor() {
    this.mainWindow = null;
    this.pythonProcess = null;
    this.isQuitting = false;
    this.registeredHotkeys = new Set();
    this.tray = null;
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, '../assets/icon.png'),
      titleBarStyle: 'default',
      show: false
    });

    const startUrl = isDev
      ? 'http://localhost:5173'
      : `file://${path.join(__dirname, '../dist/index.html')}`;

    this.mainWindow.loadURL(startUrl);

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();

      // Remove menu bar
      this.mainWindow.setMenuBarVisibility(false);

      if (isDev) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });
  }

  startPythonBackend() {
    if (this.pythonProcess) {
      return;
    }

    const pythonPath = isDev
      ? path.join(__dirname, '../../backend/main.py')
      : path.join(process.resourcesPath, 'backend/main.py');

    console.log('Starting Python backend:', pythonPath);

    // Use 'py' on Windows, 'python3' on others
    const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';

    this.pythonProcess = spawn(pythonCommand, [pythonPath, '--api-mode', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: path.dirname(pythonPath),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.pythonProcess.stdout.on('data', (data) => {
      console.log(`Python Backend: ${data}`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('backend-log', data.toString());
      }
    });

    this.pythonProcess.stderr.on('data', (data) => {
      console.error(`Python Backend Error: ${data}`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('backend-error', data.toString());
      }
    });

    this.pythonProcess.on('close', (code) => {
      console.log(`Python backend exited with code ${code}`);
      this.pythonProcess = null;
    });
  }

  stopPythonBackend() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }
  }

  createTray() {
    // Create a simple tray icon
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIDSURBVFhH7ZbPK0RRGMXfmzGTH0mhLCRlY2Oj/AFsbCwsLCz8A2zs/ANsbP0BNhY2FhYWioWFhZKFhYWFhR/JjzLMvE/nO3Pfa+69782beRs+9U7de+ec7517752ZJP+peDxuYRiGYRiGYf4ner0eHA6Hg16vB6vVCpPJBJPJBKvVCh6PB263Gw6HQxOJRCKQyWQgl8tZr9erCYfDkMlkkEqlrFarJRKJhCWTSSiVSiiVStZqtUQikbBkMgmFQgGFQsHa7bZIJBKWTCYhk8kgl8tBrVajWq2yZrMpEolEIpGI1Ot1qFQqKJVK1mg0RCKRSCQSiUQ8Ho/b7XY4nU44nU643W54vV54PB5YrVaYzWaYTCYYDAbo9XrodDrodDpoNBqo1WpQqVRQKBRQKBSQy+WQy+Ugk8lAJpOBVCoFqVQKUqkUJBIJSCQSkEgkIBaLQSwWg0gkApFIBEKhEIRCIQiFQhAIBCAQCEAgEAC/3w98Ph/4fD7w+Xzg8/nA5/OBz+cDj8cDHo8HXC4XuFwucLlc4HK5wOVygcvlApfLBS6XC1wuF7hcLnC5XOByucDhcIDD4QCHwwEOhwMcDgfYbDaw2WxgsVjAYrGAxWIBi8UCFosFLBYLWCwWMJlMYDKZwGQygclkApPJBCaTCUwmE5hMJjAYDGAwGMBgMIDBYACDwQAGgwF0Oh3odDrQ6XSg0+lAo9GARqMBjUYDarU6Sfp/JQB8A+vO/NfPAAAAAElFTkSuQmCC');
    
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show AXELA',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      },
      {
        label: 'Hide to Tray',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.hide();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit AXELA',
        click: () => {
          this.isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    this.tray.setToolTip('AXELA - AI Assistant (Click to show/hide)');
    this.tray.setContextMenu(contextMenu);
    
    // Single click to show/hide
    this.tray.on('click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      }
    });
    
    // Double click also works
    this.tray.on('double-click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      }
    });
  }

  async loadAndRegisterHotkeys() {
    try {
      const request = net.request({
        method: 'GET',
        url: 'http://127.0.0.1:8000/config'
      });

      request.on('response', (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            const config = JSON.parse(data);
            const hotkeys = config.config?.hotkeys || {};
            this.registerHotkeys(hotkeys);
          } catch (error) {
            console.error('Failed to parse hotkeys config:', error);
          }
        });
      });

      request.on('error', (error) => {
        console.error('Failed to load hotkeys:', error);
      });

      request.end();
    } catch (error) {
      console.error('Failed to load hotkeys:', error);
    }
  }

  registerHotkeys(hotkeys) {
    // Unregister all existing hotkeys
    this.unregisterAllHotkeys();

    // Register toggle voice
    if (hotkeys.toggle_voice) {
      const accelerator = this.normalizeAccelerator(hotkeys.toggle_voice);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            if (this.mainWindow) {
              this.mainWindow.webContents.send('hotkey-pressed', 'toggle_voice');
            }
          });
          if (registered) {
            this.registeredHotkeys.add(accelerator);
            console.log(`Registered toggle voice hotkey: ${accelerator}`);
          }
        } catch (error) {
          console.error(`Failed to register toggle voice hotkey ${accelerator}:`, error);
        }
      }
    }

    // Register minimize to tray
    if (hotkeys.minimize_to_tray) {
      const accelerator = this.normalizeAccelerator(hotkeys.minimize_to_tray);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            if (this.mainWindow) {
              if (this.mainWindow.isVisible()) {
                this.mainWindow.hide();
                console.log('App minimized to tray');
              } else {
                this.mainWindow.show();
                this.mainWindow.focus();
                console.log('App restored from tray');
              }
            }
          });
          if (registered) {
            this.registeredHotkeys.add(accelerator);
            console.log(`Registered minimize to tray hotkey: ${accelerator}`);
          }
        } catch (error) {
          console.error(`Failed to register minimize to tray hotkey ${accelerator}:`, error);
        }
      }
    }

    // Register emergency stop
    if (hotkeys.emergency_stop) {
      const accelerator = this.normalizeAccelerator(hotkeys.emergency_stop);
      if (accelerator) {
        try {
          const registered = globalShortcut.register(accelerator, () => {
            console.log('🚨 EMERGENCY STOP TRIGGERED! 🚨');
            
            // Kill the Python backend process
            if (this.pythonProcess && this.pythonProcess.pid) {
              console.log(`Killing Python backend process (PID: ${this.pythonProcess.pid})...`);
              
              try {
                if (process.platform === 'win32') {
                  // On Windows, use taskkill to force terminate
                  const { exec } = require('child_process');
                  exec(`taskkill /PID ${this.pythonProcess.pid} /T /F`, (error) => {
                    if (error) {
                      console.error('Error killing process:', error);
                    } else {
                      console.log('✅ Python backend terminated');
                    }
                  });
                } else {
                  // On Unix-like systems
                  this.pythonProcess.kill('SIGKILL');
                }
                
                this.pythonProcess = null;
              } catch (error) {
                console.error('Error during emergency stop:', error);
              }
            } else {
              console.log('No Python process to kill');
            }
            
            // Notify the UI
            if (this.mainWindow) {
              this.mainWindow.webContents.send('hotkey-pressed', 'emergency_stop');
            }
          });
          if (registered) {
            this.registeredHotkeys.add(accelerator);
            console.log(`✅ Registered emergency stop hotkey: ${accelerator}`);
          } else {
            console.error(`❌ Failed to register emergency stop hotkey: ${accelerator}`);
          }
        } catch (error) {
          console.error(`Failed to register emergency stop hotkey ${accelerator}:`, error);
        }
      }
    }
  }

  normalizeAccelerator(hotkey) {
    if (!hotkey) return null;
    
    // Convert to Electron's format
    return hotkey
      .split('+')
      .map(key => {
        const lower = key.toLowerCase().trim();
        if (lower === 'ctrl') return 'CommandOrControl';
        if (lower === 'alt') return 'Alt';
        if (lower === 'shift') return 'Shift';
        if (lower === 'cmd' || lower === 'command') return 'Command';
        if (lower === 'space') return 'Space';
        return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
      })
      .join('+');
  }

  unregisterAllHotkeys() {
    this.registeredHotkeys.forEach(accelerator => {
      try {
        globalShortcut.unregister(accelerator);
      } catch (error) {
        console.error(`Failed to unregister hotkey ${accelerator}:`, error);
      }
    });
    this.registeredHotkeys.clear();
  }

  setupIPC() {
    ipcMain.handle('get-setting', (event, key) => {
      return store.get(key);
    });

    ipcMain.handle('set-setting', (event, key, value) => {
      store.set(key, value);
      return true;
    });

    ipcMain.handle('send-command', async (event, command, mode = 'ai') => {
      try {
        const response = await fetch('http://localhost:8000/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ command, mode })
        });

        return await response.json();
      } catch (error) {
        console.error('Failed to send command to backend:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      const result = await dialog.showOpenDialog(this.mainWindow, options);
      return result;
    });

    ipcMain.handle('show-save-dialog', async (event, options) => {
      const result = await dialog.showSaveDialog(this.mainWindow, options);
      return result;
    });

    ipcMain.handle('app-quit', () => {
      this.isQuitting = true;
      app.quit();
    });

    ipcMain.handle('app-minimize', () => {
      if (this.mainWindow) {
        this.mainWindow.minimize();
      }
    });

    ipcMain.handle('app-maximize', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMaximized()) {
          this.mainWindow.unmaximize();
        } else {
          this.mainWindow.maximize();
        }
      }
    });

    ipcMain.handle('reload-hotkeys', async () => {
      await this.loadAndRegisterHotkeys();
      return { success: true };
    });

    ipcMain.handle('restart-backend', () => {
      console.log('Restarting backend...');
      this.stopPythonBackend();
      setTimeout(() => {
        this.startPythonBackend();
      }, 1000);
      return { success: true };
    });
  }
}

const axelaDesktop = new AxelaDesktop();

app.whenReady().then(() => {
  axelaDesktop.createWindow();
  axelaDesktop.createTray();
  axelaDesktop.setupIPC();
  axelaDesktop.startPythonBackend();

  // Wait for backend to start, then load hotkeys
  setTimeout(() => {
    axelaDesktop.loadAndRegisterHotkeys();
  }, 2000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      axelaDesktop.createWindow();
    } else if (axelaDesktop.mainWindow) {
      axelaDesktop.mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    axelaDesktop.stopPythonBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  axelaDesktop.isQuitting = true;
  axelaDesktop.unregisterAllHotkeys();
  axelaDesktop.stopPythonBackend();
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
