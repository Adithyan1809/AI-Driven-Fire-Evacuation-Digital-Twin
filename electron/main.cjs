const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
const PORT = process.env.PORT || 8080;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Configure App User Model ID for Windows Taskbar grouping & icon
if (process.platform === 'win32') {
  app.setAppUserModelId('com.adithyan.digitaltwin');
}

/**
 * Check if the Digital Twin server is responding
 */
function checkServerHealth(url, maxAttempts = 25, interval = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const test = () => {
      attempts++;
      const req = http.get(`${url}/health`, (res) => {
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
 * Initialize the Digital Twin server
 */
async function startServer() {
  try {
    await checkServerHealth(SERVER_URL, 2, 100);
    console.log('[Desktop App] Connected to existing server on port', PORT);
    return;
  } catch {
    console.log('[Desktop App] Initializing in-process Digital Twin server on port', PORT);
    const serverPath = path.resolve(__dirname, '..', 'server.js');
    await import(`file://${serverPath.replace(/\\/g, '/')}`);
    await checkServerHealth(SERVER_URL, 30, 200);
    console.log('[Desktop App] In-process server initialized successfully.');
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
    show: false, // Show once ready
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
      if (!url.includes(`localhost:${PORT}`) && !url.includes(`127.0.0.1:${PORT}`)) {
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
