const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage, net } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const Store = require('electron-store');

const isDev = !app.isPackaged;

function getAppPath() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  return app.getAppPath();
}

const store = new Store({
  name: 'axela-config',
  defaults: {}
});

class AxelaDesktop {
  constructor() {
    this.mainWindow = null;
    this.pythonProcess = null;
    this.isQuitting = false;
    this.isRestarting = false;
    this.registeredHotkeys = new Set();
    this.tray = null;
    this.overlayWindow = null;
  }

  createOverlayWindow() {
    if (this.overlayWindow) return;

    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

    this.overlayWindow = new BrowserWindow({
      width: 350,
      height: 400,
      x: width - 370,
      y: height - 420,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      show: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    if (isDev) {
      this.overlayWindow.loadURL('http://localhost:5173/#/overlay');
    } else {
      const htmlPath = path.join(getAppPath(), 'dist', 'index.html');
      console.log('Loading overlay file:', htmlPath);
      this.overlayWindow.loadFile(htmlPath);
      this.overlayWindow.webContents.once('did-finish-load', () => {
        this.overlayWindow.webContents.executeJavaScript("window.location.hash = '#/overlay'");
      });
    }

    // Show overlay when ready if starting in overlay mode
    this.overlayWindow.once('ready-to-show', () => {
      const startInOverlayMode = store.get('startInOverlayMode', false);
      if (startInOverlayMode) {
        this.overlayWindow.show();
      }
    });

    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null;
    });

    // Show overlay when ready (if starting in overlay mode)
    this.overlayWindow.once('ready-to-show', () => {
      const startInOverlayMode = store.get('startInOverlayMode', false);
      if (startInOverlayMode && this.mainWindow && !this.mainWindow.isVisible()) {
        this.overlayWindow.show();
      }
    });

    // Ensure clicks pass through when transparent (optional, but good for overlay)
    // For now, we want it clickable/draggable, so we don't ignore mouse events globally
  }

  createWindow() {
    // Get icon path
    const iconPath = isDev
      ? path.join(__dirname, '../assets/logo_white.png')
      : path.join(getAppPath(), 'src', 'assets', 'logo_white.png');
    let appIcon = nativeImage.createFromPath(iconPath);
    if (!appIcon.isEmpty()) {
      appIcon = appIcon.resize({ width: 256, height: 256 });
    }

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
      icon: appIcon,
      titleBarStyle: 'default',
      show: false
    });

    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173');
    } else {
      // In production, use loadFile which handles asar archives better
      const htmlPath = path.join(getAppPath(), 'dist', 'index.html');
      console.log('Loading file:', htmlPath);
      this.mainWindow.loadFile(htmlPath);
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();

      // Remove menu bar
      this.mainWindow.setMenuBarVisibility(false);

      if (isDev) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // Add error handling for failed loads
    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Failed to load:', validatedURL, errorCode, errorDescription);
      if (!isDev) {
        // In production, try to show error or fallback
        this.mainWindow.webContents.executeJavaScript(`
          document.body.innerHTML = '<div style="padding: 20px; font-family: sans-serif;">
            <h1>Failed to load application</h1>
            <p>Error: ${errorDescription}</p>
            <p>Path: ${validatedURL}</p>
            <p>App Path: ${getAppPath()}</p>
          </div>';
        `);
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

    const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';

    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.json');

    // Load environment variables
    const env = {
      ...process.env,
      AXELA_DATA_DIR: userDataPath,
      PYTHONUNBUFFERED: '1'
    };

    const storedApiKey = store.get('OPENAI_API_KEY');
    if (storedApiKey) {
      env.OPENAI_API_KEY = storedApiKey;
    } else if (process.env.OPENAI_API_KEY) {
      // In dev, use process.env if available
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }

    // Also pass other OpenAI-related env vars if they exist
    if (process.env.OPENAI_MODEL) {
      env.OPENAI_MODEL = process.env.OPENAI_MODEL;
    }
    if (process.env.OPENAI_ORG_ID) {
      env.OPENAI_ORG_ID = process.env.OPENAI_ORG_ID;
    }
    if (process.env.OPENAI_MAX_TOKENS) {
      env.OPENAI_MAX_TOKENS = process.env.OPENAI_MAX_TOKENS;
    }
    if (process.env.OPENAI_TEMPERATURE) {
      env.OPENAI_TEMPERATURE = process.env.OPENAI_TEMPERATURE;
    }

    console.log('Starting Python backend:', pythonCommand, pythonPath);
    console.log('Environment variables:', {
      hasOpenAIKey: !!env.OPENAI_API_KEY,
      hasAxelaDataDir: !!env.AXELA_DATA_DIR,
      axelaDataDir: env.AXELA_DATA_DIR
    });

    this.pythonProcess = spawn(pythonCommand, [
      pythonPath,
      '--api-mode',
      '--host', '127.0.0.1',
      '--port', '8000',
      '--config', configPath
    ], {
      cwd: path.dirname(pythonPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env
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
    // Get icon path
    const iconPath = isDev
      ? path.join(__dirname, '../assets/logo_white.png')
      : path.join(getAppPath(), 'src', 'assets', 'logo_white.png');

    let icon = nativeImage.createFromPath(iconPath);

    // Only process if icon loaded successfully
    if (!icon.isEmpty()) {
      const size = icon.getSize();
      if (size.width > 0) {
        const cropRatio = 0.6;
        const cropWidth = Math.floor(size.width * cropRatio);
        const cropHeight = Math.floor(size.height * cropRatio);
        const x = Math.floor((size.width - cropWidth) / 2);
        const y = Math.floor((size.height - cropHeight) / 2);

        icon = icon.crop({ x, y, width: cropWidth, height: cropHeight });
      }
      icon = icon.resize({ width: 22, height: 22 });
    }

    this.tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show AXELA',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            if (this.overlayWindow) this.overlayWindow.hide();
          }
        }
      },
      {
        label: 'Hide to Tray',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.hide();
            if (this.overlayWindow) this.overlayWindow.show();
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
          if (this.overlayWindow) this.overlayWindow.show();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
          if (this.overlayWindow) this.overlayWindow.hide();
        }
      }
    });

    // Double click also works
    this.tray.on('double-click', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isVisible()) {
          this.mainWindow.hide();
          if (this.overlayWindow) this.overlayWindow.show();
        } else {
          this.mainWindow.show();
          this.mainWindow.focus();
          if (this.overlayWindow) this.overlayWindow.hide();
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

            // Set restarting flag
            this.isRestarting = true;

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
                      // Auto-restart after termination
                      setTimeout(() => {
                        console.log('Auto-restarting backend...');
                        this.startPythonBackend();
                        setTimeout(() => {
                          this.isRestarting = false;
                          console.log('✅ Backend restarted');
                        }, 2000);
                      }, 2000);
                    }
                  });
                } else {
                  // On Unix-like systems
                  this.pythonProcess.kill('SIGKILL');
                  // Auto-restart after termination
                  setTimeout(() => {
                    console.log('Auto-restarting backend...');
                    this.startPythonBackend();
                    setTimeout(() => {
                      this.isRestarting = false;
                      console.log('✅ Backend restarted');
                    }, 2000);
                  }, 2000);
                }

                this.pythonProcess = null;
              } catch (error) {
                console.error('Error during emergency stop:', error);
                this.isRestarting = false;
              }
            } else {
              console.log('No Python process to kill');
              this.isRestarting = false;
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
      const value = store.get(key);
      return value !== undefined ? value : null;
    });

    ipcMain.handle('set-setting', (event, key, value) => {
      if (value === null || value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }

      if (key === 'launchAtStartup') {
        app.setLoginItemSettings({
          openAtLogin: value === true,
          path: app.getPath('exe')
        });
      }

      if (key === 'OPENAI_API_KEY') {
        try {
          const userDataPath = app.getPath('userData');
          const envPath = path.join(userDataPath, '.env');
          const fs = require('fs');

          let envContent = '';
          if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
          }

          if (value && value.trim()) {
            const keyLine = `OPENAI_API_KEY=${value.trim()}\n`;
            if (envContent.includes('OPENAI_API_KEY=')) {
              envContent = envContent.replace(/OPENAI_API_KEY=.*/g, keyLine.trim());
            } else {
              envContent += keyLine;
            }
            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log('OPENAI_API_KEY written to .env file:', envPath);
          } else {
            envContent = envContent.replace(/OPENAI_API_KEY=.*\n?/g, '');
            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log('OPENAI_API_KEY removed from .env file');
          }
        } catch (error) {
          console.error('Error writing .env file:', error);
        }

        if (this.pythonProcess) {
          console.log('OPENAI_API_KEY updated, restarting backend...');
          this.stopPythonBackend();
          setTimeout(() => {
            this.startPythonBackend();
          }, 1000);
        }
      }

      return true;
    });

    ipcMain.handle('get-startup-settings', () => {
      return {
        launchAtStartup: app.getLoginItemSettings().openAtLogin,
        startInOverlayMode: store.get('startInOverlayMode', false)
      };
    });

    ipcMain.handle('set-startup-settings', (event, settings) => {
      if (settings.launchAtStartup !== undefined) {
        app.setLoginItemSettings({
          openAtLogin: settings.launchAtStartup,
          path: app.getPath('exe')
        });
      }

      if (settings.startInOverlayMode !== undefined) {
        store.set('startInOverlayMode', settings.startInOverlayMode);
      }

      return true;
    });

    ipcMain.handle('send-command', async (event, command, mode = 'ai') => {
      try {
        // Don't try to send commands while restarting
        if (this.isRestarting) {
          return { success: false, error: 'Backend is restarting' };
        }

        const response = await fetch('http://localhost:8000/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ command, mode })
        });

        return await response.json();
      } catch (error) {
        // Only log error if not restarting
        if (!this.isRestarting) {
          console.error('Failed to send command to backend:', error);
        }
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
      this.isRestarting = true;
      this.stopPythonBackend();
      setTimeout(() => {
        this.startPythonBackend();
        // Clear restarting flag after backend starts
        setTimeout(() => {
          this.isRestarting = false;
        }, 2000);
      }, 1000);
      return { success: true };
    });

    ipcMain.handle('is-backend-restarting', () => {
      return this.isRestarting;
    });

    ipcMain.handle('get-app-version', () => {
      try {
        const packagePath = path.join(getAppPath(), 'package.json');
        const pkg = require(packagePath);
        return pkg.version || '1.0.0';
      } catch (e) {
        return app.getVersion() || '1.0.0';
      }
    });

    ipcMain.on('chat-update-from-renderer', (event, data) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('chat-update', data);
      }
    });

    // Handle commands from overlay - forward to main window
    ipcMain.on('overlay-command', (event, command) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('execute-overlay-command', command);
      }
    });
  }
}

const axelaDesktop = new AxelaDesktop();

app.whenReady().then(() => {
  axelaDesktop.createWindow();
  axelaDesktop.createOverlayWindow();
  axelaDesktop.createTray();
  axelaDesktop.setupIPC();
  axelaDesktop.startPythonBackend();

  const startInOverlayMode = store.get('startInOverlayMode', false);
  if (startInOverlayMode) {
    if (axelaDesktop.mainWindow) {
      axelaDesktop.mainWindow.hide();
    }
    if (axelaDesktop.overlayWindow && !axelaDesktop.overlayWindow.isVisible()) {
      setTimeout(() => {
        if (axelaDesktop.overlayWindow && !axelaDesktop.overlayWindow.isDestroyed()) {
          axelaDesktop.overlayWindow.show();
        }
      }, 500);
    }
  }

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
