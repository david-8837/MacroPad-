// Exercise the startup window state machine without a desktop or physical device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

async function run(platform, initialTheme = 'light') {
  const themeWrites = [];
  const fakeProcess = Object.create(process);
  Object.defineProperty(fakeProcess, 'platform', { value: platform });
  const windows = [], timers = [], handlers = {}, opened = [];
  let webhookOptions; const resets = [];
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: true, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getPath: () => '/tmp', quit: () => { app.didQuit = true; } });
  class Window extends EventEmitter {
    constructor(opts) {
      super(); this.opts = opts; this.visible = !!opts.show; this.destroyed = false; this.maximized = false; this.maximizeCalls = 0;
      this.webContents = new EventEmitter(); this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      this.webContents.zoomFactor = 1;
      this.webContents.getZoomFactor = () => this.webContents.zoomFactor;
      this.webContents.setZoomFactor = factor => { this.webContents.zoomFactor = factor; };
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    loadFile(file, options) { this.loaded = file; this.loadOptions = options; return Promise.resolve(); }
    show() { this.visible = true; } hide() { this.visible = false; }
    maximize() { this.maximized = true; this.maximizeCalls++; this.visible = true; }
    unmaximize() { this.maximized = false; } isMaximized() { return this.maximized; }
    setTitleBarOverlay(options) { this.overlay = options; }
    focus() {} isMinimized() { return false; } isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; }
  }
  Window.getAllWindows = () => windows.filter(w => !w.destroyed);
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, fn) => { handlers[name] = fn; };
  const session = new EventEmitter(); session.clearCache = async () => { resets.push('cache'); }; session.flushStorageData = () => { resets.push('flush'); }; session.setPermissionCheckHandler = fn => { session.permissionCheck = fn; }; session.setDevicePermissionHandler = fn => { session.devicePermission = fn; };
  const electron = { app, BrowserWindow: Window, ipcMain, Tray, Menu: { buildFromTemplate: a => a }, nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize() { return this; } }) }, dialog: { showErrorBox() {} }, session: { defaultSession: session }, shell: { openExternal: async url => opened.push(url) } };
  const webhook = new EventEmitter(); webhook.listen = () => {}; webhook.close = () => {};
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const fakeRequire = id => id === './resetData.cjs' ? { resetNativeData: dir => resets.push(dir) } : id === './windowTheme.cjs' ? { readWindowTheme: () => initialTheme, saveWindowTheme: (_dir, theme) => { themeWrites.push(theme); return true; } } : id === 'electron' ? electron : id === './webhookServer.cjs' ? { createWebhookServer: options => { webhookOptions = options; return webhook; }, generateToken: () => 'a'.repeat(48) } : id === 'fs' ? { readFileSync: () => 'a'.repeat(48) } : id.startsWith('./') ? {} : require(id);
  const context = { require: fakeRequire, __dirname: path.join(__dirname, '../electron'), console, process: fakeProcess, URL,
    setTimeout: fn => { const timer = { fn, cleared: false }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; },
    setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(source, context);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(windows.length, 2);
  const [main, splash] = windows;
  main.webContents.zoomFactor = 0.5;
  main.webContents.emit('did-finish-load');
  assert.equal(main.webContents.zoomFactor, 1, 'unreadably small saved zoom recovers on load');
  for (const factor of [0.8, 1, 1.5]) {
    main.webContents.zoomFactor = factor;
    main.webContents.emit('did-finish-load');
    assert.equal(main.webContents.zoomFactor, factor, 'normal and enlarged zoom preferences are preserved');
  }
  main.webContents.mainFrame = { url: require('node:url').pathToFileURL(path.join(__dirname, '../dist/index.html')).href };
  main.webContents.getURL = () => main.webContents.mainFrame.url;
  const editorEvent = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  assert.throws(() => handlers['view-theme:set'](editorEvent, 'invalid'), /Invalid window theme/);
  assert.throws(() => handlers['view-theme:set']({ sender: splash.webContents }, 'dark'), /Unauthorized/);
  assert.throws(() => handlers['view-theme:set'](editorEvent, 'dark', 'bad'), /Invalid window theme/);
  assert.equal(await handlers['view-theme:set'](editorEvent, 'dark', false), true);
  assert.deepEqual(themeWrites, [], 'session-only theme does not change the splash preference');
  assert.equal(await handlers['view-theme:set'](editorEvent, 'dark', true), true);
  assert.deepEqual(themeWrites, ['dark']);
  if (platform === 'win32') {
    assert.equal(main.overlay.color, '#171b22');
    assert.equal(await handlers['view-theme:set'](editorEvent, 'light'), true);
    assert.equal(main.overlay.color, '#e9e8e4');
  }
  assert.equal(await handlers['view-scale:get'](editorEvent), 1.5);
  assert.equal(await handlers['view-scale:set'](editorEvent, 1.25), 1.25);
  assert.equal(main.webContents.zoomFactor, 1.25);
  assert.equal(await handlers['view-scale:set'](editorEvent, 1), 1);
  for (const bad of [0.79, 2.01, NaN, Infinity, '1', null]) {
    assert.throws(() => handlers['view-scale:set'](editorEvent, bad), /80% and 200%/);
  }
  assert.equal(main.webContents.zoomFactor, 1, 'invalid requests leave the zoom unchanged');
  assert.throws(() => handlers['view-scale:set']({ sender: splash.webContents }, 1), /Unauthorized/);

  if (platform === 'win32') {
    assert.equal(main.opts.titleBarStyle, 'hidden');
    assert.equal(main.opts.titleBarOverlay.height, 32, 'native caption buttons fit the existing header');
    assert.equal(main.opts.titleBarOverlay.symbolColor, initialTheme === 'dark' ? '#edf1f7' : '#141414');
    assert.notEqual(main.opts.frame, false, 'native window frame is required for Windows captions');
  } else assert.equal(main.opts.frame, false, 'other platforms retain the existing custom controls');
  assert.equal(splash.opts.frame, false, 'the splash remains frameless');
  assert.equal(splash.opts.backgroundColor, initialTheme === 'dark' ? '#171b22' : '#FFFFFF');
  assert.equal(splash.loadOptions.query.theme, initialTheme, 'splash theme is available before first paint');
  assert.equal(main.opts.minWidth, 480, 'high display scaling can use a narrower work area');
  assert.equal(main.opts.minHeight, 320, 'short laptop work areas can show the window');
  const webhookEvent = { source: 'webhook', endpoint: '/test', data: {} };
  assert.equal(webhookOptions.onEvent(webhookEvent), false, 'unsubscribed renderer must not acknowledge delivery');
  ipcMain.emit('hardware-event:subscription', { sender: splash.webContents }, true);
  assert.equal(webhookOptions.onEvent(webhookEvent), false, 'untrusted sender cannot claim subscription');
  ipcMain.emit('hardware-event:subscription', editorEvent, true);
  assert.equal(webhookOptions.onEvent(webhookEvent), true);
  assert.equal(main.webContents.sent.at(-1)[0], 'hardware-event');
  main.webContents.emit('did-start-navigation', {}, main.webContents.mainFrame.url, false, true);
  assert.equal(webhookOptions.onEvent(webhookEvent), false, 'reload resets subscription');
  ipcMain.emit('hardware-event:subscription', editorEvent, true);
  ipcMain.emit('hardware-event:subscription', editorEvent, false);
  assert.equal(webhookOptions.onEvent(webhookEvent), false, 'unsubscribe stops acknowledgement');
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
  let prevented = false;
  main.emit('close', { preventDefault() { prevented = true; } });
  assert(prevented && !main.visible, 'native close keeps close-to-tray behavior');
  main.show();
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
  assert.throws(() => handlers['reset:finish'](editorEvent), /not prepared/);
  assert.throws(() => handlers['reset:prepare']({ sender: splash.webContents }), /Unauthorized/);
  main.webContents.zoomFactor = 1.5;
  assert.equal(await handlers['reset:prepare'](editorEvent), true);
  assert.deepEqual(resets, ['cache', 'flush', '/tmp']);
  assert.equal(main.webContents.zoomFactor, 1);
  assert.equal(webhookOptions.onEvent(webhookEvent), false, 'reset stops webhook action delivery');
  assert.equal(await handlers['reset:finish'](editorEvent), true);
  timers.at(-1).fn();
  assert.equal(app.didQuit, true, 'reset exits the tray application');
  main.webContents.mainFrame.url = 'file:///other/file.html';
  assert.throws(() => handlers['get-webhook-info'](editorEvent), /Unauthorized/, 'a navigated renderer cannot use native IPC');
  ipcMain.emit('window-control', editorEvent, 'maximize');
  assert.equal(main.isMaximized(), true, 'untrusted pages cannot change the window');
  console.log(`startup (${platform}): native window configuration, close to tray, readiness and IPC restrictions passed`);
}
Promise.all([run('win32'), run('win32', 'dark'), run('linux'), run('linux', 'dark')]).catch(e => { console.error(e); process.exitCode = 1; });
