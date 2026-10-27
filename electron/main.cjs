const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const {
  discoverApplications,
  getAppIcon,
  browseForApp,
  launchApplication,
} = require('./appDiscovery.cjs');
const { executeAction } = require('./actionExecutor.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let webhookServer = null;
const WEBHOOK_PORT = 38491;

const profileMenuState = {
  items: [
    { id: 'profile-davinci', name: 'DaVinci Resolve' },
    { id: 'profile-obs', name: 'OBS Broadcast' },
    { id: 'profile-spotify-dj', name: 'Spotify DJ' },
  ],
  activeId: 'profile-davinci',
};

function sendToRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hardware-event', payload);
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Malformed JSON payload'));
      }
    });
  });
}

function startLocalhostWebhookServer() {
  if (webhookServer) return;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = (req.url || '').split('?')[0];

    if (url === '/api/v1/status' && req.method === 'GET') {
      json(res, 200, {
        status: 'online',
        app: 'KADOWAZ Deck Studio',
        port: WEBHOOK_PORT,
        profileId: profileMenuState.activeId,
      });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 404, { error: 'Endpoint not found' });
      return;
    }

    let parsed;
    try {
      parsed = await readJsonBody(req);
    } catch (err) {
      json(res, 400, { error: err.message || 'Malformed JSON payload' });
      return;
    }

    const event = { source: 'webhook', endpoint: url, data: parsed };
    sendToRenderer(event);
    json(res, 200, { success: true, received: parsed, endpoint: url });
  });

  server.on('error', (err) => {
    console.error('[KADOWAZ Daemon] Webhook server error:', err.message);
  });

  server.listen(WEBHOOK_PORT, '127.0.0.1', () => {
    console.log(`[KADOWAZ Daemon] Local Webhook API listening at http://127.0.0.1:${WEBHOOK_PORT}`);
  });
  webhookServer = server;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0C0E14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'KADOWAZ Deck Studio',
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayMenu() {
  const profileItems = profileMenuState.items.map((p) => ({
    label: `Profile: ${p.name}`,
    type: 'radio',
    checked: p.id === profileMenuState.activeId,
    click: () => {
      profileMenuState.activeId = p.id;
      sendToRenderer({ source: 'tray', action: 'switch-profile', id: p.id });
      rebuildTray();
    },
  }));

  return Menu.buildFromTemplate([
    {
      label: 'Open KADOWAZ Studio',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    ...profileItems,
    { type: 'separator' },
    {
      label: 'Quit Deck Studio',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTrayIcon() {
  const pngPath = path.join(__dirname, '../b90a1e3c-36e8-45d6-8fec-2b4e8802a836.png');
  try {
    const img = nativeImage.createFromPath(pngPath);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  } catch {
    // fall through
  }
  const orangeDot = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0ABYBw1gGE0DBhGw4BhNAwYRsOAYTQMGEbDgIFhwP8BBgYGBgYA8u8EAZ1nF9kAAAAASUVORK5CYII='
  );
  return orangeDot;
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setToolTip('KADOWAZ Deck Studio');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function rebuildTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

ipcMain.on('window-control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') {
    mainWindow.hide();
  }
});

function normalizeIncomingAction(incoming) {
  const category = incoming?.category;
  const nested = incoming?.payload && typeof incoming.payload === 'object' ? incoming.payload : {};
  const payload = nested.payload && typeof nested.payload === 'object' && nested.category
    ? nested.payload
    : nested;
  if (category === 'script' && incoming?.command && !payload.command) {
    payload.command = incoming.command;
  }
  return { category, name: incoming?.actionName, payload };
}

async function runIncomingAction(incoming) {
  const action = normalizeIncomingAction(incoming);
  if (action.category === 'app_launch' || action.category === 'app-launch') {
    return launchApplication(action.payload || incoming);
  }
  return executeAction(action);
}

ipcMain.handle('exec-action', async (_event, incoming) => {
  try {
    return await runIncomingAction(incoming);
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.on('exec-action', async (_event, incoming) => {
  try {
    const res = await runIncomingAction(incoming);
    if (incoming?.category === 'app_launch' || incoming?.category === 'app-launch') {
      sendToRenderer({
        source: 'app-launcher',
        actionId: incoming?.actionId,
        status: res.success ? 'success' : 'error',
        error: res.error,
      });
    }
  } catch (err) {
    console.error('[exec-action]', err);
  }
});

ipcMain.handle('discover-apps', async () => discoverApplications());
ipcMain.handle('get-app-icon', async (_event, exePath) => getAppIcon(exePath));
ipcMain.handle('browse-for-app', async () => browseForApp());
ipcMain.handle('launch-app', async (_event, appInfo) => launchApplication(appInfo));

ipcMain.on('oled-update', (_event, data) => {
  sendToRenderer({ source: 'oled', data });
});

ipcMain.on('profiles-sync', (_event, payload) => {
  if (payload && Array.isArray(payload.items)) {
    profileMenuState.items = payload.items;
    profileMenuState.activeId = payload.activeId || profileMenuState.activeId;
    rebuildTray();
  }
});

app.whenReady().then(() => {
  startLocalhostWebhookServer();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (webhookServer) {
    webhookServer.close();
    webhookServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in background tray
  }
});
