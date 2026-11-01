/**
 * The deck always has four layers, numbered 0-3, and their names are words, not
 * generated sentences. These rules live in src/utils/channelLayers.ts and are
 * applied to every stored deck on load, so they are worth pinning down: a stored
 * deck from an older build has to come back with the same four pages, the same
 * dial defaults, and a name that is not "Edit & Cut Page (Layer 0)".
 */
const assert = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');

async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'layers-'));
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

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}

async function run() {
  console.log('[deckLayers] Starting deck layer tests...');
  const { LAYER_COUNT, DIAL_MODES, normalizeDeckLayers } = await bundle('src/utils/channelLayers.ts');
  const { defaultDeck } = await bundle('src/data/defaultDeck.ts');

  await check('a deck has four layers', () => {
    assert.strictEqual(LAYER_COUNT, 4);
  });

  await check('a bare deck is padded to four layers', () => {
    const deck = normalizeDeckLayers({
      id: 'deck-test',
      name: 'Studio Deck',
      activeLayerId: 'deck-test-layer-1',
      layers: [{ ...defaultDeck.layers[0] }],
    });
    assert.strictEqual(deck.layers.length, 4);
    assert.deepStrictEqual(
      deck.layers.map((l) => l.badge),
      ['LAYER 0', 'LAYER 1', 'LAYER 2', 'LAYER 3'],
    );
  });

  await check('every layer has nine keys and a dial', () => {
    const deck = normalizeDeckLayers({ ...defaultDeck, layers: [] });
    for (const layer of deck.layers) {
      assert.strictEqual(layer.keys.length, 9, `${layer.badge} keys`);
      assert.ok(layer.dial && layer.dial.cwAction, `${layer.badge} dial`);
    }
  });

  await check('names are words, not generated sentences', () => {
    const deck = normalizeDeckLayers({
      ...defaultDeck,
      layers: [
        { ...defaultDeck.layers[0], name: 'Edit & Cut Page' },
        { ...defaultDeck.layers[0], name: 'Tools & Navigation (Layer 1)' },
        { ...defaultDeck.layers[0], name: 'Custom Bank (Layer 2)' },
        { ...defaultDeck.layers[0], name: 'Macro Bank (Layer 3)' },
      ],
    });
    assert.deepStrictEqual(deck.layers.map((l) => l.name), ['Edit', 'Tools', 'Custom', 'Macros']);
  });

  await check('a name the user typed is left alone', () => {
    const custom = { ...defaultDeck.layers[0], name: 'Nuke Timeline' };
    const deck = normalizeDeckLayers({ ...defaultDeck, layers: [custom] });
    assert.strictEqual(deck.layers[0].name, 'Nuke Timeline');
  });

  await check('a new configuration has four empty key layers', () => {
    assert.strictEqual(defaultDeck.layers.length, 4);
    assert.deepStrictEqual(defaultDeck.layers.map(layer => layer.name), ['Layer 0', 'Layer 1', 'Layer 2', 'Layer 3']);
    for (const layer of defaultDeck.layers) {
      assert.strictEqual(layer.keys.length, 9);
      assert.ok(layer.keys.every(k => !k.tapAction && !k.holdAction && !k.doubleTapAction && !k.safetyConfirmAction));
      assert.ok(!layer.isExample);
    }
  });

  await check('the dial carries one mode per layer, numbered from zero', () => {
    const deck = normalizeDeckLayers({ ...defaultDeck, layers: [] });
    deck.layers.forEach((layer, i) => {
      assert.strictEqual(layer.dial.availableModes.length, 4, `${layer.badge} mode count`);
      assert.strictEqual(layer.dial.activeModeName, layer.dial.availableModes[i]);
      assert.ok(!/^Layer 4/.test(layer.dial.activeModeName), `${layer.badge} has a 1-based name`);
    });
    assert.deepStrictEqual(deck.layers[0].dial.availableModes, Array.from({ length: 4 }, (_, i) => `Layer ${i}: Volume`));
  });

  await check('an old three-mode dial is translated, not dropped', () => {
    const base = normalizeDeckLayers({ ...defaultDeck, layers: [] });
    const legacy = {
      ...base.layers[2],
      dial: {
        ...base.layers[2].dial,
        activeModeName: 'Layer 3: Focused App Audio',
        availableModes: ['Layer 1: Master Volume', 'Layer 2: Timeline Scrub', 'Layer 3: Focused App Audio'],
      },
    };
    const deck = normalizeDeckLayers({
      ...defaultDeck,
      layers: [base.layers[0], base.layers[1], legacy, base.layers[3]],
    });
    assert.deepStrictEqual([...deck.layers[2].dial.availableModes], [...DIAL_MODES]);
    assert.strictEqual(deck.layers[2].dial.activeModeName, 'Layer 2: Focused App Audio');
  });

  await check('an unknown active layer falls back to the first', () => {
    const deck = normalizeDeckLayers({ ...defaultDeck, activeLayerId: 'gone' });
    assert.strictEqual(deck.activeLayerId, deck.layers[0].id);
  });

  console.log(`\n=== deckLayers: ${passed} checks, ${failed} failures ===`);
  if (failed > 0) {
    console.log('DECK LAYER TESTS FAILED');
    process.exit(1);
  }
  console.log('DECK LAYER TESTS PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
