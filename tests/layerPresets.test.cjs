const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { build } = require('esbuild');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpad-presets-'));
  try {
    const root = resolve(__dirname, '..');
    const entry = join(dir, 'entry.mjs');
    writeFileSync(entry, `export { LAYER_PRESETS, applyLayerPreset } from '${root}/src/data/layerPresets.ts';\nexport { defaultDeck } from '${root}/src/data/defaultDeck.ts';\nexport { deckToConfig } from '${root}/src/utils/deckToConfig.ts';\nexport { defaultConfig, ACTION_TYPE } from '${root}/host/protocol/mpad3-protocol.mjs';`);
    const outfile = join(dir, 'bundle.mjs');
    await build({entryPoints:[entry], bundle:true, platform:'node', format:'esm', outfile, logLevel:'silent'});
    const { LAYER_PRESETS, applyLayerPreset, defaultDeck, deckToConfig, defaultConfig, ACTION_TYPE } = await import(`file://${outfile}`);
    const expected = {
      blender: ['Design', 'Move', ['G']], fusion: ['Design', 'Extrude', ['E']],
      figma: ['Design', 'Frame', ['F']], canva: ['Design', 'Text', ['T']],
      photoshop: ['Design', 'Brush', ['B']], illustrator: ['Design', 'Pen', ['P']],
      resolve: ['Video', 'Blade at head', ['Ctrl', 'B']], premiere: ['Video', 'Add edit', ['Ctrl', 'K']],
      'claude-code': ['Coding', 'Transcript', ['Ctrl', 'O']], codex: ['Coding', 'Copy response', ['Ctrl', 'O']],
      vscode: ['Coding', 'Terminal', ['Ctrl', '`']], word: ['Office', 'Heading 1', ['Ctrl', 'Alt', '1']],
      excel: ['Office', 'AutoSum', ['Alt', '=']], powerpoint: ['Office', 'New slide', ['Ctrl', 'M']],
      gimp: ['Design', 'Paintbrush', ['P']], inkscape: ['Design', 'Pen', ['B']],
      krita: ['Design', 'Eraser mode', ['E']], 'after-effects': ['Video', 'Trim in point', ['Alt', '[']],
      audacity: ['Audio', 'Record', ['R']], intellij: ['Coding', 'Find action', ['Ctrl', 'Shift', 'A']],
      'google-docs': ['Office', 'Center', ['Ctrl', 'Shift', 'E']],
      'google-sheets': ['Office', 'Fill range', ['Ctrl', 'Enter']],
      'google-slides': ['Office', 'Ungroup', ['Ctrl', 'Alt', 'Shift', 'G']],
      'minecraft-java': ['Games', 'Hotbar 9', ['9']], fortnite: ['Games', 'Map', ['M']],
      valorant: ['Games', 'Ultimate', ['X']], 'counter-strike-2': ['Games', 'Buy menu', ['B']],
      'league-of-legends': ['Games', 'Scoreboard toggle', ['O']], 'dota-2': ['Games', 'Level Q', ['Ctrl', 'Q']],
      roblox: ['Games', 'Hotbar 9', ['9']],
      'elden-ring': ['Games', 'Switch spell', ['ArrowUp']], 'cyberpunk-2077': ['Games', 'Cyberware', ['E']],
      'witcher-3': ['Games', 'Quick save', ['F5']], skyrim: ['Games', 'Quick save', ['F5']],
      'baldurs-gate-3': ['Games', 'Journal', ['L']], 'stardew-valley': ['Games', 'Next toolbar', ['Tab']],
      terraria: ['Games', 'Quick heal', ['H']],
    };
    assert.equal(new Set(LAYER_PRESETS.map(p => p.id)).size, LAYER_PRESETS.length, 'preset IDs are unique');
    for (const [id, [group, label, keys]] of Object.entries(expected)) {
      const preset = LAYER_PRESETS.find(p => p.id === id);
      assert.ok(preset, `${id} is present`);
      assert.equal(preset.group, group);
      assert.deepEqual(preset.keys.find(k => k.label === label)?.action.payload.keys, keys, `${id} ${label}`);
    }
    for (const id of ['minecraft-java', 'roblox']) {
      const preset = LAYER_PRESETS.find(p => p.id === id);
      assert.deepEqual(preset.keys.map(k => k.action.payload.keys), Array.from({ length: 9 }, (_, i) => [String(i + 1)]));
    }
    assert(LAYER_PRESETS.filter(p => p.group === 'Games').every(p => p.note && p.keys.every(k => k.action.category === 'hotkey')));
    assert.match(LAYER_PRESETS.find(p => p.id === 'claude-code').note, /CLI.*terminal/i);
    assert.match(LAYER_PRESETS.find(p => p.id === 'codex').note, /CLI.*terminal/i);
    assert.equal(defaultDeck.layers.length, 4);
    for (const layer of defaultDeck.layers) {
      assert.equal(layer.keys.length, 9);
      assert(layer.keys.every(k => !k.tapAction && !k.holdAction && !k.doubleTapAction && !k.safetyConfirmAction));
    }
    for (const preset of LAYER_PRESETS) {
      assert.equal(preset.keys.length, 9, preset.name);
      for (let target = 0; target < 4; target++) {
        const deck = structuredClone(defaultDeck);
        const before = structuredClone(deck);
        deck.layers[target].keys[0].holdAction = { id:'old', name:'old', category:'hotkey', payload:{keys:['A']} };
        deck.layers[target].keys[0].isDestructiveSafety = true;
        deck.layers[target] = applyLayerPreset(deck.layers[target], preset);
        assert.equal(deck.layers[target].id, before.layers[target].id);
        assert.deepEqual(deck.layers[target].dial, before.layers[target].dial);
        assert(deck.layers[target].keys.every(k => k.tapAction && !k.holdAction && !k.doubleTapAction && !k.isDestructiveSafety));
        for (let i = 0; i < 4; i++) if (i !== target) assert.deepEqual(deck.layers[i], before.layers[i]);
        const { config, unsupported } = deckToConfig(deck, defaultConfig());
        assert.deepEqual(unsupported, [], `${preset.name} must upload without desktop-only or unavailable actions`);
        assert(config.channels[target].keys.every(k => k.type !== ACTION_TYPE.NONE), `${preset.name} keys map to pad actions`);
      }
    }
    console.log('layerPresets: blank defaults, isolated replacements and pad mapping for every preset/layer passed');
  } finally { rmSync(dir, {recursive:true, force:true}); }
})().catch(err => { console.error(err); process.exitCode = 1; });
