// Check every assignable keyboard-layout key and the entire shortcut catalogue.
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { resolve } = require('node:path');
const { resolveVk, buildChordSequence } = require('../electron/actionExecutor.cjs');
const result = buildSync({ stdin: { contents: `
  export * from './src/data/keyboardLayouts';
  export { chordToAction } from './src/utils/deviceKeymap';
  export { PC_SHORTCUTS } from './src/data/pcShortcuts';
`, resolveDir: resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const mod = { exports: {} };
new Function('module', 'exports', result.outputFiles[0].text)(mod, mod.exports);
const { chordToAction, drawerKeyName, PC_SHORTCUTS } = mod.exports;
const codes = new Set();
for (const [group, keys] of Object.entries(mod.exports)) {
  if (group.startsWith('DRAWER_') || !Array.isArray(keys) || group === 'PC_SHORTCUTS') continue;
  for (const key of keys) {
    if (key.code.startsWith('spacer') || key.code === 'Calc' || codes.has(key.code)) continue;
    codes.add(key.code);
    const name = drawerKeyName(key);
    assert.notEqual(resolveVk(name), null, `${key.code}: ${name} cannot execute on Windows`);
    assert.notEqual(chordToAction([name]).kind, 'unsupported', `${key.code}: ${name} cannot upload`);
  }
}
assert.equal(codes.size, 107);
for (const shortcut of PC_SHORTCUTS) {
  const result = chordToAction(shortcut.keys);
  if (shortcut.id === 'dev-terminal-admin') {
    assert.equal(result.kind, 'unsupported', 'Win+X then A is a sequence, not a chord');
  } else {
    assert.notEqual(result.kind, 'unsupported', `${shortcut.id}: ${result.reason}`);
    assert.ok(buildChordSequence(shortcut.keys).sequence, `${shortcut.id} has no Windows sequence`);
  }
}
for (const [name, usage, vk] of [
  ['Numpad1', 0x59, 0x61], ['Num 1', 0x59, 0x61], ['Numpad 7', 0x5f, 0x67],
  ['Numpad .', 0x63, 0x6e], ['Num Enter', 0x58, 0x0d], ['NumpadAdd', 0x57, 0x6b],
  ['NumpadMultiply', 0x55, 0x6a], ['⌫', 0x2a, 0x08], ['Caps', 0x39, 0x14],
  ['Menu', 0x65, 0x5d], ['PrtSc', 0x46, 0x2c], ['ScrLk', 0x47, 0x91],
]) {
  assert.equal(chordToAction([name]).code, usage, name);
  assert.equal(resolveVk(name), vk, name);
}
for (const [symbol, usage, vk] of [
  ['!', 0x1e, 0x31], ['@', 0x1f, 0x32], ['#', 0x20, 0x33], ['$', 0x21, 0x34],
  ['%', 0x22, 0x35], ['^', 0x23, 0x36], ['&', 0x24, 0x37], ['*', 0x25, 0x38],
  ['(', 0x26, 0x39], [')', 0x27, 0x30], ['+', 0x2e, 0xbb], ['_', 0x2d, 0xbd],
  ['{', 0x2f, 0xdb], ['}', 0x30, 0xdd], ['|', 0x31, 0xdc], [':', 0x33, 0xba],
  ['"', 0x34, 0xde], ['<', 0x36, 0xbc], ['>', 0x37, 0xbe], ['?', 0x38, 0xbf], ['~', 0x35, 0xc0],
]) {
  assert.equal(chordToAction([symbol]).code, 0x0200 | usage, symbol);
  assert.deepEqual(buildChordSequence([symbol]).sequence, [
    { vk: 0x10, up: false }, { vk, up: false }, { vk, up: true }, { vk: 0x10, up: true },
  ], symbol);
  assert.equal(buildChordSequence(['Shift', symbol]).sequence.filter(x => x.vk === 0x10 && !x.up).length, 1);
}
for (const invalid of ['constructor', '__proto__', 'NoSuchKey']) {
  assert.equal(chordToAction([invalid]).kind, 'unsupported', `unknown ${invalid} is never treated as a key`);
}
assert.equal(chordToAction(['Vol+']).code, 0xe9);
assert.equal(chordToAction(['Vol-']).code, 0xea);
assert.equal(resolveVk('Vol+'), 0xaf);
assert.equal(resolveVk('Vol-'), 0xae);
console.log(`shortcutCoverage: ${codes.size} virtual keys, ${PC_SHORTCUTS.length} library entries, numpad and shifted symbols checked`);
