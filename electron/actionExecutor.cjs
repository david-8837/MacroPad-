// Native Windows action executor for KADOWAZ Deck Studio.
// Sends hotkeys/media keys/text via user32 keybd_event — no shell string concatenation.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const KEYEVENTF_KEYUP = 2;

const VK = {
  BACK: 0x08, TAB: 0x09, ENTER: 0x0d, RETURN: 0x0d, SHIFT: 0x10, CONTROL: 0x11, CTRL: 0x11,
  ALT: 0x12, MENU: 0x12, PAUSE: 0x13, CAPSLOCK: 0x14, ESCAPE: 0x1b, ESC: 0x1b, SPACE: 0x20,
  PAGEUP: 0x21, PAGEDOWN: 0x22, END: 0x23, HOME: 0x24, LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28,
  PRINTSCREEN: 0x2c, INSERT: 0x2d, DELETE: 0x2e,
  LWIN: 0x5b, WIN: 0x5b, RWIN: 0x5c, APPS: 0x5d,
  NUMPAD0: 0x60, NUMPAD1: 0x61, NUMPAD2: 0x62, NUMPAD3: 0x63, NUMPAD4: 0x64,
  NUMPAD5: 0x65, NUMPAD6: 0x66, NUMPAD7: 0x67, NUMPAD8: 0x68, NUMPAD9: 0x69,
  MULTIPLY: 0x6a, ADD: 0x6b, SUBTRACT: 0x6d, DECIMAL: 0x6e, DIVIDE: 0x6f,
  F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77,
  F9: 0x78, F10: 0x79, F11: 0x7a, F12: 0x7b,
  NUMLOCK: 0x90, SCROLL: 0x91,
  LSHIFT: 0xa0, RSHIFT: 0xa1, LCONTROL: 0xa2, RCONTROL: 0xa3, LALT: 0xa4, RALT: 0xa5,
  VOLUME_MUTE: 0xad, VOLUME_DOWN: 0xae, VOLUME_UP: 0xaf,
  MEDIA_NEXT: 0xb0, MEDIA_PREV: 0xb1, MEDIA_STOP: 0xb2, MEDIA_PLAY_PAUSE: 0xb3,
  OEM_1: 0xba, OEM_PLUS: 0xbb, OEM_COMMA: 0xbc, OEM_MINUS: 0xbd, OEM_PERIOD: 0xbe,
  OEM_2: 0xbf, OEM_3: 0xc0, OEM_4: 0xdb, OEM_5: 0xdc, OEM_6: 0xdd, OEM_7: 0xde,
};

const ALIASES = {
  CTRL: 'CONTROL', CONTROL: 'CONTROL', CTL: 'CONTROL',
  SHIFT: 'SHIFT', ALT: 'ALT', OPTION: 'ALT',
  WIN: 'LWIN', META: 'LWIN', SUPER: 'LWIN', GUI: 'LWIN', CMD: 'LWIN',
  ENTER: 'RETURN', RETURN: 'RETURN',
  ESC: 'ESCAPE', ESCAPE: 'ESCAPE',
  SPACE: 'SPACE', SPACEBAR: 'SPACE',
  BKSP: 'BACK', BACKSPACE: 'BACK',
  DEL: 'DELETE', DELETE: 'DELETE', INS: 'INSERT',
  PGUP: 'PAGEUP', PGDN: 'PAGEDOWN', PAGEUP: 'PAGEUP', PAGEDOWN: 'PAGEDOWN',
  ARROWLEFT: 'LEFT', ARROWRIGHT: 'RIGHT', ARROWUP: 'UP', ARROWDOWN: 'DOWN',
  LEFT: 'LEFT', RIGHT: 'RIGHT', UP: 'UP', DOWN: 'DOWN',
  TAB: 'TAB', HOME: 'HOME', END: 'END',
  VOLUMEUP: 'VOLUME_UP', VOLUMEDOWN: 'VOLUME_DOWN', VOLUMEMUTE: 'VOLUME_MUTE', MUTE: 'VOLUME_MUTE',
  MEDIANEXTTRACK: 'MEDIA_NEXT', MEDIAPREVIOUSTRACK: 'MEDIA_PREV', MEDIAPLAYPAUSE: 'MEDIA_PLAY_PAUSE',
  PLAYPAUSE: 'MEDIA_PLAY_PAUSE', NEXT: 'MEDIA_NEXT', PREV: 'MEDIA_PREV', PREVIOUS: 'MEDIA_PREV',
  EQUAL: 'OEM_PLUS', MINUS: 'OEM_MINUS', DIGIT0: '0',
};

function stripKeycodePrefix(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^KC_/i, '');
  s = s.replace(/^Key/i, '');
  s = s.replace(/^Digit/i, '');
  s = s.replace(/^Arrow/i, '');
  return s;
}

function resolveVk(raw) {
  const cleaned = stripKeycodePrefix(raw);
  if (!cleaned) return null;
  const aliasKey = cleaned.replace(/[\s+\-_]/g, '').toUpperCase();
  const aliased = ALIASES[aliasKey] || aliasKey;
  if (VK[aliased] !== undefined) return VK[aliased];
  if (aliased.length === 1) {
    const ch = aliased.charCodeAt(0);
    if (ch >= 65 && ch <= 90) return ch; // A-Z
    if (ch >= 48 && ch <= 57) return ch; // 0-9
  }
  if (/^F([1-9]|1[0-2])$/.test(aliased)) return VK[aliased];
  return null;
}

function buildKeybdScript(sequence) {
  // sequence: [{ vk, up: boolean }]
  const lines = sequence.map((step) => {
    const flags = step.up ? KEYEVENTF_KEYUP : 0;
    return `[KadoKeys]::keybd_event(${step.vk}, 0, ${flags}, [UIntPtr]::Zero)`;
  });
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KadoKeys {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
${lines.join('\n')}
`;
}

function runPowershell(script) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', script,
    ], { windowsHide: true, stdio: 'ignore' });
    child.on('error', (err) => resolve({ success: false, error: err.message }));
    child.on('close', (code) => resolve({ success: code === 0, error: code === 0 ? undefined : `PowerShell exited ${code}` }));
  });
}

async function sendChord(keyNames) {
  const vks = [];
  for (const name of keyNames) {
    const vk = resolveVk(name);
    if (vk == null) continue;
    vks.push(vk);
  }
  if (vks.length === 0) {
    return { success: false, error: `No mappable keys in: ${keyNames.join('+')}` };
  }
  const sequence = [];
  for (const vk of vks) sequence.push({ vk, up: false });
  for (let i = vks.length - 1; i >= 0; i--) sequence.push({ vk: vks[i], up: true });
  return runPowershell(buildKeybdScript(sequence));
}

function escapeForSendWait(text) {
  return String(text)
    .replace(/[{}[\]()+^%~]/g, (m) => `{${m}}`)
    .replace(/'/g, "''");
}

async function typeText(text) {
  if (!text) return { success: true };
  const escaped = escapeForSendWait(text);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped}')
`;
  return runPowershell(script);
}

function looksLikeExecutable(command) {
  const token = String(command || '').replace(/^"+|"+$/g, '').trim();
  return /\.(exe|cmd|bat|lnk)$/i.test(token.split(/\s+/)[0] || '');
}

async function runUserCommand(command) {
  const raw = String(command || '').trim();
  if (!raw) return { success: false, error: 'Empty command' };
  if (!looksLikeExecutable(raw)) {
    return typeText(raw);
  }
  const parts = raw.match(/"[^"]+"|\S+/g) || [];
  const file = (parts[0] || '').replace(/^"+|"+$/g, '');
  const args = parts.slice(1).map((p) => p.replace(/^"+|"+$/g, ''));
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true, detached: true, stdio: 'ignore' });
    child.unref();
    child.on('error', (err) => resolve({ success: false, error: err.message }));
    setTimeout(() => resolve({ success: true }), 50);
  });
}

async function executeAction(action) {
  if (!action || typeof action !== 'object') {
    return { success: false, error: 'Invalid action' };
  }
  const category = action.category;
  const payload = action.payload || {};

  if (category === 'hotkey') {
    const keys = Array.isArray(payload.keys) ? payload.keys : [];
    if (keys.length === 0) return { success: false, error: 'No keys assigned' };
    return sendChord(keys);
  }

  if (category === 'media') {
    const map = {
      play_pause: ['MediaPlayPause'],
      next: ['MediaNextTrack'],
      prev: ['MediaPreviousTrack'],
      volume_up: ['VolumeUp'],
      volume_down: ['VolumeDown'],
      mute: ['VolumeMute'],
    };
    const keys = map[payload.mediaAction];
    if (!keys) return { success: false, error: `Unknown media action: ${payload.mediaAction}` };
    return sendChord(keys);
  }

  if (category === 'audio_session') {
    if (payload.toggleMute) return sendChord(['VolumeMute']);
    if (typeof payload.audioDelta === 'number') {
      const key = payload.audioDelta >= 0 ? 'VolumeUp' : 'VolumeDown';
      const steps = Math.min(8, Math.max(1, Math.round(Math.abs(payload.audioDelta) / 2)));
      let last = { success: true };
      for (let i = 0; i < steps; i++) last = await sendChord([key]);
      return last;
    }
    return { success: false, error: 'No audio delta or mute flag' };
  }

  if (category === 'script') {
    if (typeof payload.command === 'string' && payload.command.startsWith('macro:')) {
      return { success: false, error: 'Macro expansion must be handled in the renderer' };
    }
    return runUserCommand(payload.command || '');
  }

  if (category === 'obs' || category === 'midi' || category === 'navigation') {
    return { success: true, skipped: true, reason: `${category} is handled in the desktop UI, not as a native OS event` };
  }

  if (category === 'app_launch' || category === 'app-launch') {
    return { success: false, error: 'Use launchApplication for app_launch' };
  }

  if (Array.isArray(payload.keys) && payload.keys.length > 0) {
    return sendChord(payload.keys);
  }

  return { success: false, error: `Unsupported category: ${category}` };
}

module.exports = { executeAction, sendChord, typeText };
