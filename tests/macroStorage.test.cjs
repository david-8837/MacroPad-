/**
 * Macro storage: the editor writes it, the deck reads it.
 *
 * These two halves lived apart once. The editor stored slots under one key and
 * executeDeckAction read another, so a macro key ran a macro that was not the one
 * on screen — and before that, both keys held sixteen invented presets the user
 * never wrote. Both failures are cheap to test and expensive to notice by hand.
 */
const assert = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');

async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'macro-'));
  const outfile = join(tmp, 'mod.mjs');
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

function installStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
  return data;
}

let passed = 0;
let failed = 0;
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok   ${name}`);
    })
    .catch((err) => {
      failed++;
      console.log(`  FAIL ${name} — ${err.message}`);
    });
}

async function runTests() {
  console.log('[macroStorage] Starting macro storage tests...');

  const store = installStorage();
  const storage = await bundle('src/utils/macroStorage.ts');
  const deck = await bundle('src/utils/executeDeckAction.ts');

  await check('the key has one name, shared by both modules', () => {
    assert.strictEqual(typeof storage.MACRO_STORAGE_KEY, 'string');
    assert.ok(storage.MACRO_STORAGE_KEY.length > 0);
    // Changing this string is a data migration, not a rename: assert it out loud.
    assert.strictEqual(storage.MACRO_STORAGE_KEY, 'kadowaz_macros_v2');
  });

  await check('what the editor saves is what the deck loads', () => {
    const macro = {
      id: 3,
      name: 'Paste plain text',
      description: '',
      actions: [{ id: 'a1', type: 'combo', value: 'Ctrl+Shift+V', keys: ['Ctrl', 'Shift', 'V'] }],
    };
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([macro]));
    const loaded = deck.loadStoredMacros();
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].name, 'Paste plain text');
    assert.deepStrictEqual(loaded[0].actions[0].keys, ['Ctrl', 'Shift', 'V']);
  });

  await check('the old seeded key is ignored, not migrated', () => {
    store.clear();
    store.set(
      'kadowaz_macros',
      JSON.stringify([{ id: 0, name: 'Copy & Paste Helper', actions: [{ type: 'combo', value: 'Ctrl+C', keys: ['Ctrl', 'C'] }] }])
    );
    assert.deepStrictEqual(deck.loadStoredMacros(), [], 'legacy presets must not come back');
  });

  await check('an empty slot is reported, not silently run', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 0, name: '', actions: [] }]));
    const res = await deck.executeMacroSlot(9);
    assert.strictEqual(res.success, false);
    assert.ok(/not defined/i.test(res.error || ''), res.error);
  });

  await check('corrupt/duplicate slots cannot make a different M-slot appear ready', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([
      null, { id: -1, actions: [{ type: 'combo', keys: ['A'] }] },
      { id: 0, name: 'First empty', actions: [] },
      { id: 0, name: 'Forged second', actions: [{ type: 'combo', keys: ['A'] }] },
    ]));
    const macros = deck.loadStoredMacros();
    assert.deepStrictEqual(macros.map(m => m.id), [0]);
    assert.strictEqual((await deck.executeMacroSlot(0)).success, false);
  });

  await check('a defined but empty macro is not falsely reported as executed', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 0, name: 'Empty', actions: [] }]));
    const res = await deck.executeMacroSlot(0);
    assert.strictEqual(res.success, false);
    assert.match(res.error, /empty|no steps/i);
  });

  await check('legacy down/up steps are rejected, not falsely reported as a held key', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 2, name: 'Hold Ctrl', actions: [
      { type: 'down', value: 'Ctrl' }, { type: 'up', value: 'Ctrl' },
    ] }]));
    const res = await deck.executeMacroSlot(2);
    assert.strictEqual(res.success, false);
    assert.match(res.error, /not executable|use a combo/i);
  });

  await check('a delay-only macro runs without a native shell', async () => {
    store.clear();
    store.set(
      storage.MACRO_STORAGE_KEY,
      JSON.stringify([{ id: 1, name: 'Wait', actions: [{ type: 'delay', value: '1', delayMs: 1 }] }])
    );
    const res = await deck.executeMacroSlot(1);
    assert.strictEqual(res.success, true);
  });

  await check('a failing native step aborts the macro rather than reporting success', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 2, name: 'Two steps', actions: [
      { type: 'combo', value: 'Ctrl+A', keys: ['Ctrl', 'A'] },
      { type: 'combo', value: 'Ctrl+B', keys: ['Ctrl', 'B'] },
    ] }]));
    const calls = [];
    globalThis.window = { electronAPI: { execAction: async (action) => {
      calls.push(action);
      return { success: false, error: 'injected failure' };
    } } };
    try {
      const res = await deck.executeMacroSlot(2);
      assert.strictEqual(res.success, false);
      assert.match(res.error, /Step 1 failed.*injected failure/);
      assert.strictEqual(calls.length, 1, 'the second step must not run');
    } finally { delete globalThis.window; }
  });

  await check('an empty native response is a failure, not an invented success', async () => {
    globalThis.window = { electronAPI: { execAction: async () => undefined } };
    try {
      const res = await deck.sendNativeAction({ id: 'empty-reply', category: 'hotkey',
        name: 'Empty reply', payload: { keys: ['A'] } });
      assert.strictEqual(res.success, false);
      assert.match(res.error, /no valid result/);
    } finally { delete globalThis.window; }
  });

  await check('a literal text step is not sent as a program-launch script', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 3, name: 'Type', actions: [
      { type: 'text', value: 'calc.exe' },
    ] }]));
    const calls = [];
    globalThis.window = { electronAPI: { execAction: async (action) => {
      calls.push(action);
      return { success: true };
    } } };
    try {
      const res = await deck.executeMacroSlot(3);
      assert.strictEqual(res.success, true);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].category, 'text');
      assert.deepStrictEqual(calls[0].payload, { text: 'calc.exe' });
    } finally { delete globalThis.window; }
  });

  await check('Test Run and physical playback share step order and native route', async () => {
    store.clear();
    store.set(storage.MACRO_STORAGE_KEY, JSON.stringify([{ id: 7, name: 'Ready', actions: [
      { type: 'text', value: 'hello' }, { type: 'delay', value: '1', delayMs: 1 },
      { type: 'combo', value: 'Ctrl+C', keys: ['Ctrl', 'C'] },
    ] }]));
    const steps = [];
    const calls = [];
    globalThis.window = { electronAPI: { execAction: async action => {
      calls.push(action); return { success: true };
    } } };
    try {
      const res = await deck.executeMacroSlot(7, index => steps.push(index));
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(steps, [0, 1, 2]);
      assert.deepStrictEqual(calls.map(x => x.category), ['text', 'hotkey']);
    } finally { delete globalThis.window; }
  });

  console.log(`\n=== macroStorage: ${passed} checks, ${failed} failures ===`);
  if (failed > 0) {
    console.log('MACRO STORAGE TESTS FAILED');
    process.exit(1);
  }
  console.log('MACRO STORAGE TESTS PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
