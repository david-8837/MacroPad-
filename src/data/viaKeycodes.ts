// VIA-inspired quick assignments. This pad runs custom MPAD3 firmware, not QMK:
// only actions that map to a real on-pad behavior (or explicit PC macro) live here.

export interface ViaKeycodeItem {
  code: string;
  label: string;
  sublabel?: string;
  tooltip: string;
  category: 'basic' | 'media' | 'macro' | 'layers' | 'oled' | 'special';
}

export const VIA_BASIC_KEYS: ViaKeycodeItem[] = [
  // Letters
  { code: 'KC_A', label: 'A', tooltip: 'Key A', category: 'basic' },
  { code: 'KC_B', label: 'B', tooltip: 'Key B', category: 'basic' },
  { code: 'KC_C', label: 'C', tooltip: 'Key C', category: 'basic' },
  { code: 'KC_D', label: 'D', tooltip: 'Key D', category: 'basic' },
  { code: 'KC_E', label: 'E', tooltip: 'Key E', category: 'basic' },
  { code: 'KC_F', label: 'F', tooltip: 'Key F', category: 'basic' },
  { code: 'KC_G', label: 'G', tooltip: 'Key G', category: 'basic' },
  { code: 'KC_H', label: 'H', tooltip: 'Key H', category: 'basic' },
  { code: 'KC_I', label: 'I', tooltip: 'Key I', category: 'basic' },
  { code: 'KC_J', label: 'J', tooltip: 'Key J', category: 'basic' },
  { code: 'KC_K', label: 'K', tooltip: 'Key K', category: 'basic' },
  { code: 'KC_L', label: 'L', tooltip: 'Key L', category: 'basic' },
  { code: 'KC_M', label: 'M', tooltip: 'Key M', category: 'basic' },
  { code: 'KC_N', label: 'N', tooltip: 'Key N', category: 'basic' },
  { code: 'KC_O', label: 'O', tooltip: 'Key O', category: 'basic' },
  { code: 'KC_P', label: 'P', tooltip: 'Key P', category: 'basic' },
  { code: 'KC_Q', label: 'Q', tooltip: 'Key Q', category: 'basic' },
  { code: 'KC_R', label: 'R', tooltip: 'Key R', category: 'basic' },
  { code: 'KC_S', label: 'S', tooltip: 'Key S', category: 'basic' },
  { code: 'KC_T', label: 'T', tooltip: 'Key T', category: 'basic' },
  { code: 'KC_U', label: 'U', tooltip: 'Key U', category: 'basic' },
  { code: 'KC_V', label: 'V', tooltip: 'Key V', category: 'basic' },
  { code: 'KC_W', label: 'W', tooltip: 'Key W', category: 'basic' },
  { code: 'KC_X', label: 'X', tooltip: 'Key X', category: 'basic' },
  { code: 'KC_Y', label: 'Y', tooltip: 'Key Y', category: 'basic' },
  { code: 'KC_Z', label: 'Z', tooltip: 'Key Z', category: 'basic' },
  
  // Digits
  { code: 'KC_1', label: '1', sublabel: '!', tooltip: 'Digit 1 and Exclamation', category: 'basic' },
  { code: 'KC_2', label: '2', sublabel: '@', tooltip: 'Digit 2 and At', category: 'basic' },
  { code: 'KC_3', label: '3', sublabel: '#', tooltip: 'Digit 3 and Hash', category: 'basic' },
  { code: 'KC_4', label: '4', sublabel: '$', tooltip: 'Digit 4 and Dollar', category: 'basic' },
  { code: 'KC_5', label: '5', sublabel: '%', tooltip: 'Digit 5 and Percent', category: 'basic' },
  { code: 'KC_6', label: '6', sublabel: '^', tooltip: 'Digit 6 and Caret', category: 'basic' },
  { code: 'KC_7', label: '7', sublabel: '&', tooltip: 'Digit 7 and Ampersand', category: 'basic' },
  { code: 'KC_8', label: '8', sublabel: '*', tooltip: 'Digit 8 and Asterisk', category: 'basic' },
  { code: 'KC_9', label: '9', sublabel: '(', tooltip: 'Digit 9 and Parenthesis', category: 'basic' },
  { code: 'KC_0', label: '0', sublabel: ')', tooltip: 'Digit 0 and Close Parenthesis', category: 'basic' },

  // Standard tap keys. Bare modifiers are NOT listed: the firmware's one-slot
  // TAP sends a modifier pulse, not a QMK-style held Ctrl/Shift key.
  { code: 'KC_ESC', label: 'Esc', tooltip: 'Escape', category: 'basic' },
  { code: 'KC_ENT', label: 'Enter', tooltip: 'Return / Enter', category: 'basic' },
  { code: 'KC_SPC', label: 'Space', tooltip: 'Spacebar', category: 'basic' },
  { code: 'KC_BSPC', label: 'Backspace', tooltip: 'Backspace', category: 'basic' },
  { code: 'KC_TAB', label: 'Tab', tooltip: 'Tabulator', category: 'basic' },
  { code: 'KC_CAPS', label: 'Caps', tooltip: 'Caps Lock', category: 'basic' },

  // Navigation
  { code: 'KC_LEFT', label: '←', tooltip: 'Left Arrow', category: 'basic' },
  { code: 'KC_UP', label: '↑', tooltip: 'Up Arrow', category: 'basic' },
  { code: 'KC_DOWN', label: '↓', tooltip: 'Down Arrow', category: 'basic' },
  { code: 'KC_RGHT', label: '→', tooltip: 'Right Arrow', category: 'basic' },
  { code: 'KC_HOME', label: 'Home', tooltip: 'Home', category: 'basic' },
  { code: 'KC_END', label: 'End', tooltip: 'End', category: 'basic' },
  { code: 'KC_PGUP', label: 'PgUp', tooltip: 'Page Up', category: 'basic' },
  { code: 'KC_PGDN', label: 'PgDn', tooltip: 'Page Down', category: 'basic' },
  { code: 'KC_DEL', label: 'Delete', tooltip: 'Delete', category: 'basic' },

  // Function Keys
  { code: 'KC_F1', label: 'F1', tooltip: 'Function 1', category: 'basic' },
  { code: 'KC_F2', label: 'F2', tooltip: 'Function 2', category: 'basic' },
  { code: 'KC_F3', label: 'F3', tooltip: 'Function 3', category: 'basic' },
  { code: 'KC_F4', label: 'F4', tooltip: 'Function 4', category: 'basic' },
  { code: 'KC_F5', label: 'F5', tooltip: 'Function 5', category: 'basic' },
  { code: 'KC_F6', label: 'F6', tooltip: 'Function 6', category: 'basic' },
  { code: 'KC_F7', label: 'F7', tooltip: 'Function 7', category: 'basic' },
  { code: 'KC_F8', label: 'F8', tooltip: 'Function 8', category: 'basic' },
  { code: 'KC_F9', label: 'F9', tooltip: 'Function 9', category: 'basic' },
  { code: 'KC_F10', label: 'F10', tooltip: 'Function 10', category: 'basic' },
  { code: 'KC_F11', label: 'F11', tooltip: 'Function 11', category: 'basic' },
  { code: 'KC_F12', label: 'F12', tooltip: 'Function 12', category: 'basic' },
];

export const VIA_MEDIA_KEYS: ViaKeycodeItem[] = [
  { code: 'KC_MPLY', label: 'Play/Pause', tooltip: 'On-pad consumer HID: play/pause', category: 'media' },
  { code: 'KC_MNXT', label: 'Next Track', tooltip: 'On-pad consumer HID: next track', category: 'media' },
  { code: 'KC_MPRV', label: 'Prev Track', tooltip: 'On-pad consumer HID: previous track', category: 'media' },
  { code: 'KC_MSTP', label: 'Stop', tooltip: 'On-pad consumer HID: stop', category: 'media' },
  { code: 'KC_VOLU', label: 'Vol +', tooltip: 'On-pad consumer HID: volume up', category: 'media' },
  { code: 'KC_VOLD', label: 'Vol -', tooltip: 'On-pad consumer HID: volume down', category: 'media' },
  { code: 'KC_MUTE', label: 'Mute', tooltip: 'On-pad consumer HID: mute', category: 'media' },
];

export const VIA_MACRO_KEYS: ViaKeycodeItem[] = Array.from({ length: 16 }, (_, i) => ({
  code: `M${i}`,
  label: `M${i}`,
  tooltip: `PC only: run saved M${i} in the desktop app with pad USB key events enabled`,
  category: 'macro',
}));

/* These are MPAD3 CHANNEL actions, NOT QMK MO/TG/TO/DF semantics. The pad
 * changes channel on a key tap after a verified upload; a UI preview click does
 * not remotely switch the pad. */
export const VIA_LAYER_KEYS: ViaKeycodeItem[] = Array.from({ length: 4 }, (_, ch) => ({
  code: `CH(${ch})`,
  label: `Layer ${ch}`,
  tooltip: `On-pad switch to Layer ${ch} after upload (not momentary, not an editor click)`,
  category: 'layers',
}));

/* A manual, on-pad playlist step. Firmware dispatches ACTION_TYPE_OLED_NEXT
 * on press; it does not require the desktop app or USB key-event streaming. */
export const VIA_OLED_KEYS: ViaKeycodeItem[] = [
  { code: 'OLED_NEXT', label: 'OLED Next', tooltip: 'On-pad: advance to the next enabled OLED screen after upload', category: 'oled' },
];

/* Clearing a binding really uploads an empty slot; transparent fallthrough,
 * bootloader/reset and mouse keys are NOT implemented by this firmware tray. */
export const VIA_SPECIAL_KEYS: ViaKeycodeItem[] = [
  { code: 'KC_NO', label: 'Clear', tooltip: 'Remove this binding (no action on pad or PC)', category: 'special' },
];
