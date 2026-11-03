const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const originalLoad = Module._load;
let script = '', launchMode = 'success';
Module._load = function(id, parent, isMain) {
  if (id === 'electron') return { app: {}, shell: {}, dialog: {}, nativeImage: {} };
  if (id === 'child_process') return {
    execFile: (_cmd, args, _opts, callback) => { script = args.at(-1); callback(null, '', ''); },
    spawn: () => {
      const child = new EventEmitter(); child.pid = 123; child.unref = () => {};
      process.nextTick(() => launchMode === 'success' ? child.emit('spawn') : child.emit('error', new Error('access denied')));
      return child;
    },
  };
  return originalLoad.call(this, id, parent, isMain);
};
const { launchApplication } = require('../electron/appDiscovery.cjs');
Module._load = originalLoad;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-safety-'));
  try {
    // Dollar expressions, backticks and apostrophes are legal in Windows filenames.
    const exe = path.join(dir, "some'$(danger)`file.exe"); fs.writeFileSync(exe, 'fixture');
    assert.equal((await launchApplication({ exePath: exe, focusExisting: true })).method, 'focus_existing');
    assert(script.includes("-Name 'some''$(danger)`file'"), 'process name is a PowerShell single-quoted literal');
    const success = await launchApplication({ exePath: exe });
    assert.equal(success.success, true); assert.equal(success.pid, 123);
    launchMode = 'error';
    const failed = await launchApplication({ exePath: exe });
    assert.equal(failed.success, false); assert.match(failed.error, /access denied/);
    console.log('appLaunchSafety: process-name quoting and asynchronous spawn errors passed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
