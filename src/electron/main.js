const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

    const pythonExecutable = process.platform === 'win32' ? 'py' : 'python';

    this.pythonProcess = spawn(pythonExecutable, [pythonPath, '--api-mode', '--host', '127.0.0.1', '--port', '8000'], {
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
  }
}

const axelaDesktop = new AxelaDesktop();

app.whenReady().then(() => {
  axelaDesktop.createWindow();
  axelaDesktop.setupIPC();
  axelaDesktop.startPythonBackend();

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
