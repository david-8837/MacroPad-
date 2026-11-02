import type { Deck } from '../types';
import { PRESET_LIBRARY_KEY, readPresetLibrary, validAction, validBinding, type PresetLibrary } from './presetLibrary';

export const BACKUP_FORMAT = 'kadowaz-macropad-backup';
export const BACKUP_MAX_BYTES = 8 * 1024 * 1024;
export interface Backup { format: typeof BACKUP_FORMAT; version: 1; deck: Deck; presetLibrary: PresetLibrary }
export interface ParsedBackup { deck: Deck; presetLibrary: PresetLibrary | null }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Strictly inspect the data before normalization or touching local storage. */
export function validDeck(value: unknown): value is Deck {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' ||
      typeof value.activeLayerId !== 'string' || !Array.isArray(value.layers) || value.layers.length !== 4) return false;
  const ids = new Set<string>();
  for (const l of value.layers) {
    if (!object(l) || typeof l.id !== 'string' || !l.id || ids.has(l.id) || typeof l.name !== 'string' ||
        typeof l.badge !== 'string' || typeof l.accentColor !== 'string' ||
        (l.isExample !== undefined && typeof l.isExample !== 'boolean') || !Array.isArray(l.keys) || l.keys.length !== 9 || !object(l.dial)) return false;
    ids.add(l.id);
    const indices = new Set<number>();
    for (const k of l.keys) {
      if (!object(k) || !Number.isInteger(k.keyIndex) || (k.keyIndex as number) < 0 || (k.keyIndex as number) > 8 ||
          indices.has(k.keyIndex as number) || !validBinding(k, k.keyIndex as number)) return false;
      indices.add(k.keyIndex as number);
    }
    const d = l.dial;
    if (typeof d.label !== 'string' || typeof d.activeModeName !== 'string' || !Array.isArray(d.availableModes) ||
        !d.availableModes.every(x => typeof x === 'string') || !['linear', 'exponential', 'precision_nudge'].includes(String(d.accelerationCurve)) ||
        !finite(d.sensitivity) || (d.channelHoldThresholdMs !== undefined && !finite(d.channelHoldThresholdMs)) ||
        !validAction(d.cwAction) || d.cwAction === null || !validAction(d.ccwAction) || d.ccwAction === null ||
        !validAction(d.pressAction) || d.pressAction === null || (d.holdAction !== undefined && (!validAction(d.holdAction) || d.holdAction === null))) return false;
  }
  return ids.has(value.activeLayerId);
}

export function makeBackup(deck: Deck, storage: Pick<Storage, 'getItem'>): Backup {
  if (!validDeck(deck)) throw new Error('The current deck could not be validated; no backup was created.');
  const result = readPresetLibrary(storage);
  if (result.error) throw new Error('Saved presets could not be read. They have not been overwritten; resolve the storage problem before backing up.');
  const backup: Backup = { format: BACKUP_FORMAT, version: 1, deck, presetLibrary: result.library };
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).length > BACKUP_MAX_BYTES) throw new Error('Backup is too large (maximum 8 MiB); no file was created.');
  return backup;
}

/** Also accepts the prior deck-only export. Legacy imports leave presets alone. */
export function parseBackup(text: string): ParsedBackup {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('Backup is too large (maximum 8 MiB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This is not valid JSON.'); }
  if (!object(value)) throw new Error('This is not a supported backup.');
  if (value.format === undefined && validDeck(value)) return { deck: value, presetLibrary: null };
  if (value.format !== BACKUP_FORMAT || value.version !== 1 || !validDeck(value.deck)) throw new Error('Backup version or deck data is invalid or unsupported.');
  const raw = JSON.stringify(value.presetLibrary);
  if (raw === undefined) throw new Error('The preset library is missing.');
  const result = readPresetLibrary({ getItem: key => key === PRESET_LIBRARY_KEY ? raw : null });
  if (result.error) throw new Error('The preset library is invalid or unsupported.');
  return { deck: value.deck, presetLibrary: result.library };
}

/** Save both pieces before updating React. Roll back if the second write fails. */
export function restoreBackup(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, backup: ParsedBackup): void {
  const deckKey = 'kadowaz_deck';
  const oldDeck = storage.getItem(deckKey);
  const oldPresets = storage.getItem(PRESET_LIBRARY_KEY);
  let presetsWritten = false;
  let deckWritten = false;
  try {
    if (backup.presetLibrary) { storage.setItem(PRESET_LIBRARY_KEY, JSON.stringify(backup.presetLibrary)); presetsWritten = true; }
    storage.setItem(deckKey, JSON.stringify(backup.deck)); deckWritten = true;
  } catch (e) {
    try {
      if (deckWritten) { if (oldDeck === null) storage.removeItem(deckKey); else storage.setItem(deckKey, oldDeck); }
      if (presetsWritten) { if (oldPresets === null) storage.removeItem(PRESET_LIBRARY_KEY); else storage.setItem(PRESET_LIBRARY_KEY, oldPresets); }
    } catch { throw new Error('Restore failed and storage rollback also failed. Check your saved data before continuing.'); }
    throw new Error(`Restore failed; previous saved data was restored. ${e instanceof Error ? e.message : ''}`);
  }
}
