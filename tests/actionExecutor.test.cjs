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
assert.strictEqual(resolveVk('LeftArrow'), 0x25);
assert.strictEqual(resolveVk('Numpad .'), 0x6e);
assert.strictEqual(resolveVk('KC_A'), 65);

// A chord with an unknown key must be rejected, never sent partially.
assert.ok(buildChordSequence(['Ctrl', 'NoSuchKey']).error);
assert.ok(buildChordSequence(['Win', '-']).sequence);

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
