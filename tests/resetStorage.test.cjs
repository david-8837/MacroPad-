const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { build } = require('esbuild'); const { pathToFileURL } = require('node:url');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-reset-storage-'));
  try {
    const out = path.join(dir, 'reset.mjs');
    await build({entryPoints:['src/utils/resetApp.ts'], bundle:true, format:'esm', platform:'node', outfile:out, logLevel:'silent'});
    const { clearAppStorage } = await import(pathToFileURL(out));
    function store(data) {
      const map = new Map(Object.entries(data));
      return { map, get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
        getItem: key => map.get(key) ?? null, setItem: (key,value) => map.set(key,value), removeItem: key => map.delete(key) };
    }
    const local = store({ kadowaz_deck:'deck', kadowaz_macros:'macros', unrelated:'keep' });
    const session = store({ kadowaz_intro_seen_v1:'1', other:'keep' });
    const rollback = clearAppStorage(local, session);
    assert.deepEqual([...local.map], [['unrelated','keep']]); assert.deepEqual([...session.map], [['other','keep']]);
    rollback(); assert.equal(local.getItem('kadowaz_deck'), 'deck'); assert.equal(session.getItem('kadowaz_intro_seen_v1'), '1');
    const remove = session.removeItem;
    session.removeItem = key => { if (key.startsWith('kadowaz_')) throw new Error('blocked'); remove(key); };
    assert.throws(() => clearAppStorage(local, session), /saved data was restored/);
    assert.equal(local.getItem('kadowaz_macros'), 'macros'); assert.equal(session.getItem('kadowaz_intro_seen_v1'), '1');
    assert.equal(local.getItem('unrelated'), 'keep');
    console.log('storage reset: scoped deletion, unrelated data preservation and rollback passed');
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
})().catch(e => { console.error(e); process.exitCode = 1; });
