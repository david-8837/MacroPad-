const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createWebhookServer, generateToken } = require('./webhookServer.cjs');
const {
  discoverApplications,
  browseForApp,
  launchApplication,
} = require('./appDiscovery.cjs');
const { executeAction, startKeyWorker, stopKeyWorker } = require('./actionExecutor.cjs');
const { getMetrics, selfTest: systemSelfTest } = require('./native/system.cjs');
const audio = require('./native/audio.cjs');
const util = require('./native/util.cjs');
const firmware = require('./native/firmware.cjs');

let mainWindow = null;
let splashWindow = null;
let startupTimer = null;
let startupAttempt = 0;
let startupFailed = false;
let maximizeOnStartup = false;
let tray = null;
let isQuitting = false;
let webhookServer = null;
let webhookToken = '';
let metricsTimer = null;
let metricsPollBusy = false;
let mediaTimer = null;
let mediaPollBusy = false;
let lastMediaJson = '';
const WEBHOOK_PORT = 38491;

// The preload grants native capabilities. Only the editor's own top-level page
// may use them; a different file, a redirected URL, or a subframe is untrusted.
function isTrustedEditorUrl(address) {
  try {
    const url = new URL(address);
    if (url.username || url.password) return false;
    if (!app.isPackaged && url.origin === 'http://localhost:5173' && url.pathname === '/') return true;
    const editor = new URL(pathToFileURL(path.join(__dirname, '../dist/index.html')).href);
    return url.protocol === 'file:' && url.host === editor.host && url.pathname === editor.pathname;
  } catch { return false; }
}
function isTrustedEditorIpc(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents &&
    event.senderFrame && event.senderFrame === mainWindow.webContents.mainFrame && isTrustedEditorUrl(event.senderFrame.url));
}
function handleEditor(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedEditorIpc(event)) throw new Error('Unauthorized IPC sender');
    return handler(event, ...args);
  });
}

// One deck per install now — the tray just reports which deck is open.
const deckState = { id: 'deck-main', name: 'Macropad' };
let hardwareListenerReady = false;

function sendToRenderer(payload) {
  if (hardwareListenerReady && mainWindow && !mainWindow.isDestroyed() && isTrustedEditorUrl(mainWindow.webContents.getURL())) {
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
    console.error('[ZERO Daemon] Could not persist webhook token (using session-only token):', err.message);
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
    console.error('[ZERO Daemon] Webhook server error:', err.message);
    if (webhookServer === server) webhookServer = null;
  });

  server.listen(WEBHOOK_PORT, '127.0.0.1', () => {
    console.log(`[ZERO Daemon] Local Webhook API listening at http://127.0.0.1:${WEBHOOK_PORT}`);
  });
  webhookServer = server;
}

function showStartupFailure() {
  clearTimeout(startupTimer);
  startupFailed = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('startup:failure');
    splashWindow.show();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    dialog.showErrorBox('ZERO could not start', 'Quit and restart the app. If the problem continues, reinstall from a trusted release.');
  }
}

function loadEditor() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const attempt = ++startupAttempt;
  startupFailed = false;
  clearTimeout(startupTimer);
  // This is a failure threshold, not a minimum splash duration or fake progress.
  startupTimer = setTimeout(showStartupFailure, 20000);
  const packagedPage = () => mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  const loading = app.isPackaged ? packagedPage() :
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      if (attempt === startupAttempt) return packagedPage();
    });
  loading.catch((err) => {
    if (attempt !== startupAttempt) return;
    console.error('[startup] Failed to load editor:', err);
    showStartupFailure();
  });
}

function createWindow() {
  maximizeOnStartup = true;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    // Windows sizes are in device-independent pixels. High display scaling can
    // make a laptop's work area much smaller than its native pixel resolution.
    minWidth: 480,
    minHeight: 320,
    show: false,
    // Native Windows caption buttons provide Win11 Snap Layouts without adding
    // a separate title bar. Other platforms keep the existing custom chrome.
    ...(process.platform === 'win32'
      ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#e9e8e4', symbolColor: '#141414', height: 32 } }
      : { frame: false }),
    icon: path.join(__dirname, 'assets/zero.png'),
    backgroundColor: '#0C0E14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'ZERO Deck Studio',
  });

  splashWindow = new BrowserWindow({
    width: 390, height: 245, resizable: false, frame: false,
    show: false, skipTaskbar: true, backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, 'assets/zero.png'),
    webPreferences: { preload: path.join(__dirname, 'splash-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const splash = splashWindow;
  splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splash.webContents.on('will-navigate', (event) => event.preventDefault());
  splash.once('ready-to-show', () => { if (!splash.isDestroyed()) splash.show(); });
  splash.webContents.on('did-finish-load', () => {
    if (startupFailed) splash.webContents.send('startup:failure');
  });
  splash.loadFile(path.join(__dirname, 'splash.html')).catch((err) => {
    console.error('[startup] Failed to load splash:', err);
    if (!splash.isDestroyed()) splash.destroy();
    if (splashWindow === splash) splashWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  // The UI is a closed local app: never open new windows or navigate away from it.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guardNavigation = (event, legacyUrl) => { if (!isTrustedEditorUrl(event.url || legacyUrl)) event.preventDefault(); };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  // The editor has no embedded frames, so no subframe may navigate or inherit
  // the application's native permissions. This event carries details on event.
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || !isTrustedEditorUrl(event.url)) event.preventDefault();
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) hardwareListenerReady = false;
  });
  mainWindow.webContents.on('render-process-gone', () => {
    hardwareListenerReady = false;
    if (splashWindow && !splashWindow.isDestroyed()) showStartupFailure();
    else dialog.showErrorBox('ZERO stopped unexpectedly', 'Quit and restart the app. Your locally saved settings are not intentionally removed.');
  });
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  loadEditor();
}

ipcMain.on('hardware-event:subscription', (event, ready) => {
  if (isTrustedEditorIpc(event) && typeof ready === 'boolean') hardwareListenerReady = ready;
});

ipcMain.on('startup:ready', (event) => {
  if (!isTrustedEditorIpc(event)) return;
  clearTimeout(startupTimer);
  // maximize() may show a hidden window, so wait until the renderer is ready.
  // Only do this once per new window: a later reload must not override the
  // user's choice to restore or resize it.
  if (maximizeOnStartup) {
    maximizeOnStartup = false;
    mainWindow.maximize();
  }
  mainWindow.show();
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
});
ipcMain.on('startup:retry', (event) => {
  if (splashWindow && event.sender === splashWindow.webContents) loadEditor();
});
ipcMain.on('startup:quit', (event) => {
  if (splashWindow && event.sender === splashWindow.webContents) { isQuitting = true; app.quit(); }
});

const HELP_LINKS = Object.freeze({
  project: 'https://github.com/david-8837/MacroPad-',
  guide: 'https://github.com/david-8837/MacroPad-/blob/main/docs/USER_GUIDE.md',
  credits: 'https://github.com/david-8837/MacroPad-/blob/main/src/assets/preset-icons/README.md',
});
ipcMain.handle('help:open', async (event, id) => {
  if (!isTrustedEditorIpc(event) || !Object.hasOwn(HELP_LINKS, id)) return false;
  await shell.openExternal(HELP_LINKS[id]);
  return true;
});

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Open ZERO Studio',
      click: () => {
        if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.show(); splashWindow.focus(); }
        else if (mainWindow) {
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
  const pngPath = path.join(__dirname, 'assets/zero.png');
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
  tray.setToolTip('ZERO Deck Studio');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.show(); splashWindow.focus(); return; }
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

ipcMain.on('window-control', (event, action) => {
  if (!isTrustedEditorIpc(event)) return;
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

// The renderer process is untrusted authority. Only safe UI-authorable
// action categories may be executed over native IPC; arbitrary scripts are forbidden.
const ALLOWED_EXEC_CATEGORIES = new Set([
  'hotkey',
  'media',
  'text',
  'audio_session',
  'midi',
  'navigation',
  'app_launch',
  'app-launch',
]);

async function runIncomingAction(incoming) {
  const action = normalizeIncomingAction(incoming);
  if (!action || !action.category || !ALLOWED_EXEC_CATEGORIES.has(action.category)) {
    return {
      success: false,
      error: `Blocked: category '${action?.category}' is not authorized for native execution`,
    };
  }
  if (action.category === 'app_launch' || action.category === 'app-launch') {
    return launchApplication(action.payload || incoming);
  }
  return executeAction(action);
}

handleEditor('exec-action', async (_event, incoming) => {
  try {
    return await runIncomingAction(incoming);
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.on('exec-action', async (event, incoming) => {
  if (!isTrustedEditorIpc(event)) return;
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

handleEditor('get-webhook-info', async () => ({
  port: WEBHOOK_PORT,
  token: webhookToken,
  listening: Boolean(webhookServer && webhookServer.listening),
}));

handleEditor('discover-apps', async () => discoverApplications());

// What is actually playing right now, from Windows' own media session (SMTC).
// Answers {ok:true, value:null} when nothing is playing — that is a state, not a
// failure, and the panel draws NO MEDIA for it.
handleEditor('media:now-playing', async () => audio.getNowPlaying({ cacheMs: 0 }));
handleEditor('browse-for-app', async () => browseForApp());
handleEditor('launch-app', async (_event, appInfo) => launchApplication(appInfo));

// Real Windows Audio & Per-App Mixer IPC handlers
handleEditor('audio:volume:get', async () => audio.getMasterVolume());
handleEditor('audio:volume:set', async (_event, percent) => audio.setMasterVolume(percent));
handleEditor('audio:volume:adjust', async (_event, delta) => audio.adjustMasterVolume(delta));
handleEditor('audio:mute:get', async () => audio.getMasterMute());
handleEditor('audio:mute:toggle', async () => audio.toggleMasterMute());
handleEditor('audio:mic:get', async () => audio.getMic());
handleEditor('audio:mic:set', async (_event, opts) => audio.setMic(opts));

// Diagnostics & Subsystem Health Self-Tests
handleEditor('diag:log', async () => ({ ok: true, value: util.getLog() }));
handleEditor('diag:selftest', async () => {
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
handleEditor('firmware:status', async () => firmware.status());
const bundledFirmwareDirectory = () => app.isPackaged ? path.join(process.resourcesPath, 'firmware') : undefined;
handleEditor('firmware:list', async () => firmware.listBuiltinFirmware(bundledFirmwareDirectory()));
handleEditor('firmware:flashBuiltin', async (_event, id, acknowledgedUntested) => {
  return firmware.flashBuiltinFirmware(id, acknowledgedUntested, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('firmware-flash-progress', progress);
    }
  }, bundledFirmwareDirectory());
});

function startMetricsBroadcasting() {
  if (metricsTimer) return;
  metricsTimer = setInterval(async () => {
    if (metricsPollBusy || !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    metricsPollBusy = true;
    try {
      const res = await getMetrics();
      if (res && res.ok && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system-metrics', res.value);
      }
    } catch (err) {
      // Recover on the next tick.
    } finally {
      metricsPollBusy = false;
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
    if (mediaPollBusy || !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
    mediaPollBusy = true;
    try {
      const res = await audio.getNowPlaying({ cacheMs: 1500 });
      const json = JSON.stringify(res);
      if (json === lastMediaJson) return;
      lastMediaJson = json;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', res);
      }
    } catch (error) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-state-changed', { ok: false, error: `Media detection failed: ${error.message}` });
      }
    } finally {
      mediaPollBusy = false;
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

ipcMain.on('deck-sync', (event, payload) => {
  if (!isTrustedEditorIpc(event)) return;
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
  ses.setPermissionCheckHandler((wc, permission, _origin, details) =>
    Boolean(mainWindow && wc === mainWindow.webContents && isTrustedEditorUrl(wc.getURL()) &&
      details?.isMainFrame !== false && (permission === 'serial' || permission === 'hid')));
  // Keep Electron's default per-device grants from the chooser. A blanket
  // device permission handler would silently authorize unrelated devices.

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
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.show(); splashWindow.focus(); }
    else if (mainWindow) {
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
    startKeyWorker?.();
    startMetricsBroadcasting();
    startMediaBroadcasting();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
      else mainWindow?.show();
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopMetricsBroadcasting();
  stopMediaBroadcasting();
  stopKeyWorker?.();
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
