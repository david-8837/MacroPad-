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
      super(); this.opts = opts; this.visible = !!opts.show; this.destroyed = false;
      this.webContents = new EventEmitter(); this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    loadFile(file) { this.loaded = file; return Promise.resolve(); }
    show() { this.visible = true; } hide() { this.visible = false; }
    focus() {} isMinimized() { return false; } isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; }
  }
  Window.getAllWindows = () => windows.filter(w => !w.destroyed);
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, fn) => { handlers[name] = fn; };
  const session = new EventEmitter(); session.setPermissionCheckHandler = () => {}; session.setDevicePermissionHandler = () => {};
  const electron = { app, BrowserWindow: Window, ipcMain, Tray, Menu: { buildFromTemplate: a => a }, nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize() { return this; } }) }, dialog: { showErrorBox() {} }, session: { defaultSession: session }, shell: { openExternal: async url => opened.push(url) } };
  const webhook = new EventEmitter(); webhook.listen = () => {}; webhook.close = () => {};
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const fakeRequire = id => id === 'electron' ? electron : id === './webhookServer.cjs' ? { createWebhookServer: () => webhook, generateToken: () => 'a'.repeat(48) } : id === 'fs' ? { readFileSync: () => 'a'.repeat(48) } : id.startsWith('./') ? {} : require(id);
  const context = { require: fakeRequire, __dirname: path.join(__dirname, '../electron'), console, process,
    setTimeout: fn => { const timer = { fn, cleared: false }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; },
    setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(source, context);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(windows.length, 2);
  const [main, splash] = windows;
  assert.equal(main.visible, false, 'main window waits for the renderer');
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
  ipcMain.emit('startup:ready', { sender: main.webContents });
  assert.equal(main.visible, true); assert.equal(splash.destroyed, true);
  assert.equal(timers[1].cleared, true, 'ready closes splash without waiting');
  assert.equal(await handlers['help:open']({ sender: main.webContents }, 'project'), true);
  assert.match(opened[0], /^https:\/\/github\.com\/david-8837\/MacroPad-/);
  assert.equal(await handlers['help:open']({ sender: main.webContents }, 'https://evil.example'), false);
  assert.equal(await handlers['help:open']({ sender: splash.webContents }, 'guide'), false);
  console.log('startup: readiness, timeout, retry, sender and help-link restrictions passed');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
