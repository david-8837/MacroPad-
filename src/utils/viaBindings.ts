/* The quick tray is VIA-inspired, but MPAD3 is not QMK. A click must create an
 * action that the firmware can store, or an explicitly PC-owned M0–M15 macro.
 * This one mapping is shared by assignment and source tests; unsupported raw
 * QMK strings never turn into a plausible-looking, nonfunctional binding. */
import type { ActionDefinition, KeyBinding } from '../types';
import {
  VIA_BASIC_KEYS, VIA_LAYER_KEYS, VIA_MACRO_KEYS, VIA_MEDIA_KEYS, VIA_OLED_KEYS, VIA_SPECIAL_KEYS,
  type ViaKeycodeItem,
} from '../data/viaKeycodes';
import { chordToAction } from './deviceKeymap';

export type ViaBindingResult =
  | { binding: KeyBinding; ownership: 'device' | 'desktop' | 'clear'; description: string }
  | { error: string };

const items = [...VIA_BASIC_KEYS, ...VIA_MEDIA_KEYS, ...VIA_MACRO_KEYS, ...VIA_LAYER_KEYS, ...VIA_OLED_KEYS, ...VIA_SPECIAL_KEYS];
const allowed = new Map(items.map(item => [item.code, item]));

const BASIC_NAMES: Record<string, string> = {
  KC_ESC: 'Escape', KC_ENT: 'Enter', KC_SPC: 'Space', KC_BSPC: 'Backspace',
  KC_TAB: 'Tab', KC_CAPS: 'CapsLock',
  KC_LEFT: 'ArrowLeft', KC_RGHT: 'ArrowRight', KC_UP: 'ArrowUp', KC_DOWN: 'ArrowDown',
  KC_HOME: 'Home', KC_END: 'End', KC_PGUP: 'PageUp', KC_PGDN: 'PageDown', KC_DEL: 'Delete',
};

const MEDIA: Record<string, NonNullable<ActionDefinition['payload']['mediaAction']>> = {
  KC_MPLY: 'play_pause', KC_MNXT: 'next', KC_MPRV: 'prev', KC_MSTP: 'stop',
  KC_VOLU: 'volume_up', KC_VOLD: 'volume_down', KC_MUTE: 'mute',
};

function binding(index: number, label: string, sublabel: string, action: ActionDefinition | null): KeyBinding {
  return {
    keyIndex: index,
    label: label.slice(0, 14),
    sublabel: sublabel.slice(0, 14),
    iconName: '',
    accentColor: '#1351AA',
    tapAction: action,
    holdAction: null,
    doubleTapAction: null,
  };
}

export function viaItemToBinding(keyIndex: number, item: ViaKeycodeItem): ViaBindingResult {
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex > 8) return { error: 'Choose one of the nine switches' };
  const selected = allowed.get(item.code);
  if (!selected || selected.category !== item.category) {
    return { error: `${item.code} is not a supported MPAD3 quick assignment` };
  }
  const { code, label } = selected;
  if (code === 'KC_NO') {
    return { binding: binding(keyIndex, 'Empty', 'No action', null), ownership: 'clear',
      description: `Cleared Switch #${keyIndex + 1} in the editor (upload to clear it on the pad)` };
  }

  let action: ActionDefinition;
  let ownership: 'device' | 'desktop' = 'device';
  let sublabel = label;
  if (selected.category === 'macro') {
    const match = /^M(0|[1-9]|1[0-5])$/.exec(code);
    if (!match) return { error: `Invalid macro ${code}` };
    const macroId = Number(match[1]);
    ownership = 'desktop';
    sublabel = 'PC app required';
    action = { id: `${code}-${keyIndex}`, category: 'macro', name: `Macro ${code}`,
      payload: { macroId } };
  } else if (selected.category === 'media') {
    const mediaAction = MEDIA[code];
    if (!mediaAction) return { error: `${code} has no consumer HID usage` };
    action = { id: `${code}-${keyIndex}`, category: 'media', name: label,
      payload: { mediaAction } };
  } else if (selected.category === 'layers') {
    const match = /^CH\(([0-3])\)$/.exec(code);
    if (!match) return { error: `${code} is not a supported channel action` };
    const targetChannel = Number(match[1]);
    sublabel = 'On-pad switch';
    action = { id: `${code}-${keyIndex}`, category: 'navigation',
      name: `Switch to Layer ${targetChannel}`, payload: { targetChannel } };
  } else if (selected.category === 'oled') {
    if (code !== 'OLED_NEXT') return { error: `${code} is not a supported OLED gesture` };
    sublabel = 'On-pad step';
    action = { id: `${code}-${keyIndex}`, category: 'oled', name: 'OLED Next',
      payload: { oledStep: 'next' } };
  } else if (selected.category === 'basic') {
    const key = BASIC_NAMES[code] ?? (/^KC_([A-Z0-9])$/.exec(code)?.[1]) ??
      (/^KC_F([1-9]|1[0-2])$/.exec(code)?.[0].slice(3));
    if (!key || chordToAction([key]).kind !== 'keycode') {
      return { error: `${code} is not a supported keyboard tap` };
    }
    action = { id: `${code}-${keyIndex}`, category: 'hotkey', name: label,
      payload: { keys: [key] } };
  } else {
    return { error: `${code} has no MPAD3 action` };
  }

  return {
    binding: binding(keyIndex, label, sublabel, action), ownership,
    description: ownership === 'desktop'
      ? `Assigned ${code} to Switch #${keyIndex + 1} — PC app, saved macro and USB key events required`
      : `Assigned ${code} to Switch #${keyIndex + 1} — runs on pad after verified upload`,
  };
}
