// Exercise the startup window state machine without a desktop or physical device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

async function run() {
  const windows = [], timers = [], handlers = {}, opened = [];
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: true, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getPath: () => '/tmp', quit: () => { app.didQuit = true; } });
  class Window extends EventEmitter {
    constructor(opts) {
      super(); this.opts = opts; this.visible = !!opts.show; this.destroyed = false; this.maximized = false; this.maximizeCalls = 0;
      this.webContents = new EventEmitter(); this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    loadFile(file) { this.loaded = file; return Promise.resolve(); }
    show() { this.visible = true; } hide() { this.visible = false; }
    maximize() { this.maximized = true; this.maximizeCalls++; this.visible = true; }
    unmaximize() { this.maximized = false; } isMaximized() { return this.maximized; }
    focus() {} isMinimized() { return false; } isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; }
  }
  Window.getAllWindows = () => windows.filter(w => !w.destroyed);
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, fn) => { handlers[name] = fn; };
  const session = new EventEmitter(); session.setPermissionCheckHandler = fn => { session.permissionCheck = fn; }; session.setDevicePermissionHandler = fn => { session.devicePermission = fn; };
  const electron = { app, BrowserWindow: Window, ipcMain, Tray, Menu: { buildFromTemplate: a => a }, nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize() { return this; } }) }, dialog: { showErrorBox() {} }, session: { defaultSession: session }, shell: { openExternal: async url => opened.push(url) } };
  const webhook = new EventEmitter(); webhook.listen = () => {}; webhook.close = () => {};
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const fakeRequire = id => id === 'electron' ? electron : id === './webhookServer.cjs' ? { createWebhookServer: () => webhook, generateToken: () => 'a'.repeat(48) } : id === 'fs' ? { readFileSync: () => 'a'.repeat(48) } : id.startsWith('./') ? {} : require(id);
  const context = { require: fakeRequire, __dirname: path.join(__dirname, '../electron'), console, process, URL,
    setTimeout: fn => { const timer = { fn, cleared: false }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; },
    setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(source, context);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(windows.length, 2);
  const [main, splash] = windows;
  main.webContents.mainFrame = { url: require('node:url').pathToFileURL(path.join(__dirname, '../dist/index.html')).href };
  main.webContents.getURL = () => main.webContents.mainFrame.url;
  const editorEvent = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  assert.equal(main.opts.minWidth, 480, 'high display scaling can use a narrower work area');
  assert.equal(main.opts.minHeight, 320, 'short laptop work areas can show the window');
  assert.equal(main.visible, false, 'main window waits for the renderer');
  assert.equal(main.maximizeCalls, 0, 'maximizing must not show the main window before it is ready');
  splash.emit('ready-to-show'); assert.equal(splash.visible, true);
  ipcMain.emit('startup:ready', { sender: splash.webContents });
  assert.equal(main.visible, false, 'splash cannot spoof main readiness');
  timers[0].fn();
  assert.equal(splash.webContents.sent.at(-1)[0], 'startup:failure', 'timeout offers recovery');
  ipcMain.emit('startup:retry', { sender: main.webContents });
  assert.equal(timers.length, 1, 'only splash can request a retry');
  ipcMain.emit('startup:retry', { sender: splash.webContents });
  assert.equal(timers.length, 2, 'retry starts another load');
  assert.equal(timers[0].cleared, true);
  ipcMain.emit('startup:ready', editorEvent);
  assert.equal(main.visible, true); assert.equal(splash.destroyed, true);
  assert.equal(main.isMaximized(), true, 'new app window opens maximized');
  assert.equal(main.maximizeCalls, 1);
  ipcMain.emit('window-control', editorEvent, 'maximize');
  assert.equal(main.isMaximized(), false, 'the user can restore the window');
  ipcMain.emit('startup:ready', editorEvent);
  assert.equal(main.isMaximized(), false, 'later renderer readiness does not override the user');
  assert.equal(main.maximizeCalls, 1);
  ipcMain.emit('window-control', editorEvent, 'maximize');
  assert.equal(main.isMaximized(), true, 'the maximize button still works');
  assert.equal(timers[1].cleared, true, 'ready closes splash without waiting');
  assert.equal(await handlers['help:open'](editorEvent, 'project'), true);
  assert.match(opened[0], /^https:\/\/github\.com\/david-8837\/MacroPad-/);
  assert.equal(await handlers['help:open'](editorEvent, 'https://evil.example'), false);
  assert.equal(await handlers['help:open']({ sender: splash.webContents }, 'guide'), false);
  const nav = (kind, url, isMainFrame = true) => {
    const event = { url, isMainFrame, blocked: false, preventDefault() { this.blocked = true; } };
    main.webContents.emit(kind, event, url);
    return event.blocked;
  };
  for (const kind of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
    assert.equal(nav(kind, main.webContents.mainFrame.url), false, `${kind} permits editor`);
    for (const url of ['https://evil.test/', 'http://localhost:5173.evil.test/', 'file:///other/file.html']) {
      assert.equal(nav(kind, url), true, `${kind} blocks ${url}`);
    }
  }
  assert.equal(nav('will-frame-navigate', main.webContents.mainFrame.url, false), true, 'subframes cannot navigate');
  assert.equal(session.permissionCheck(main.webContents, 'serial', 'file://', { isMainFrame: true }), true);
  assert.equal(session.permissionCheck(main.webContents, 'hid', 'file://', { isMainFrame: false }), false);
  assert.equal(session.permissionCheck(splash.webContents, 'serial', 'file://', { isMainFrame: true }), false);
  assert.equal(session.permissionCheck(main.webContents, 'geolocation', 'file://', { isMainFrame: true }), false);
  assert.equal(session.devicePermission, undefined, 'unselected devices are not blanket-authorized');
  assert.equal((await handlers['get-webhook-info'](editorEvent)).token, 'a'.repeat(48));
  assert.throws(() => handlers['get-webhook-info']({ sender: splash.webContents, senderFrame: main.webContents.mainFrame }), /Unauthorized/);
  assert.throws(() => handlers['get-webhook-info']({ sender: main.webContents, senderFrame: { url: main.webContents.mainFrame.url } }), /Unauthorized/, 'subframe IPC is denied');
  main.webContents.mainFrame.url = 'file:///other/file.html';
  assert.throws(() => handlers['get-webhook-info'](editorEvent), /Unauthorized/, 'a navigated renderer cannot use native IPC');
  ipcMain.emit('window-control', editorEvent, 'maximize');
  assert.equal(main.isMaximized(), true, 'untrusted pages cannot change the window');
  console.log('startup: readiness, navigation, IPC sender and help-link restrictions passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
