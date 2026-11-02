const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { build } = require('esbuild');
const { pathToFileURL } = require('node:url');
(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
  try {
    const root = resolve(__dirname, '..').replace(/\\/g, '/');
    const entry = join(dir, 'entry.mjs');
    writeFileSync(entry, `export * from '${root}/src/utils/backup.ts';\nexport * from '${root}/src/utils/presetLibrary.ts';\nexport { defaultDeck } from '${root}/src/data/defaultDeck.ts';`);
    const output = join(dir, 'out.mjs');
    await build({entryPoints:[entry], bundle:true, format:'esm', platform:'node', outfile:output, logLevel:'silent'});
    const m = await import(pathToFileURL(output).href);
    const values = new Map();
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
    const deck = structuredClone(m.defaultDeck);
    deck.layers[1].keys[2].tapAction = {id:'x',name:'Copy',category:'hotkey',payload:{keys:['Ctrl','C']}};
    const custom = m.createPreset('custom-abc'); custom.name = 'Mine';
    storage.setItem(m.PRESET_LIBRARY_KEY, JSON.stringify(m.savePreset(m.readPresetLibrary(storage).library, custom)));
    const originalLibrary = storage.getItem(m.PRESET_LIBRARY_KEY);
    const exported = m.makeBackup(deck, storage);
    const parsed = m.parseBackup(JSON.stringify(exported));
    assert.deepEqual(parsed.deck, deck); assert.equal(parsed.presetLibrary.custom[0].name, 'Mine');
    assert.deepEqual(m.parseBackup(JSON.stringify(deck)), {deck, presetLibrary:null});
    assert.throws(() => m.parseBackup('{broken'), /JSON/);
    for (const mutate of [
      x => x.version = 9,
      x => x.deck.layers.pop(),
      x => x.deck.layers[0].keys[0].keyIndex = 9,
      x => x.deck.layers[0].keys[0].tapAction = {id:2},
      x => x.deck.layers[0].keys[0].tapAction = {id:'e', name:'calc', category:'script', payload:{command:'calc.exe'}},
      x => x.deck.layers[0].keys[0].tapAction = {id:'m', name:'macro', category:'macro', payload:{macroId:0}},
      x => x.deck.layers[0].dial.sensitivity = 'bad',
      x => x.presetLibrary.custom[0].keys.pop(),
      x => x.deck.activeLayerId = 'missing',
    ]) { const broken = structuredClone(exported); mutate(broken); assert.throws(() => m.parseBackup(JSON.stringify(broken))); }
    assert.throws(() => m.parseBackup(' '.repeat(m.BACKUP_MAX_BYTES + 1)), /large/);
    storage.setItem(m.PRESET_LIBRARY_KEY, 'not-json');
    assert.throws(() => m.makeBackup(deck, storage), /presets/i); assert.equal(storage.getItem(m.PRESET_LIBRARY_KEY), 'not-json');
    storage.setItem(m.PRESET_LIBRARY_KEY, originalLibrary);
    storage.setItem('kadowaz_deck', 'old deck');
    const legacy = m.parseBackup(JSON.stringify(deck)); m.restoreBackup(storage, legacy);
    assert.equal(storage.getItem(m.PRESET_LIBRARY_KEY), originalLibrary, 'legacy import preserves library');
    storage.setItem('kadowaz_deck','old deck');
    const priorLibrary = JSON.stringify({version: 1, overrides: {}, custom: []});
    storage.setItem(m.PRESET_LIBRARY_KEY, priorLibrary);
    let failed = false;
    const failing = {...storage, setItem(k,v) { if (k === 'kadowaz_deck' && !failed) { failed = true; throw new Error('quota'); } storage.setItem(k,v); }};
    assert.throws(() => m.restoreBackup(failing, parsed), /previous saved data was restored/);
    assert.equal(storage.getItem('kadowaz_deck'),'old deck'); assert.equal(storage.getItem(m.PRESET_LIBRARY_KEY), priorLibrary);
    m.restoreBackup(storage, parsed); assert.deepEqual(JSON.parse(storage.getItem('kadowaz_deck')), deck);
    console.log('backup: round trip, legacy import, validation, corrupt data and rollback passed');
  } finally { rmSync(dir,{recursive:true,force:true}); }
})().catch(e => { console.error(e); process.exitCode = 1; });
