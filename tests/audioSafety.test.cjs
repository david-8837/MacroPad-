// Simulate audio failures: a failed per-app action must never change master volume.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const util = require('../electron/native/util.cjs');
const originalSpawn = cp.spawn;
const originalPowershell = util.powershell;
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
let spawnCount = 0;
let replies = [];
cp.spawn = () => { spawnCount++; throw new Error('unexpected master-volume fallback'); };
util.powershell = async () => replies.shift();
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
const audio = require('../electron/native/audio.cjs');
const { executeAction } = require('../electron/actionExecutor.cjs');
const success = stdout => ({ code: 0, stdout, stderr: '', timedOut: false });
async function main() {
  // SetProcessVolume must propagate failures after a successful read.
  replies.push(success('50'), success('ERR:Audio session rejected the request'));
  const adjust = await audio.adjustProcessVolume('123', 5);
  assert.equal(adjust.ok, false);
  assert.match(adjust.error, /rejected/);
  replies.push(success('50'), { code: 1, stdout: '', stderr: '', timedOut: false });
  assert.match((await audio.adjustProcessVolume('123', 5)).error, /PowerShell exited 1/);
  replies.push(success('50'), success(''));
  assert.deepEqual(await audio.adjustProcessVolume('123', 5), { ok: true, value: 55 });
  replies.push(success('50'), success('ERR:no session'));
  const failed = await executeAction({ category: 'audio_session', payload: { processName: '123', audioDelta: 5 } });
  assert.equal(failed.success, false);
  assert.match(failed.error, /no session/);
  assert.equal(spawnCount, 0, 'failed per-app delta must not send global volume key');
  const toggle = await executeAction({ category: 'audio_session', payload: { processName: '123', toggleMute: true } });
  assert.equal(toggle.success, false);
  assert.match(toggle.error, /toggle is not supported/);
  replies.push(success('ERR:no session'));
  const mute = await executeAction({ category: 'audio_session', payload: { processName: '123', toggleMute: true, muted: true } });
  assert.equal(mute.success, false);
  assert.match(mute.error, /no session/);
  assert.equal(spawnCount, 0, 'failed per-app mute must not mute all audio');
  console.log('audioSafety: per-app errors propagate without changing master audio');
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  cp.spawn = originalSpawn; util.powershell = originalPowershell;
  Object.defineProperty(process, 'platform', platform);
});
