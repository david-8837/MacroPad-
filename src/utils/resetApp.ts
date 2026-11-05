// Limit reset to ZERO's own storage keys. In a browser preview the origin may
// be shared with other tools, so never call localStorage.clear().
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
type Entry = { store: Store; key: string; value: string };

export function clearAppStorage(local: Store, session: Store): () => void {
  const entries: Entry[] = [];
  for (const store of [local, session]) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith('kadowaz_')) continue;
      const value = store.getItem(key);
      if (value !== null) entries.push({ store, key, value });
    }
  }
  const removed: Entry[] = [];
  const rollback = () => {
    for (const item of removed) item.store.setItem(item.key, item.value);
    removed.length = 0;
  };
  try {
    for (const item of entries) {
      item.store.removeItem(item.key);
      removed.push(item);
      if (item.store.getItem(item.key) !== null) throw new Error('Storage did not remove an item.');
    }
  } catch (error) {
    try { rollback(); }
    catch { throw new Error('Reset failed and some saved data could not be restored. Check your backup before continuing.'); }
    throw new Error(`Reset failed; saved data was restored. ${error instanceof Error ? error.message : ''}`);
  }
  return rollback;
}
