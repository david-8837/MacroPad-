const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWebhookServer, generateToken } = require('./webhookServer.cjs');
const {
  discoverApplications,
  browseForApp,
  launchApplication,
} = require('./appDiscovery.cjs');
const { executeAction } = require('./actionExecutor.cjs');
const { getMetrics, selfTest: systemSelfTest } = require('./native/system.cjs');
const audio = require('./native/audio.cjs');
const util = require('./native/util.cjs');
const firmware = require('./native/firmware.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let webhookServer = null;
let webhookToken = '';
let metricsTimer = null;
let mediaTimer = null;
let lastMediaJson = '';
const WEBHOOK_PORT = 38491;

// One deck per install now — the tray just reports which deck is open.
const deckState = { id: 'deck-main', name: 'Studio Deck' };

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
    getStatus: () => ({ deckId: deckState.id, deckName: deckState.name }),
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
    { label: `Deck: ${deckState.name}`, enabled: false },
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

// What is actually playing right now, from Windows' own media session (SMTC).
// Answers {ok:true, value:null} when nothing is playing — that is a state, not a
// failure, and the panel draws NO MEDIA for it.
ipcMain.handle('media:now-playing', async () => audio.getNowPlaying({ cacheMs: 0 }));
ipcMain.handle('browse-for-app', async () => browseForApp());
ipcMain.handle('launch-app', async (_event, appInfo) => launchApplication(appInfo));

// Real Windows Audio & Per-App Mixer IPC handlers
ipcMain.handle('audio:volume:get', async () => audio.getMasterVolume());
ipcMain.handle('audio:volume:set', async (_event, percent) => audio.setMasterVolume(percent));
ipcMain.handle('audio:volume:adjust', async (_event, delta) => audio.adjustMasterVolume(delta));
ipcMain.handle('audio:mute:get', async () => audio.getMasterMute());
ipcMain.handle('audio:mute:toggle', async () => audio.toggleMasterMute());
ipcMain.handle('audio:mic:get', async () => audio.getMic());
ipcMain.handle('audio:mic:set', async (_event, opts) => audio.setMic(opts));

// Diagnostics & Subsystem Health Self-Tests
ipcMain.handle('diag:log', async () => ({ ok: true, value: util.getLog() }));
ipcMain.handle('diag:selftest', async () => {
  const [sys, aud] = await Promise.all([
    systemSelfTest(),
    audio.selfTest(),
  ]);
  return {
    ok: true,
    value: {
      system: sys,
      audio: aud,
      webhook: {
        ok: Boolean(webhookServer && webhookServer.listening),
        detail: webhookServer && webhookServer.listening ? `Port ${WEBHOOK_PORT} listening (token-protected)` : 'Server stopped',
      },
      time: new Date().toISOString(),
    },
  };
});

// In-App RP2040 UF2 Firmware Flashing Handlers
ipcMain.handle('firmware:status', async () => firmware.status());
ipcMain.handle('firmware:inspect', async (_event, filePath) => firmware.inspectUf2(filePath));
ipcMain.handle('firmware:builtin', async () => firmware.getBuiltinFirmware());
ipcMain.handle('firmware:flashBuiltin', async () => {
  const builtin = firmware.getBuiltinFirmware();
  if (!builtin || !builtin.filePath) {
    return { ok: false, error: 'Official project firmware binary not found in project.' };
  }
  return firmware.flash(builtin.filePath, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('firmware-flash-progress', progress);
    }
  });
});
ipcMain.handle('firmware:browse', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select RP2040 Firmware Image (.uf2)',
    filters: [{ name: 'UF2 Firmware Image', extensions: ['uf2'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const inspected = firmware.inspectUf2(filePath);
  return { filePath, ...inspected };
});
ipcMain.handle('firmware:flash', async (_event, filePath) => {
  return firmware.flash(filePath, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('firmware-flash-progress', progress);
    }
  });
});

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

/**
 * Push the media session to the renderer whenever it changes.
 *
 * SMTC is the only source of truth Windows offers for "what is playing", and it
 * has no event stream we can subscribe to from PowerShell, so this polls. The
 * payload is compared before sending: a paused track would otherwise repaint the
 * panel twice a second for no reason.
 */
function startMediaBroadcasting() {
  if (mediaTimer) return;
  mediaTimer = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    try {
      const res = await audio.getNowPlaying({ cacheMs: 1500 });
      if (!res.ok) return;
      const payload = res.value || null;
      const json = JSON.stringify(payload);
      if (json === lastMediaJson) return;
      lastMediaJson = json;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', payload);
      }
    } catch {
      // A media session disappearing mid-read is normal; try again next tick.
    }
  }, 2000);
}

function stopMediaBroadcasting() {
  if (mediaTimer) {
    clearInterval(mediaTimer);
    mediaTimer = null;
  }
}

function stopMetricsBroadcasting() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
}

ipcMain.on('deck-sync', (_event, payload) => {
  if (payload && typeof payload.name === 'string' && payload.name) {
    deckState.id = typeof payload.id === 'string' ? payload.id : deckState.id;
    deckState.name = payload.name;
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
    startMediaBroadcasting();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopMetricsBroadcasting();
  stopMediaBroadcasting();
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
