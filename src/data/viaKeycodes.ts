// VIA Keycode Definitions and Categories (QMK / VIA v2 & v3 compatible)

export interface ViaKeycodeItem {
  code: string;
  label: string;
  sublabel?: string;
  tooltip: string;
  category: 'basic' | 'media' | 'macro' | 'layers' | 'special';
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

  // Control & Modifiers
  { code: 'KC_ESC', label: 'Esc', tooltip: 'Escape', category: 'basic' },
  { code: 'KC_ENT', label: 'Enter', tooltip: 'Return / Enter', category: 'basic' },
  { code: 'KC_SPC', label: 'Space', tooltip: 'Spacebar', category: 'basic' },
  { code: 'KC_BSPC', label: 'Backspace', tooltip: 'Backspace', category: 'basic' },
  { code: 'KC_TAB', label: 'Tab', tooltip: 'Tabulator', category: 'basic' },
  { code: 'KC_LCTL', label: 'Ctrl', tooltip: 'Left Control', category: 'basic' },
  { code: 'KC_LSFT', label: 'Shift', tooltip: 'Left Shift', category: 'basic' },
  { code: 'KC_LALT', label: 'Alt', tooltip: 'Left Alt', category: 'basic' },
  { code: 'KC_LGUI', label: 'Win', tooltip: 'Left GUI / Windows key', category: 'basic' },
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
  { code: 'KC_MPLY', label: 'Play/Pause', tooltip: 'Toggle Media Play/Pause', category: 'media' },
  { code: 'KC_MNXT', label: 'Next Track', tooltip: 'Next Audio Track', category: 'media' },
  { code: 'KC_MPRV', label: 'Prev Track', tooltip: 'Previous Audio Track', category: 'media' },
  { code: 'KC_MSTP', label: 'Stop', tooltip: 'Stop Media Playback', category: 'media' },
  { code: 'KC_VOLU', label: 'Vol +', tooltip: 'Volume Up', category: 'media' },
  { code: 'KC_VOLD', label: 'Vol -', tooltip: 'Volume Down', category: 'media' },
  { code: 'KC_MUTE', label: 'Mute', tooltip: 'Mute Audio Output', category: 'media' },
  { code: 'KC_CALC', label: 'Calc', tooltip: 'Launch Calculator', category: 'media' },
  { code: 'KC_MYCM', label: 'My PC', tooltip: 'Open File Explorer / This PC', category: 'media' },
  { code: 'KC_MAIL', label: 'Email', tooltip: 'Open Default Mail Client', category: 'media' },
  { code: 'KC_BRIU', label: 'Bright +', tooltip: 'Increase Display Brightness', category: 'media' },
  { code: 'KC_BRID', label: 'Bright -', tooltip: 'Decrease Display Brightness', category: 'media' },
];

export const VIA_MACRO_KEYS: ViaKeycodeItem[] = Array.from({ length: 16 }, (_, i) => ({
  code: `M${i}`,
  label: `M${i}`,
  tooltip: `Execute Programmable Macro Slot ${i}`,
  category: 'macro',
}));

export const VIA_LAYER_KEYS: ViaKeycodeItem[] = [
  { code: 'MO(1)', label: 'MO(1)', tooltip: 'Momentary switch to Layer 1 (Active while held)', category: 'layers' },
  { code: 'MO(2)', label: 'MO(2)', tooltip: 'Momentary switch to Layer 2 (Active while held)', category: 'layers' },
  { code: 'MO(3)', label: 'MO(3)', tooltip: 'Momentary switch to Layer 3 (Active while held)', category: 'layers' },
  { code: 'TG(1)', label: 'TG(1)', tooltip: 'Toggle Layer 1 on/off', category: 'layers' },
  { code: 'TG(2)', label: 'TG(2)', tooltip: 'Toggle Layer 2 on/off', category: 'layers' },
  { code: 'TG(3)', label: 'TG(3)', tooltip: 'Toggle Layer 3 on/off', category: 'layers' },
  { code: 'TO(0)', label: 'TO(0)', tooltip: 'Switch to Layer 0 and turn off all other layers', category: 'layers' },
  { code: 'TO(1)', label: 'TO(1)', tooltip: 'Switch to Layer 1 and turn off all other layers', category: 'layers' },
  { code: 'TO(2)', label: 'TO(2)', tooltip: 'Switch to Layer 2 and turn off all other layers', category: 'layers' },
  { code: 'TT(1)', label: 'TT(1)', tooltip: 'Tap to toggle Layer 1, hold to activate momentarily', category: 'layers' },
  { code: 'DF(0)', label: 'DF(0)', tooltip: 'Set default base layer to 0', category: 'layers' },
  { code: 'DF(1)', label: 'DF(1)', tooltip: 'Set default base layer to 1', category: 'layers' },
];

export const VIA_SPECIAL_KEYS: ViaKeycodeItem[] = [
  { code: 'RESET', label: 'RESET', tooltip: 'Trigger DFU / Bootloader Mode', category: 'special' },
  { code: 'EE_CLR', label: 'EE_CLR', tooltip: 'Clear Microcontroller EEPROM to Defaults', category: 'special' },
  { code: 'KC_NO', label: 'NONE', tooltip: 'No Action (Transparent/Disabled)', category: 'special' },
  { code: 'KC_TRNS', label: 'TRANS', tooltip: 'Transparent (Fall through to lower layer)', category: 'special' },
  { code: 'LCTL_T(KC_Z)', label: 'Ctrl/Z', tooltip: 'Tap for Z, Hold for Left Ctrl', category: 'special' },
  { code: 'LSFT_T(KC_SPC)', label: 'Sft/Spc', tooltip: 'Tap for Space, Hold for Left Shift', category: 'special' },
  { code: 'MS_BTN1', label: 'Left Click', tooltip: 'Mouse Left Click', category: 'special' },
  { code: 'MS_BTN2', label: 'Right Click', tooltip: 'Mouse Right Click', category: 'special' },
  { code: 'MS_BTN3', label: 'Middle Click', tooltip: 'Mouse Middle Click', category: 'special' },
  { code: 'MS_WH_U', label: 'Wheel Up', tooltip: 'Mouse Wheel Scroll Up', category: 'special' },
  { code: 'MS_WH_D', label: 'Wheel Dn', tooltip: 'Mouse Wheel Scroll Down', category: 'special' },
];
