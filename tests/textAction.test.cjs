// Literal macro text must never become a program launch, even if it ends .exe.
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const childProcess = require('node:child_process');

const originalSpawn = childProcess.spawn;
const fastKeys = require('../electron/native/fastKeys.cjs');
const sent = [];
fastKeys.send = async command => { sent.push(command); return {success:true}; };
const spawned = [];
childProcess.spawn = (file, args) => {
  spawned.push({ file, args });
  const child = new EventEmitter();
  child.unref = () => {};
  queueMicrotask(() => child.emit('close', 0));
  return child;
};
const { executeAction } = require('../electron/actionExecutor.cjs');
childProcess.spawn = originalSpawn;

async function main() {
  const typed = await executeAction({ category: 'text', payload: { text: 'calc.exe' } });
  assert.equal(typed.success, true);
  assert.equal(spawned.length, 0, 'text does not launch a new process');
  assert.deepEqual(sent[0], {kind:'text',text:'calc.exe'}, 'text remains literal, not a command');
  await executeAction({ category:'text', payload:{text:"can't (+)"} });
  assert.deepEqual(sent[1], {kind:'text',text:"can't {(}{+}{)}"}, 'literal apostrophes and SendKeys special characters are preserved');
  const missing = await executeAction({ category: 'text', payload: { command: 'calc.exe' } });
  assert.equal(missing.success, false);
  assert.equal(spawned.length, 0, 'an absent text payload must fail without spawning');

  const script = await executeAction({ category: 'script', payload: { command: 'calc.exe' } });
  assert.equal(script.success, true);
  assert.equal(spawned[0].file, 'calc.exe', 'explicit script launches remain explicit');
  const quoted = await executeAction({ category: 'script', payload: { command: '"C:\\Program Files\\Editor\\editor.exe" --new-window' } });
  assert.equal(quoted.success, true);
  assert.equal(spawned[1].file, 'C:\\Program Files\\Editor\\editor.exe', 'quoted paths with spaces are launched, not typed');
  assert.deepEqual(spawned[1].args, ['--new-window']);
  console.log('textAction: literal typing is separate from program launch');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
