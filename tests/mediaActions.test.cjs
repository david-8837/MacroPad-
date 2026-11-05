// Mock the Windows boundary: assert routing and errors without changing a real PC.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const util = require('../electron/native/util.cjs');
const originalSpawn = childProcess.spawn;
const fastKeys = require('../electron/native/fastKeys.cjs');
const originalFastSend = fastKeys.send;
const brightnessWorker = require('../electron/native/brightnessWorker.cjs');
const originalBrightnessSend = brightnessWorker.send;
fastKeys.send = async command => { scripts.push(command.events.map(s => `keybd_event(${s.vk}, 0, ${s.flags}, 0)`).join('\n')); return {success:true}; };
const originalPowershell = util.powershell;
const platform = Object.getOwnPropertyDescriptor(process, 'platform');
let scripts = [];
let responses = [];
brightnessWorker.send = async up => {
  scripts.push(brightnessWorker.WORKER.replace('if ($up)', `if (${up ? '$true' : '$false'})`));
  const result = await responses.shift();
  if (result.timedOut) return { success:false, transportFailure:true, error:'Windows brightness control timed out.' };
  if (result.code !== 0) return { success:false, transportFailure:true, error:`Windows brightness control failed: ${result.stderr}` };
  try { return JSON.parse(result.stdout); } catch { return {success:false, transportFailure:true, error:'Windows did not confirm a brightness change.'}; }
};
childProcess.spawn = (exe, args) => {
  assert.equal(exe, 'powershell.exe');
  scripts.push(args[args.length - 1]);
  const child = new EventEmitter();
  process.nextTick(() => child.emit('close', 0));
  return child;
};
util.powershell = async script => {
  scripts.push(script);
  return responses.shift();
};
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
const { executeAction, resolveVk } = require('../electron/actionExecutor.cjs');

async function run() {
  const hotkeys = {
    AudioVolumeUp: 0xaf, AudioVolumeDown: 0xae, AudioVolumeMute: 0xad,
    MediaPlayPause: 0xb3, MediaStop: 0xb2, MediaNext: 0xb0, MediaPrev: 0xb1,
    MediaTrackNext: 0xb0, MediaTrackPrevious: 0xb1,
  };
  for (const [key, vk] of Object.entries(hotkeys)) {
    assert.equal(resolveVk(key), vk);
    const res = await executeAction({ category: 'hotkey', payload: { keys: [key] } });
    assert.equal(res.success, true, key);
    assert.match(scripts.pop(), new RegExp(`keybd_event\\(${vk}, 0, 0`), key);
  }
  const media = { volume_up: 0xaf, volume_down: 0xae, mute: 0xad, play_pause: 0xb3,
    stop: 0xb2, next: 0xb0, prev: 0xb1 };
  for (const [action, vk] of Object.entries(media)) {
    const res = await executeAction({ category: 'media', payload: { mediaAction: action } });
    assert.equal(res.success, true, action);
    assert.match(scripts.pop(), new RegExp(`keybd_event\\(${vk}, 0, 0`), action);
  }
  for (const name of ['ArrowRight', '▶']) {
    const result = await executeAction({ category: 'hotkey', payload: { keys: ['Win', name] } });
    assert.equal(result.success, true);
    const script = scripts.pop();
    const events = [...script.matchAll(/keybd_event\((\d+), 0, (\d+),/g)].map(m => [+m[1], +m[2]]);
    assert.deepEqual(events, [[91, 0], [39, 1], [39, 3], [91, 2]], name);
  }
  assert.equal((await executeAction({ category: 'hotkey', payload: { keys: ['NumpadEnter'] } })).success, true);
  assert.match(scripts.pop(), /keybd_event\(13, 0, 1,/);
  assert.equal((await executeAction({ category: 'hotkey', payload: { keys: ['Enter'] } })).success, true);
  assert.match(scripts.pop(), /keybd_event\(13, 0, 0,/);
  assert.equal((await executeAction({ category: 'hotkey', payload: { keys: ['Ctrl', 'BrightnessUp'] } })).success, false);
  assert.equal(scripts.length, 0, 'never send a partial brightness chord');
  for (const [category, value, direction] of [['media', 'brightness_up', '$true'],
    ['media', 'brightness_down', '$false'], ['hotkey', 'BrightnessUp', '$true']]) {
    responses.push({ code: 0, stdout: '{"success":true,"level":50}', stderr: '', timedOut: false });
    const payload = category === 'media' ? { mediaAction: value } : { keys: [value] };
    assert.deepEqual(await executeAction({ category, payload }), { success: true, brightness: 50 });
    const script = scripts.pop();
    assert.ok(script.includes(`if (${direction})`));
    assert.match(script, /WmiMonitorBrightnessMethods/);
    assert.match(script, /WmiSetBrightness/);
    assert.match(script, /\$null -ne \$code/);
    assert.match(script, /CurrentBrightness -eq \$target/);
    assert.match(script, /attempted = \$attempted/);
    assert.match(script, /\$current \+ 10/);
    assert.match(script, /\$current - 10/);
    assert.match(script, /\$levels \| Where-Object/);
  }
  responses.push({ code: 0, stdout: '{"success":false,"attempted":false,"error":"No supported built-in display is available."}' });
  responses.push({ code: 0, stdout: '{"success":true,"level":70}' });
  assert.deepEqual(await executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } }),
    { success: true, brightness: 70 }, 'external DDC/CI is tried when WMI has no display');
  const externalScript = scripts.pop();
  assert.match(externalScript, /GetVCPFeatureAndVCPFeatureReply/);
  assert.match(externalScript, /SetVCPFeature/);
  assert.match(externalScript, /DestroyPhysicalMonitors/);
  assert.match(externalScript, /Change\(\$true\)/);
  scripts.pop(); // WMI attempt
  responses.push({ code: 0, stdout: '{"success":false,"attempted":false,"error":"No supported built-in display is available."}' });
  responses.push({ code: 0, stdout: '{"success":false,"error":"No DDC/CI monitor found."}' });
  const noDisplay = await executeAction({ category: 'media', payload: { mediaAction: 'brightness_down' } });
  assert.equal(noDisplay.success, false);
  assert.match(noDisplay.error, /no supported.*no DDC\/CI.*external monitors/i);
  assert.match(scripts.pop(), /Change\(\$false\)/);
  scripts.pop();
  for (const [reply, pattern] of [
    [{ code: -1, timedOut: true }, /timed out/i],
    [{ code: 1, stderr: 'blocked' }, /blocked/i],
    [{ code: 0, stdout: 'invalid' }, /did not confirm/i],
  ]) {
    responses.push(reply);
    assert.match((await require('../electron/native/brightness.cjs').adjustExternalBrightness(1)).error, pattern);
    scripts.pop();
  }
  for (const [reply, pattern] of [
    [{ code: 1, stderr: 'access denied' }, /access denied/i],
    [{ code: 0, stdout: 'invalid' }, /did not confirm/i],
    [{ code: -1, timedOut: true }, /timed out/i],
  ]) {
    responses.push(reply);
    const result = await executeAction({ category: 'media', payload: { mediaAction: 'brightness_down' } });
    assert.equal(result.success, false);
    assert.match(result.error, pattern);
    scripts.pop();
  }

  responses.push({ code: 0, stdout: '{"success":false,"attempted":true,"error":"Brightness could not be confirmed"}' });
  const uncertain = await executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } });
  assert.match(uncertain.error, /could not be confirmed/);
  assert.equal(scripts.length, 1, 'never issue a second display command after a WMI write was attempted'); scripts.pop();
  responses.push({ code: 0, stdout: '{"success":true,"level":100,"atLimit":true}' });
  assert.deepEqual(await executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } }), {success:true, brightness:100, brightnessAtLimit:true}); scripts.pop();
  responses.push({ code: 0, stdout: '{"success":false,"attempted":false,"transportFailure":true,"error":"helper stopped"}' });
  assert.match((await executeAction({category:'media',payload:{mediaAction:'brightness_up'}})).error, /helper stopped/);
  assert.equal(scripts.length, 1, 'uncertain transport never falls back to a second display'); scripts.pop();
  // Rapid presses must not perform concurrent WMI read-modify-write operations.
  let finishFirst;
  responses.push(new Promise(resolve => { finishFirst = resolve; }));
  responses.push({ code: 0, stdout: '{"success":true,"level":70}' });
  const first = executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } });
  const second = executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scripts.length, 1, 'second brightness read waits for first write');
  finishFirst({ code: 0, stdout: '{"success":true,"level":60}' });
  assert.deepEqual(await first, { success: true, brightness: 60 });
  assert.deepEqual(await second, { success: true, brightness: 70 });
  assert.equal(scripts.length, 2);
  scripts.length = 0;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  assert.match((await executeAction({ category: 'media', payload: { mediaAction: 'brightness_up' } })).error, /requires Windows/);
  console.log('mediaActions: mocked Windows key and brightness routing passed');
}
run().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  childProcess.spawn = originalSpawn;
  fastKeys.send = originalFastSend;
  brightnessWorker.send = originalBrightnessSend;
  util.powershell = originalPowershell;
  Object.defineProperty(process, 'platform', platform);
});
