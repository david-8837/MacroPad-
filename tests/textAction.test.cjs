// Literal macro text must never become a program launch, even if it ends .exe.
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const childProcess = require('node:child_process');

const originalSpawn = childProcess.spawn;
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
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].file, 'powershell.exe', 'text always uses SendKeys, never runs calc.exe');
  assert.match(spawned[0].args.at(-1), /SendWait\('calc\.exe'\)/);
  const missing = await executeAction({ category: 'text', payload: { command: 'calc.exe' } });
  assert.equal(missing.success, false);
  assert.equal(spawned.length, 1, 'an absent text payload must fail without spawning');

  const script = await executeAction({ category: 'script', payload: { command: 'calc.exe' } });
  assert.equal(script.success, true);
  assert.equal(spawned[1].file, 'calc.exe', 'explicit script launches remain explicit');
  console.log('textAction: literal typing is separate from program launch');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
