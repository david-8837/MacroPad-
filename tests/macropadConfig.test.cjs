// Older single-deck configurations retain every key, knob and layer after the
// local lock and deck identity UI are removed.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { build } = require('esbuild');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpad-config-'));
  try {
    const outfile = join(dir, 'module.mjs');
    await build({ entryPoints: [join(__dirname, '../src/utils/macropadConfig.ts')], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    const { restoreMacropadConfig } = await import(`file://${outfile}`);
    const saved = { id: 'deck-main', name: 'Studio Deck', isLocked: true, activeLayerId: 'layer-2',
      layers: Array.from({ length: 4 }, (_, i) => ({ id: `layer-${i}`, name: `My ${i}`, badge: `LAYER ${i}`,
        keys: [{ keyIndex: 0, label: `Mine ${i}`, tapAction: { id: `action-${i}`, category: 'hotkey', payload: { keys: ['A'] } } }],
        dial: { label: `Knob ${i}`, activeModeName: 'Custom', availableModes: ['a', 'b', 'c', 'd'], cwAction: { name: `CW ${i}` } } })) };
    const restored = restoreMacropadConfig(saved);
    assert.equal(restored.layers.length, 4);
    assert.equal(restored.activeLayerId, 'layer-2');
    assert.equal(restored.name, 'Macropad');
    assert.equal('isLocked' in restored, false);
    for (let i = 0; i < 4; i++) {
      assert.equal(restored.layers[i].keys[0].label, `Mine ${i}`);
      assert.equal(restored.layers[i].keys[0].tapAction.id, `action-${i}`);
      assert.equal(restored.layers[i].dial.cwAction.name, `CW ${i}`);
    }
    assert.equal(restoreMacropadConfig({ ...saved, name: 'Personal' }).name, 'Personal');
    const app = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');
    const sheet = readFileSync(join(__dirname, '../src/components/UploadSheet.tsx'), 'utf8');
    assert.match(app, /restoreMacropadConfig\(parsed\)/);
    assert.doesNotMatch(app, /handleToggleDeckLock|deckIsLocked|deck\.isLocked/);
    assert.doesNotMatch(sheet, /deck\.isLocked/);
    console.log('macropadConfig: legacy lock removed without losing key, knob or layer settings');
  } finally { rmSync(dir, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
