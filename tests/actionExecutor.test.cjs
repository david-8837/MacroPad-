// Run: node tests/actionExecutor.test.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveVk, buildChordSequence } = require('../electron/actionExecutor.cjs');

// Punctuation used by real shortcuts must resolve (they used to be silently dropped,
// turning "Win + -" into a bare Win press that opens the Start menu).
const punctuation = { '.': 190, '+': 187, '-': 189, '/': 191, '[': 219, ']': 221, '\\': 220 };
for (const [key, vk] of Object.entries(punctuation)) assert.strictEqual(resolveVk(key), vk, `key ${key}`);

assert.strictEqual(resolveVk('MediaTrackNext'), 0xb0);
assert.strictEqual(resolveVk('MediaTrackPrevious'), 0xb1);
assert.strictEqual(resolveVk('MediaStop'), 0xb2);
assert.strictEqual(resolveVk('RightArrow'), 0x27);
for (const [name, vk] of Object.entries({ '▶': 0x27, '◀': 0x25, '▲': 0x26, '▼': 0x28 })) {
  assert.strictEqual(resolveVk(name), vk, `saved arrow glyph ${name}`);
  assert.deepStrictEqual(buildChordSequence(['Win', name]).sequence, [
    { vk: 0x5b, up: false }, { vk, up: false }, { vk, up: true }, { vk: 0x5b, up: true },
  ]);
}
assert.strictEqual(resolveVk('LeftArrow'), 0x25);
assert.strictEqual(resolveVk('Numpad .'), 0x6e);
assert.strictEqual(resolveVk('KC_A'), 65);

// A chord with an unknown key must be rejected, never sent partially.
assert.ok(buildChordSequence(['Ctrl', 'NoSuchKey']).error);
assert.ok(buildChordSequence(['Win', '-']).sequence);
assert.deepStrictEqual(buildChordSequence(['▶', 'Win']).sequence, [
  { vk: 0x5b, up: false }, { vk: 0x27, up: false },
  { vk: 0x27, up: true }, { vk: 0x5b, up: true },
], 'a modifier selected after the arrow is pressed first');

assert.deepStrictEqual(buildChordSequence(['C', 'Ctrl', 'V']).sequence, [
  { vk: 0x11, up: false }, { vk: 0x43, up: false }, { vk: 0x56, up: false },
  { vk: 0x56, up: true }, { vk: 0x43, up: true }, { vk: 0x11, up: true },
], 'multiple ordinary keys are held together, not run as a sequence');
assert.ok(buildChordSequence(Array(33).fill('A')).error, 'desktop key limit is enforced');

// Every key in the bundled shortcut vault must be executable.
const src = fs.readFileSync(path.join(__dirname, '../src/data/pcShortcuts.ts'), 'utf8');
const bad = [];
let total = 0;
for (const m of src.matchAll(/keys:\s*\[([^\]]*)\]/g)) {
  for (const k of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"([^"]*)"/g)) {
    // Evaluate the literal the way TypeScript will, so '\\\\' becomes one backslash
    const key = k[1] !== undefined ? JSON.parse('"' + k[1].replace(/"/g, '\\"') + '"') : k[2];
    total++;
    if (resolveVk(key) == null) bad.push(key);
  }
}
assert.deepStrictEqual(bad, [], `unmappable shortcut keys: ${JSON.stringify(bad)}`);
console.log(`actionExecutor: all assertions passed (${total} shortcut keys resolve)`);
// Run separately so Windows API stubs never affect other executor tests.
for (const test of ['mediaActions.test.cjs', 'audioSafety.test.cjs', 'fastKeys.test.cjs', 'fastKeysWindows.test.cjs']) {
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
}
