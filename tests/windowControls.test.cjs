const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('electron/preload.cjs', 'utf8');
for (const platform of ['win32', 'linux', 'darwin']) {
  let exposed;
  const calls = [];
  const electron = { contextBridge: { exposeInMainWorld: (key, value) => { assert.equal(key, 'electronAPI'); exposed = value; } }, ipcRenderer: { invoke: (...args) => { calls.push(args); } } };
  vm.runInNewContext(source, {require: id => { assert.equal(id, 'electron'); return electron; }, process:{platform}});
  assert.equal(exposed.nativeWindowControls, platform === 'win32');
  assert.equal(typeof exposed.windowControl, 'function', 'custom fallback remains available');
  exposed.prepareReset(); exposed.finishReset();
  exposed.getViewScale(); exposed.setViewScale(1.25); exposed.setWindowTheme('dark', true);
  assert.deepEqual(calls, [['reset:prepare'], ['reset:finish'], ['view-scale:get'], ['view-scale:set', 1.25], ['view-theme:set', 'dark', true]], 'view scale IPC is narrowly exposed');
}
console.log('window controls: platform-specific preload flag passed');
