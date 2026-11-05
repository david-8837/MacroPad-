import type { Deck } from '../types';
import { MACRO_STORAGE_KEY, validMacroLibrary, type StoredMacro } from './macroStorage';
import { isOLEDMode } from '../oled/modes';
import { capacityFor } from '../oled/capacity';
import type { LightingConfig } from '../lighting/engine';
import { PRESET_LIBRARY_KEY, readPresetLibrary, validAction, validBinding, type PresetLibrary } from './presetLibrary';

export const BACKUP_FORMAT = 'kadowaz-macropad-backup';
export const BACKUP_MAX_BYTES = 8 * 1024 * 1024;
export const OLED_STORAGE_KEY = 'kadowaz_oled';
export const LIGHTING_STORAGE_KEY = 'kadowaz_lighting';
interface OledPrefs { mode?: string; customTitle?: string; customSubtitle?: string; brightness?: number; inverted?: boolean; autoCycleS?: number; playlist?: string[] }
interface LightingBackup { version: 1; channels: LightingConfig[] }
export interface BackupExtras { macros: StoredMacro[]; oled: OledPrefs | null; lighting: LightingBackup | null }
export interface Backup { format: typeof BACKUP_FORMAT; version: 2; deck: Deck; presetLibrary: PresetLibrary; extras: BackupExtras }
export interface ParsedBackup { deck: Deck; presetLibrary: PresetLibrary | null; extras?: BackupExtras }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Strictly inspect the data before normalization or touching local storage. */
export function validDeck(value: unknown, local = false, allowMacroReferences = false): value is Deck {
  if (!object(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' ||
      typeof value.activeLayerId !== 'string' || !Array.isArray(value.layers) || (local ? (value.layers.length < 1 || value.layers.length > 4) : value.layers.length !== 4)) return false;
  const ids = new Set<string>();
  for (const l of value.layers) {
    if (!object(l) || typeof l.id !== 'string' || !l.id || ids.has(l.id) || typeof l.name !== 'string' ||
        typeof l.badge !== 'string' || typeof l.accentColor !== 'string' ||
        (l.isExample !== undefined && typeof l.isExample !== 'boolean') || !Array.isArray(l.keys) || l.keys.length !== 9 || !object(l.dial)) return false;
    ids.add(l.id);
    const indices = new Set<number>();
    for (const [position, k] of l.keys.entries()) {
      // The editor indexes keys by array position, so accepting a shuffled
      // array would display/edit one binding while uploading another.
      if (!object(k) || k.keyIndex !== position || !Number.isInteger(k.keyIndex) ||
          indices.has(k.keyIndex as number) || !validBinding(k, position, local, allowMacroReferences)) return false;
      indices.add(k.keyIndex as number);
    }
    const d = l.dial;
    if (typeof d.label !== 'string' || typeof d.activeModeName !== 'string' || !Array.isArray(d.availableModes) ||
        !d.availableModes.every(x => typeof x === 'string') || !['linear', 'exponential', 'precision_nudge'].includes(String(d.accelerationCurve)) ||
        !finite(d.sensitivity) || (d.channelHoldThresholdMs !== undefined && !finite(d.channelHoldThresholdMs)) ||
        !validAction(d.cwAction, local, allowMacroReferences) || d.cwAction === null || !validAction(d.ccwAction, local, allowMacroReferences) || d.ccwAction === null ||
        !validAction(d.pressAction, local, allowMacroReferences) || d.pressAction === null || (d.holdAction !== undefined && (!validAction(d.holdAction, local, allowMacroReferences) || d.holdAction === null))) return false;
  }
  return local || ids.has(value.activeLayerId);
}

export function validOled(value: unknown): value is OledPrefs | null {
  if (value === null) return true;
  if (!object(value)) return false;
  for (const key of ['customTitle', 'customSubtitle']) if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  if (value.mode !== undefined && !isOLEDMode(value.mode)) return false;
  if (value.brightness !== undefined && (!finite(value.brightness) || (value.brightness as number) < 0 || (value.brightness as number) > 100)) return false;
  if (value.inverted !== undefined && typeof value.inverted !== 'boolean') return false;
  if (value.autoCycleS !== undefined && (!Number.isInteger(value.autoCycleS) || (value.autoCycleS as number) < 0 || (value.autoCycleS as number) > 255 || (value.autoCycleS as number) > 0 && (value.autoCycleS as number) < 3)) return false;
  if (value.playlist !== undefined && (!Array.isArray(value.playlist) || value.playlist.length === 0 || !value.playlist.every(isOLEDMode) || new Set(value.playlist).size !== value.playlist.length || !capacityFor(value.playlist).fits)) return false;
  return true;
}

export function validLighting(value: unknown): value is LightingBackup | null {
  if (value === null) return true;
  if (!object(value) || value.version !== 1 || !Array.isArray(value.channels) || value.channels.length !== 4) return false;
  const byte = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 255;
  return value.channels.every(c => object(c) && byte(c.mode) && (c.mode as number) <= 7 &&
    ['brightness', 'speed', 'r', 'g', 'b'].every(key => byte(c[key])) &&
    Number.isInteger(c.perKeyMask) && (c.perKeyMask as number) >= 0 && (c.perKeyMask as number) <= 511 &&
    Array.isArray(c.perKey) && c.perKey.length === 9 && c.perKey.every((rgb: unknown) => Array.isArray(rgb) && rgb.length === 3 && rgb.every(byte)) &&
    c.perKey.reduce((mask: number, rgb: number[], i: number) => mask | (rgb.some(n => n !== 0) ? 1 << i : 0), 0) === c.perKeyMask);
}

function readStoredJson(storage: Pick<Storage, 'getItem'>, key: string, label: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null) throw new Error('Invalid stored value');
    return parsed;
  } catch { throw new Error(`Saved ${label} could not be read; no backup was created. The original data has not been overwritten.`); }
}

export function makeBackup(deck: Deck, storage: Pick<Storage, 'getItem'>): Backup {
  if (!validDeck(deck, false, true)) throw new Error('The current deck cannot be backed up: check for invalid or unsupported executable script actions.');
  const result = readPresetLibrary(storage);
  if (result.error) throw new Error('Saved presets could not be read. They have not been overwritten; resolve the storage problem before backing up.');
  const macros = readStoredJson(storage, MACRO_STORAGE_KEY, 'macros') ?? [];
  const oled = readStoredJson(storage, OLED_STORAGE_KEY, 'screen settings');
  const lighting = readStoredJson(storage, LIGHTING_STORAGE_KEY, 'lighting settings');
  if (!validMacroLibrary(macros) || !validOled(oled) || !validLighting(lighting)) throw new Error('Saved macros, screen or lighting settings are invalid; no backup was created. The original data has not been overwritten.');
  const backup: Backup = { format: BACKUP_FORMAT, version: 2, deck, presetLibrary: result.library, extras: { macros, oled, lighting } };
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).length > BACKUP_MAX_BYTES) throw new Error('Backup is too large (maximum 8 MiB); no file was created.');
  return backup;
}

/** Version 1 and older deck-only imports leave newer settings unchanged. */
export function parseBackup(text: string): ParsedBackup {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES) throw new Error('Backup is too large (maximum 8 MiB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This is not valid JSON.'); }
  if (!object(value)) throw new Error('This is not a supported backup.');
  if (value.format === undefined && validDeck(value)) return { deck: value, presetLibrary: null };
  if (value.format !== BACKUP_FORMAT || (value.version !== 1 && value.version !== 2) || !validDeck(value.deck, false, value.version === 2)) throw new Error('Backup version or deck data is invalid or unsupported.');
  const raw = JSON.stringify(value.presetLibrary);
  if (raw === undefined) throw new Error('The preset library is missing.');
  const result = readPresetLibrary({ getItem: key => key === PRESET_LIBRARY_KEY ? raw : null });
  if (result.error) throw new Error('The preset library is invalid or unsupported.');
  if (value.version === 1) return { deck: value.deck, presetLibrary: result.library };
  const extras = value.extras;
  if (!object(extras) || !validMacroLibrary(extras.macros) || !('oled' in extras) || !validOled(extras.oled) || !('lighting' in extras) || !validLighting(extras.lighting)) throw new Error('Backup macros, screen or lighting settings are invalid or unsupported.');
  return { deck: value.deck, presetLibrary: result.library, extras: extras as unknown as BackupExtras };
}

/** Store everything as one logical transaction; reverse prior writes on error. */
export function restoreBackup(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, backup: ParsedBackup): void {
  const writes: [string, string | null][] = [];
  if (backup.presetLibrary) writes.push([PRESET_LIBRARY_KEY, JSON.stringify(backup.presetLibrary)]);
  if (backup.extras) writes.push(
    [MACRO_STORAGE_KEY, JSON.stringify(backup.extras.macros)],
    [OLED_STORAGE_KEY, backup.extras.oled === null ? null : JSON.stringify(backup.extras.oled)],
    [LIGHTING_STORAGE_KEY, backup.extras.lighting === null ? null : JSON.stringify(backup.extras.lighting)],
  );
  writes.push(['kadowaz_deck', JSON.stringify(backup.deck)]);
  const previous = writes.map(([key]) => [key, storage.getItem(key)] as const);
  let written = 0;
  try {
    for (const [key, value] of writes) { if (value === null) storage.removeItem(key); else storage.setItem(key, value); written++; }
  } catch (e) {
    try {
      for (let i = written - 1; i >= 0; i--) {
        const [key, value] = previous[i];
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      }
    } catch { throw new Error('Restore failed and storage rollback also failed. Check your saved data before continuing.'); }
    throw new Error(`Restore failed; previous saved data was restored. ${e instanceof Error ? e.message : ''}`);
  }
}
