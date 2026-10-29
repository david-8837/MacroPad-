// A UI lock is an edit/upload guard, not a security boundary or a device lock.
// Run: node tests/deckLock.test.cjs
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const { build } = require('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'mpad3-lock-'));
  const outfile = join(dir, 'module.mjs');
  try {
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

(async () => {
  const { deckIsLocked, editDeckWhenUnlocked } = await bundle('src/utils/deckLock.ts');
  const saved = { isLocked: true, activeLayerId: 'L0', layers: [{ keys: [{ label: 'Before' }], dial: { label: 'Before' } }] };
  assert.equal(deckIsLocked(saved), true, 'a restored locked deck must stay locked');
  let called = 0;
  const replaceKey = prev => {
    called++;
    return { ...prev, layers: [{ ...prev.layers[0], keys: [{ label: 'After' }] }] };
  };
  assert.equal(editDeckWhenUnlocked(saved, replaceKey), saved, 'locked edit returns the same deck');
  assert.equal(called, 0, 'locked edit must not even run the mutation');
  const unlocked = { ...saved, isLocked: false };
  assert.equal(deckIsLocked(unlocked), false);
  const edited = editDeckWhenUnlocked(unlocked, replaceKey);
  assert.notEqual(edited, unlocked);
  assert.equal(edited.layers[0].keys[0].label, 'After');
  assert.equal(called, 1);
  assert.equal(editDeckWhenUnlocked({ ...saved, isLocked: true }, prev => ({ ...prev, layers: [] })).layers.length, 1);

  // Keep all app entry points behind the same policy. Dynamic browser smoke
  // separately checks disabled buttons, persistence after reload and unlocking.
  const { readFileSync } = require('node:fs');
  const ts = require('typescript');
  const app = readFileSync(join(__dirname, '..', 'src/App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function handler(name) {
    let found;
    function walk(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
        found = node.initializer?.getText(ast);
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
    assert.ok(found, `handler ${name} was removed; revisit lock coverage`);
    return found;
  }
  for (const name of ['putKey', 'writeActiveLayer']) {
    assert.match(handler(name), /editDeckWhenUnlocked\(prev,/);
  }
  for (const name of ['handleAssignViaKeycode', 'handleAssignApp', 'handleSaveKey',
    'handleSaveDial', 'handleSyncEEPROM']) {
    assert.match(handler(name), /deckIsLocked\(deck\)/, `${name} must refuse instead of claiming success`);
  }
  assert.match(handler('handleToggleDeckLock'), /uploadBusyRef\.current/);
  const macro = readFileSync(join(__dirname, '..', 'src/components/via/ViaMacroEditor.tsx'), 'utf8');
  assert.match(macro, /setMacros\(prev => isDeckLocked \? prev : edit\(prev\)\)/);
  assert.match(macro, /<fieldset disabled=\{isDeckLocked\}/);
  console.log('deckLock: restored lock, all assignment handlers, PC macros and upload guarded');
})().catch(err => { console.error(err); process.exitCode = 1; });
