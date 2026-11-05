// Windows-only smoke test: starts real helpers but never sends a key or changes brightness.
const assert = require('node:assert/strict');
const {createKeyWorker} = require('../electron/native/fastKeys.cjs');
const {WORKER: brightnessScript} = require('../electron/native/brightnessWorker.cjs');
(async () => {
  if (process.platform !== 'win32') { console.log('fastKeysWindows: SKIP — requires Windows'); return; }
  const keys = createKeyWorker({timeoutMs:20000});
  const brightness = createKeyWorker({workerScript:brightnessScript, timeoutMs:20000});
  try {
    assert.deepEqual(await keys.send({kind:'keys',events:[]}), {success:true});
    assert.deepEqual(await keys.send({kind:'keys',events:[]}), {success:true});
    const response = await brightness.send({kind:'healthcheck'});
    assert.equal(response.success, false);
    assert.match(response.error, /Unsupported display operation/);
    console.log('fastKeysWindows: real PowerShell helpers started and reused without affecting the desktop');
  } finally { keys.stop(); brightness.stop(); }
})().catch(e => {console.error(e); process.exitCode=1;});
