const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWebhookServer, generateToken } = require('./webhookServer.cjs');
const {
  discoverApplications,
  getAppIcon,
  browseForApp,
  launchApplication,
} = require('./appDiscovery.cjs');
const { executeAction } = require('./actionExecutor.cjs');
const { getMetrics } = require('./native/system.cjs');
const { getActiveWindow, subscribe: subscribeWindow } = require('./native/window.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let webhookServer = null;
let webhookToken = '';
let metricsTimer = null;
let unsubscribeWindowTracker = null;
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
    return true;
  }
  return false;
}

// Persist the webhook token so external automations (Home Assistant, cURL scripts)
// keep working across restarts. Stored in the per-user data directory, owner-only.
function loadOrCreateWebhookToken() {
  const file = path.join(app.getPath('userData'), 'webhook-token.txt');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{48}$/.test(existing)) return existing;
  } catch {
    // not created yet
  }
  const token = generateToken();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, token, { mode: 0o600 });
  } catch (err) {
    console.error('[KADOWAZ Daemon] Could not persist webhook token (using session-only token):', err.message);
  }
  return token;
}

function startLocalhostWebhookServer() {
  if (webhookServer) return;
  webhookToken = loadOrCreateWebhookToken();
  const server = createWebhookServer({
    port: WEBHOOK_PORT,
    token: webhookToken,
    getStatus: () => ({ profileId: profileMenuState.activeId }),
    onEvent: (event) => sendToRenderer(event),
  });

  server.on('error', (err) => {
    // EADDRINUSE etc. Without this the app would run with a silently dead API.
    console.error('[KADOWAZ Daemon] Webhook server error:', err.message);
    if (webhookServer === server) webhookServer = null;
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

  // The UI is a closed local app: never open new windows or navigate away from it.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('http://localhost:5173') || url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

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

ipcMain.handle('get-webhook-info', async () => ({
  port: WEBHOOK_PORT,
  token: webhookToken,
  listening: Boolean(webhookServer && webhookServer.listening),
}));

ipcMain.handle('discover-apps', async () => discoverApplications());
ipcMain.handle('get-app-icon', async (_event, exePath) => getAppIcon(exePath));
ipcMain.handle('browse-for-app', async () => browseForApp());
ipcMain.handle('launch-app', async (_event, appInfo) => launchApplication(appInfo));

ipcMain.handle('get-system-metrics', async () => getMetrics());
ipcMain.handle('get-active-window', async () => getActiveWindow());

function startMetricsBroadcasting() {
  if (metricsTimer) return;
  metricsTimer = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      try {
        const res = await getMetrics();
        if (res && res.ok && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('system-metrics', res.value);
        }
      } catch (err) {
        // silent recovery on next tick
      }
    }
  }, 1200);
}

function stopMetricsBroadcasting() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

function startWindowTracking() {
  if (unsubscribeWindowTracker) return;
  unsubscribeWindowTracker = subscribeWindow((winInfo) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('active-window-changed', winInfo);
    }
  });
}

function stopWindowTracking() {
  if (unsubscribeWindowTracker) {
    unsubscribeWindowTracker();
    unsubscribeWindowTracker = null;
  }
}

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

// Electron does not show Chromium's serial/HID chooser. Without these handlers
// navigator.serial.requestPort() / navigator.hid.requestDevice() cannot select a device,
// so the "Connect" buttons would do nothing inside the desktop app.
function describeDevice(d) {
  const ids = d.vendorId !== undefined ? ` [${Number(d.vendorId).toString(16)}:${Number(d.productId || 0).toString(16)}]` : '';
  return `${d.displayName || d.name || d.productName || 'Unknown device'}${ids}`;
}

async function chooseDevice(kind, list) {
  if (!list || list.length === 0) return '';
  if (list.length === 1) return list[0].portId || list[0].deviceId;
  const shown = list.slice(0, 8);
  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: `Select ${kind} device`,
    message: `Choose the macropad ${kind} device`,
    detail: list.length > shown.length ? `Showing the first ${shown.length} of ${list.length} devices.` : undefined,
    buttons: [...shown.map(describeDevice), 'Cancel'],
    cancelId: shown.length,
    defaultId: 0,
  });
  if (response >= shown.length) return '';
  return shown[response].portId || shown[response].deviceId;
}

function setupDeviceAccess() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial' || permission === 'hid');
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial' || details.deviceType === 'hid');

  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    chooseDevice('serial', portList).then(callback, () => callback(''));
  });
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    chooseDevice('HID', details.deviceList).then(callback, () => callback(''));
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Another instance already owns the tray icon and the webhook port.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupDeviceAccess();
    startLocalhostWebhookServer();
    createWindow();
    createTray();
    startMetricsBroadcasting();
    startWindowTracking();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopMetricsBroadcasting();
  stopWindowTracking();
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
