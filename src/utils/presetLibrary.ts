import { KeyBinding, ActionDefinition } from '../types';
import { LAYER_PRESETS, LayerPreset, PresetKey } from '../data/layerPresets';

export const PRESET_LIBRARY_KEY = 'kadowaz_preset_library_v1';
export interface PresetLibrary { version: 1; overrides: Record<string, LayerPreset>; custom: LayerPreset[] }
const emptyLibrary = (): PresetLibrary => ({ version: 1, overrides: {}, custom: [] });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function keyToBinding(key: PresetKey, index: number): KeyBinding {
  return key.binding ? { ...clone(key.binding), keyIndex: index } : {
    keyIndex: index, label: key.label, sublabel: key.detail, iconName: key.icon, accentColor: '#1351AA',
    tapAction: key.action ? clone(key.action) : null, holdAction: null, doubleTapAction: null,
  };
}

export function bindingToKey(binding: KeyBinding): PresetKey {
  const copy = clone(binding);
  return { label: copy.label || 'Empty', detail: copy.sublabel || (copy.tapAction ? copy.tapAction.name : 'Unassigned'),
    icon: copy.iconName || '', action: copy.tapAction, binding: copy };
}

export function createPreset(id: string): LayerPreset {
  return { id, name: '', group: 'Custom', description: '', note: 'Your custom preset', keys: Array.from({ length: 9 }, (_, keyIndex) =>
    bindingToKey({ keyIndex, label: 'Empty', sublabel: 'Unassigned', iconName: '', accentColor: '#1351AA',
      tapAction: null, holdAction: null, doubleTapAction: null })) };
}

export function newPresetId(): string {
  // crypto.randomUUID is not available in every embedded browser context.
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `custom-${random}`;
}

const categories = new Set(['hotkey', 'media', 'audio_session', 'midi', 'script', 'macro', 'text', 'navigation', 'oled', 'app_launch']);
function validAction(value: unknown): value is ActionDefinition | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.category !== 'string' || !categories.has(a.category) || !a.payload || typeof a.payload !== 'object' || Array.isArray(a.payload)) return false;
  if ((a.description !== undefined && typeof a.description !== 'string') || (a.icon !== undefined && typeof a.icon !== 'string')) return false;
  const payload = a.payload as Record<string, unknown>;
  const keys = payload.keys;
  if (keys !== undefined && (!Array.isArray(keys) || !keys.every(k => typeof k === 'string'))) return false;
  for (const field of ['keycode', 'oledStep', 'mediaAction', 'processName', 'midiType', 'shellType', 'command', 'text', 'targetLayerId', 'appId', 'appName', 'exePath', 'launchArgs', 'iconDataUrl', 'targetType', 'source']) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') return false;
  }
  for (const field of ['macroId', 'targetChannel', 'audioDelta', 'midiChannel', 'midiNote', 'midiCC', 'midiValue']) {
    if (payload[field] !== undefined && (typeof payload[field] !== 'number' || !Number.isFinite(payload[field]))) return false;
  }
  for (const field of ['toggleMute', 'focusExisting', 'launchMinimized']) {
    if (payload[field] !== undefined && typeof payload[field] !== 'boolean') return false;
  }
  return true;
}
function validBinding(value: unknown, index: number): value is KeyBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const b = value as Record<string, unknown>;
  return b.keyIndex === index && typeof b.label === 'string' && typeof b.iconName === 'string' &&
    (b.sublabel === undefined || typeof b.sublabel === 'string') && (b.accentColor === undefined || typeof b.accentColor === 'string') &&
    (b.isDestructiveSafety === undefined || typeof b.isDestructiveSafety === 'boolean') &&
    (b.longPressThresholdMs === undefined || (typeof b.longPressThresholdMs === 'number' && Number.isFinite(b.longPressThresholdMs))) && validAction(b.tapAction) && validAction(b.holdAction) && validAction(b.doubleTapAction) &&
    (b.safetyConfirmAction === undefined || validAction(b.safetyConfirmAction));
}
function validPreset(value: unknown): value is LayerPreset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 ||
      typeof p.description !== 'string' || p.description.length > 200 || typeof p.note !== 'string' || p.note.length > 200 ||
      typeof p.group !== 'string' || !['General','Design','Video','Audio','Coding','Office','Games','Custom'].includes(p.group) ||
      (p.iconId !== undefined && typeof p.iconId !== 'string') || !Array.isArray(p.keys) || p.keys.length !== 9) return false;
  return p.keys.every((key, index) => {
    if (!key || typeof key !== 'object' || Array.isArray(key)) return false;
    const k = key as Record<string, unknown>;
    return typeof k.label === 'string' && typeof k.detail === 'string' && typeof k.icon === 'string' &&
      validAction(k.action) && (k.binding === undefined || validBinding(k.binding, index));
  });
}

/** Never overwrite corrupt data automatically; the caller can display an error. */
export function readPresetLibrary(storage: Pick<Storage, 'getItem'>): { library: PresetLibrary; error: string | null } {
  try {
    const raw = storage.getItem(PRESET_LIBRARY_KEY);
    if (!raw) return { library: emptyLibrary(), error: null };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid library');
    const v = value as Record<string, unknown>;
    if (v.version !== 1 || !v.overrides || typeof v.overrides !== 'object' || Array.isArray(v.overrides) || !Array.isArray(v.custom)) throw new Error('invalid library');
    const originals = new Map(LAYER_PRESETS.map(p => [p.id, p]));
    for (const [id, preset] of Object.entries(v.overrides)) {
      const original = originals.get(id);
      if (!original || !validPreset(preset) || preset.id !== id || preset.group !== original.group) throw new Error('invalid override');
    }
    const ids = new Set<string>();
    for (const p of v.custom) {
      if (!validPreset(p) || p.group !== 'Custom' || !p.id.startsWith('custom-') || ids.has(p.id)) throw new Error('invalid custom preset');
      ids.add(p.id);
    }
    return { library: value as PresetLibrary, error: null };
  } catch {
    return { library: emptyLibrary(), error: 'Could not read saved presets. They have not been overwritten; resolve the storage problem before saving.' };
  }
}

export function writePresetLibrary(storage: Pick<Storage, 'setItem'>, library: PresetLibrary): void {
  storage.setItem(PRESET_LIBRARY_KEY, JSON.stringify(library));
}
export function allPresets(library: PresetLibrary): LayerPreset[] {
  return [...LAYER_PRESETS.map(p => library.overrides[p.id] || p), ...library.custom];
}
export function savePreset(library: PresetLibrary, preset: LayerPreset): PresetLibrary {
  const copy = clone(preset);
  if (copy.group === 'Custom') return { ...library, custom: library.custom.some(p => p.id === copy.id) ? library.custom.map(p => p.id === copy.id ? copy : p) : [...library.custom, copy] };
  return { ...library, overrides: { ...library.overrides, [copy.id]: copy } };
}
export function removePreset(library: PresetLibrary, id: string): PresetLibrary {
  if (id.startsWith('custom-')) return { ...library, custom: library.custom.filter(p => p.id !== id) };
  const overrides = { ...library.overrides }; delete overrides[id];
  return { ...library, overrides };
}
