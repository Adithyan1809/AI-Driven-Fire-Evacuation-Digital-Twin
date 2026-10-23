const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');

// ── 1. Single Instance Lock (Prevents duplicate instances & port conflicts) ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Desktop App] Another instance is already running. Exiting duplicate process.');
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let ACTIVE_PORT = parseInt(process.env.PORT || '8080', 10);
let SERVER_URL = `http://127.0.0.1:${ACTIVE_PORT}`;

// Configure App User Model ID for Windows Taskbar grouping & icon
if (process.platform === 'win32') {
  app.setAppUserModelId('com.adithyan.digitaltwin');
}

// Focus existing window when a second instance tries to launch
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

/**
 * Check if a specific TCP port is free
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from preferredPort
 */
async function findAvailablePort(preferredPort = 8080, maxPort = 8099) {
  for (let p = preferredPort; p <= maxPort; p++) {
    if (await isPortAvailable(p)) {
      return p;
    }
  }
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

/**
 * Check if the Digital Twin server is responding on a URL
 */
function checkServerHealth(url, maxAttempts = 15, interval = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const test = () => {
      attempts++;
      const req = http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(test, interval);
        } else {
          reject(new Error(`Server returned status ${res.statusCode}`));
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(test, interval);
        } else {
          reject(new Error('Timed out waiting for Digital Twin server'));
        }
      });
      req.end();
    };
    test();
  });
}

/**
 * Initialize or connect to the Digital Twin server
 */
async function startServer() {
  // Case A: Is a Digital Twin server already running on preferred port?
  try {
    await checkServerHealth(`http://127.0.0.1:${ACTIVE_PORT}`, 2, 100);
    console.log(`[Desktop App] Connected to existing Digital Twin server on port ${ACTIVE_PORT}`);
    SERVER_URL = `http://127.0.0.1:${ACTIVE_PORT}`;
    return;
  } catch {
    // No running server on preferred port
  }

  // Case B: Find a guaranteed open port
  ACTIVE_PORT = await findAvailablePort(ACTIVE_PORT);
  process.env.PORT = String(ACTIVE_PORT);
  SERVER_URL = `http://127.0.0.1:${ACTIVE_PORT}`;
  console.log(`[Desktop App] Starting in-process server on guaranteed free port ${ACTIVE_PORT}...`);

  const serverPath = path.resolve(__dirname, '..', 'server.js');
  try {
    await import(`file://${serverPath.replace(/\\/g, '/')}`);
    await checkServerHealth(SERVER_URL, 30, 200);
    console.log(`[Desktop App] In-process server initialized successfully on port ${ACTIVE_PORT}.`);
  } catch (err) {
    console.error('[Desktop App Server Error]', err);
    // Even if in-process import threw EADDRINUSE, retry health check once in case it actually bound
    try {
      await checkServerHealth(SERVER_URL, 5, 200);
    } catch {
      dialog.showErrorBox(
        'Server Initialization Error',
        `Could not start or connect to the Digital Twin server on port ${ACTIVE_PORT}.\n\nDetails: ${err.message}`
      );
    }
  }
}

/**
 * Build the native application menu
 */
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    {
      label: 'Simulation',
      submenu: [
        {
          label: 'Reload Dashboard',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload()
        },
        {
          label: 'Hard Reset State',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: async () => {
            if (mainWindow) {
              await mainWindow.webContents.executeJavaScript(`
                if (typeof resetSimulation === 'function') resetSimulation();
                else if (typeof hardReset === 'function') hardReset();
                else window.location.reload();
              `);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: isMac ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Buildings',
      submenu: [
        {
          label: 'Building A (Academic Wing)',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                fetch('/api/building/switch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ buildingId: 'BUILDING_A' })
                }).then(() => window.location.reload());
              `).catch(() => {});
            }
          }
        },
        {
          label: 'Building B (High-Density Office)',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                fetch('/api/building/switch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ buildingId: 'BUILDING_B' })
                }).then(() => window.location.reload());
              `).catch(() => {});
            }
          }
        },
        {
          label: 'Building C (Industrial Complex)',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                fetch('/api/building/switch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ buildingId: 'BUILDING_C' })
                }).then(() => window.location.reload());
              `).catch(() => {});
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/Adithyan1809/AI-Driven-Fire-Evacuation-Digital-Twin')
        },
        {
          label: 'Open Documentation',
          click: () => shell.openExternal('https://github.com/Adithyan1809/AI-Driven-Fire-Evacuation-Digital-Twin#readme')
        },
        { type: 'separator' },
        {
          label: 'About AI Fire Evacuation Digital Twin',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AI Fire Evacuation Digital Twin',
              message: 'AI-Driven Fire Evacuation Digital Twin v2.0.0',
              detail: 'Autonomous Building Evacuation Platform with Semantic Interoperability Middleware, Deterministic Safety Firewall, Dynamic Graph Dijkstra Routing, and Real-Time Hazard Prediction.\n\nAuthor: Adithyan S & Team\nLicense: MIT'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Create the main native desktop window
 */
async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'AI Fire Evacuation Digital Twin',
    icon: iconPath,
    backgroundColor: '#0a0e17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  createApplicationMenu();

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (!url.includes(`localhost:${ACTIVE_PORT}`) && !url.includes(`127.0.0.1:${ACTIVE_PORT}`)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  // Ensure server is online
  await startServer();

  // Load the web application
  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Guarantee window is shown even if ready-to-show is delayed
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1200);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Global unhandled error guard
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception in Main Process]', err);
});
