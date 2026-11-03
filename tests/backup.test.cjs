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
      x => x.deck.layers[0].keys[0].tapAction = {id:'m', name:'macro', category:'macro', payload:{macroId:16}},
      x => x.extras.macros = [{id:0,name:'bad',actions:[{id:'x',type:'exec',value:'calc'}]}],
      x => x.extras.oled = {mode:'bad'},
      x => x.extras.lighting = {version:1, channels:[]},
      x => x.deck.layers[0].dial.sensitivity = 'bad',
      x => x.presetLibrary.custom[0].keys.pop(),
      x => x.deck.activeLayerId = 'missing',
    ]) { const broken = structuredClone(exported); mutate(broken); assert.throws(() => m.parseBackup(JSON.stringify(broken))); }
    const macros = [{ id: 0, name: 'Example', actions: [{id:'one',type:'text',value:'hello'}, {id:'two',type:'combo',value:'Enter',keys:['Enter']}] }];
    const oled = {mode:'kadowaz',customTitle:'Hello',customSubtitle:'World',brightness:42,inverted:true,autoCycleS:30,playlist:['kadowaz']};
    const lightChannel = {mode:1,brightness:100,speed:80,r:1,g:2,b:3,perKey:Array.from({length:9}, () => [0,0,0]),perKeyMask:0};
    const lighting = {version:1,channels:Array.from({length:4}, () => structuredClone(lightChannel))};
    storage.setItem('kadowaz_macros_v2', JSON.stringify(macros)); storage.setItem('kadowaz_oled', JSON.stringify(oled)); storage.setItem('kadowaz_lighting', JSON.stringify(lighting));
    const macroDeck = structuredClone(deck); macroDeck.layers[0].keys[0].tapAction = {id:'m',name:'macro',category:'macro',payload:{macroId:0}};
    macroDeck.layers[0].keys[1].tapAction = {id:'old',name:'legacy macro',category:'script',payload:{command:'macro:M0'}};
    const extended = m.makeBackup(macroDeck, storage); const extendedParsed = m.parseBackup(JSON.stringify(extended));
    assert.deepEqual(extendedParsed.extras, {macros,oled,lighting}); assert.deepEqual(extendedParsed.deck, macroDeck);
    const legacyV1 = {format: m.BACKUP_FORMAT, version:1, deck, presetLibrary:exported.presetLibrary};
    assert.deepEqual(m.parseBackup(JSON.stringify(legacyV1)), {deck,presetLibrary:exported.presetLibrary});
    m.restoreBackup(storage, m.parseBackup(JSON.stringify(legacyV1)));
    assert.deepEqual(JSON.parse(storage.getItem('kadowaz_macros_v2')), macros);
    assert.deepEqual(JSON.parse(storage.getItem('kadowaz_oled')), oled);
    assert.deepEqual(JSON.parse(storage.getItem('kadowaz_lighting')), lighting);
    const unsafeV1 = {...legacyV1, deck:macroDeck}; assert.throws(() => m.parseBackup(JSON.stringify(unsafeV1)));
    const unsafe = structuredClone(macroDeck); unsafe.layers[0].keys[0].tapAction = {id:'x',name:'bad',category:'script',payload:{command:'calc.exe'}};
    assert.throws(() => m.makeBackup(unsafe, storage), /script/);
    storage.setItem('kadowaz_macros_v2', '{broken'); assert.throws(() => m.makeBackup(deck, storage), /macros/i); assert.equal(storage.getItem('kadowaz_macros_v2'), '{broken');
    storage.setItem('kadowaz_macros_v2', 'null'); assert.throws(() => m.makeBackup(deck, storage), /macros/i); assert.equal(storage.getItem('kadowaz_macros_v2'), 'null');
    storage.setItem('kadowaz_macros_v2', JSON.stringify(macros));
    // Fail each write in turn and ensure all earlier writes are rolled back.
    for (let failAt = 0; failAt < 5; failAt++) {
      const old = new Map([['kadowaz_deck','old'], [m.PRESET_LIBRARY_KEY,'old-preset'], ['kadowaz_macros_v2','old-macro'], ['kadowaz_oled','old-oled'], ['kadowaz_lighting','old-light']]);
      let count = 0; const brokenStore = { getItem: k => old.get(k) ?? null, setItem(k,v) { if (count++ === failAt) throw Error('quota'); old.set(k,v); }, removeItem(k) { if (count++ === failAt) throw Error('quota'); old.delete(k); } };
      assert.throws(() => m.restoreBackup(brokenStore, extendedParsed), /previous saved data was restored/);
      assert.deepEqual([...old.entries()], [['kadowaz_deck','old'], [m.PRESET_LIBRARY_KEY,'old-preset'], ['kadowaz_macros_v2','old-macro'], ['kadowaz_oled','old-oled'], ['kadowaz_lighting','old-light']]);
    }
    m.restoreBackup(storage, extendedParsed); assert.deepEqual(JSON.parse(storage.getItem('kadowaz_macros_v2')),macros); assert.deepEqual(JSON.parse(storage.getItem('kadowaz_oled')),oled); assert.deepEqual(JSON.parse(storage.getItem('kadowaz_lighting')),lighting);
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
