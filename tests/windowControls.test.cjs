const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('electron/preload.cjs', 'utf8');
for (const platform of ['win32', 'linux', 'darwin']) {
  let exposed;
  const electron = { contextBridge: { exposeInMainWorld: (key, value) => { assert.equal(key, 'electronAPI'); exposed = value; } }, ipcRenderer: {} };
  vm.runInNewContext(source, {require: id => { assert.equal(id, 'electron'); return electron; }, process:{platform}});
  assert.equal(exposed.nativeWindowControls, platform === 'win32');
  assert.equal(typeof exposed.windowControl, 'function', 'custom fallback remains available');
}
console.log('window controls: platform-specific preload flag passed');
