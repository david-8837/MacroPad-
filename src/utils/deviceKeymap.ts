/*
 * deviceKeymap.ts — the app's key names turned into numbers the pad understands.
 *
 * The deck stores a shortcut as `['Ctrl', 'C']` because that is what a human
 * reads. The pad stores one `cfg_action_t`: a type byte, a flags byte, and a
 * 16-bit code. For a keyboard action the low byte is a USB HID usage and the high
 * byte is a HID modifier mask, which is how one slot sends Ctrl+C (see
 * firmware/src/core/actions.c, ACTION_TYPE_KEYCODE).
 *
 * Everything here is a table and a normaliser, deliberately: the moment this
 * file starts guessing, an upload starts writing bindings nobody asked for.
 * Anything it cannot express returns a reason instead of a wrong number.
 */

/** HID modifier bits, mirroring firmware/include/actions.h (MOD_*). */
export const MOD = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
} as const;

/** Consumer (media) usages, mirroring MEDIA_* in actions.h. */
export const MEDIA_CODE: Record<string, number> = {
  play_pause: 0xcd,
  stop: 0xb7,
  next: 0xb5,
  prev: 0xb6,
  volume_up: 0xe9,
  volume_down: 0xea,
  mute: 0xe2,
  brightness_up: 0x6f,
  brightness_down: 0x70,
};

/** Names that are modifiers and nothing else. */
const MODIFIER_NAMES: Record<string, number> = {
  ctrl: MOD.LCTL,
  control: MOD.LCTL,
  ctl: MOD.LCTL,
  shift: MOD.LSFT,
  alt: MOD.LALT,
  option: MOD.LALT,
  opt: MOD.LALT,
  win: MOD.LGUI,
  meta: MOD.LGUI,
  super: MOD.LGUI,
  gui: MOD.LGUI,
  cmd: MOD.LGUI,
  command: MOD.LGUI,
};

/**
 * HID keyboard usages (page 0x07). Only the keys that appear on a macropad are
 * listed; anything else is refused rather than approximated.
 */
const USAGE_NAMES: Record<string, number> = {
  // letters
  a: 0x04, b: 0x05, c: 0x06, d: 0x07, e: 0x08, f: 0x09, g: 0x0a, h: 0x0b,
  i: 0x0c, j: 0x0d, k: 0x0e, l: 0x0f, m: 0x10, n: 0x11, o: 0x12, p: 0x13,
  q: 0x14, r: 0x15, s: 0x16, t: 0x17, u: 0x18, v: 0x19, w: 0x1a, x: 0x1b,
  y: 0x1c, z: 0x1d,
  // digits (the number row)
  '0': 0x27, '1': 0x1e, '2': 0x1f, '3': 0x20, '4': 0x21,
  '5': 0x22, '6': 0x23, '7': 0x24, '8': 0x25, '9': 0x26,
  // editing
  enter: 0x28, return: 0x28, escape: 0x29, esc: 0x29, backspace: 0x2a,
  tab: 0x2b, space: 0x2c, spacebar: 0x2c, capslock: 0x39,
  // punctuation (US layout)
  '-': 0x2d, _: 0x2d, '=': 0x2e, '+': 0x2e, '[': 0x2f, '{': 0x2f,
  ']': 0x30, '}': 0x30, '\\': 0x31, '|': 0x31, ';': 0x33, ':': 0x33,
  "'": 0x34, '"': 0x34, '`': 0x35, '~': 0x35, ',': 0x36, '<': 0x36,
  '.': 0x37, '>': 0x37, '/': 0x38, '?': 0x38,
  // navigation
  printscreen: 0x46, scrolllock: 0x47, pause: 0x48, insert: 0x49, ins: 0x49,
  home: 0x4a, pageup: 0x4b, pgup: 0x4b, delete: 0x4c, del: 0x4c,
  end: 0x4d, pagedown: 0x4e, pgdn: 0x4e,
  right: 0x4f, arrowright: 0x4f, left: 0x50, arrowleft: 0x50,
  down: 0x51, arrowdown: 0x51, up: 0x52, arrowup: 0x52,
  // F-keys
  f1: 0x3a, f2: 0x3b, f3: 0x3c, f4: 0x3d, f5: 0x3e, f6: 0x3f,
  f7: 0x40, f8: 0x41, f9: 0x42, f10: 0x43, f11: 0x44, f12: 0x45,
};

/** `KeyA`, `Digit0`, `ArrowLeft`, `KC_ESC` — the spellings other code uses. */
function normalise(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^KC_/i, '')
    .replace(/^Key(?=[A-Za-z]$)/, '')
    .replace(/^Digit(?=\d$)/, '')
    .toLowerCase();
}

export function modifierMask(name: string): number | null {
  const n = normalise(name);
  return MODIFIER_NAMES[n] ?? null;
}

export function hidUsage(name: string): number | null {
  const n = normalise(name);
  if (USAGE_NAMES[n] !== undefined) return USAGE_NAMES[n];
  if (n.length === 1) {
    const lower = n.toLowerCase();
    if (USAGE_NAMES[lower] !== undefined) return USAGE_NAMES[lower];
  }
  return null;
}

export type ChordResult =
  /** One key, optionally with modifiers held: ACTION_TYPE_KEYCODE. */
  | { kind: 'keycode'; code: number; text: string }
  /** Modifiers with no key: ACTION_TYPE_MODS. */
  | { kind: 'mods'; mask: number; text: string }
  /** Cannot be expressed on the pad. `reason` goes to the user. */
  | { kind: 'unsupported'; reason: string; text: string };

/**
 * Turn `['Ctrl', 'Shift', 'C']` into a single KEYCODE code with the modifiers in
 * the high byte. Two non-modifier keys (Ctrl+C then V) is not one action and is
 * refused rather than dropped silently.
 */
export function chordToAction(keys: string[]): ChordResult {
  const text = keys.join('+');
  if (keys.length === 0) return { kind: 'unsupported', reason: 'no keys', text };

  let mods = 0;
  const plain: string[] = [];
  for (const k of keys) {
    const m = modifierMask(k);
    if (m !== null) {
      mods |= m;
      continue;
    }
    plain.push(k);
  }

  if (plain.length === 0) {
    if (mods === 0) return { kind: 'unsupported', reason: 'no keys', text };
    return { kind: 'mods', mask: mods & 0xff, text };
  }
  if (plain.length > 1) {
    return {
      kind: 'unsupported',
      reason: `${plain.length} keys in one slot — the pad sends one key per slot`,
      text,
    };
  }

  const usage = hidUsage(plain[0]);
  if (usage === null) {
    return { kind: 'unsupported', reason: `no HID usage for "${plain[0]}"`, text };
  }
  return { kind: 'keycode', code: ((mods & 0xff) << 8) | (usage & 0xff), text };
}
