// Native Windows action executor for KADOWAZ Deck Studio.
// Sends hotkeys/media keys/text via user32 keybd_event — no shell string concatenation.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { powershell } = require('./native/util.cjs');
const { adjustExternalBrightness } = require('./native/brightness.cjs');

let audioNative = null;
try {
  audioNative = require('./native/audio.cjs');
} catch (e) {
  // Graceful fallback
}

const KEYEVENTF_EXTENDEDKEY = 1;
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

// Literal punctuation characters as they appear in shortcut definitions
// (e.g. ['Win', '.'], ['Ctrl', '[']). Must be matched BEFORE separator stripping,
// otherwise '-' and '+' are erased and the chord degrades to its modifiers only.
const PUNCTUATION_VK = {
  '!': 0x31, '@': 0x32, '#': 0x33, '$': 0x34, '%': 0x35,
  '^': 0x36, '&': 0x37, '*': 0x38, '(': 0x39, ')': 0x30,
  ';': VK.OEM_1, ':': VK.OEM_1,
  '=': VK.OEM_PLUS, '+': VK.OEM_PLUS,
  ',': VK.OEM_COMMA, '<': VK.OEM_COMMA,
  '-': VK.OEM_MINUS, '_': VK.OEM_MINUS,
  '.': VK.OEM_PERIOD, '>': VK.OEM_PERIOD,
  '/': VK.OEM_2, '?': VK.OEM_2,
  '`': VK.OEM_3, '~': VK.OEM_3,
  '[': VK.OEM_4, '{': VK.OEM_4,
  '\\': VK.OEM_5, '|': VK.OEM_5,
  ']': VK.OEM_6, '}': VK.OEM_6,
  "'": VK.OEM_7, '"': VK.OEM_7,
};

const ALIASES = {
  CTRL: 'CONTROL', CONTROL: 'CONTROL', CTL: 'CONTROL',
  SHIFT: 'SHIFT', ALT: 'ALT', OPTION: 'ALT', OPT: 'ALT',
  WIN: 'LWIN', META: 'LWIN', SUPER: 'LWIN', GUI: 'LWIN', CMD: 'LWIN', COMMAND: 'LWIN',
  ENTER: 'RETURN', RETURN: 'RETURN',
  ESC: 'ESCAPE', ESCAPE: 'ESCAPE',
  SPACE: 'SPACE', SPACEBAR: 'SPACE',
  BKSP: 'BACK', BACKSPACE: 'BACK', '⌫': 'BACK', CAPS: 'CAPSLOCK',
  CONTEXTMENU: 'APPS', MENU: 'APPS', PRTSC: 'PRINTSCREEN', SCRLK: 'SCROLL', SCROLLLOCK: 'SCROLL', NUM: 'NUMLOCK',
  DEL: 'DELETE', DELETE: 'DELETE', INS: 'INSERT',
  PGUP: 'PAGEUP', PGDN: 'PAGEDOWN', PAGEUP: 'PAGEUP', PAGEDOWN: 'PAGEDOWN',
  ARROWLEFT: 'LEFT', ARROWRIGHT: 'RIGHT', ARROWUP: 'UP', ARROWDOWN: 'DOWN',
  LEFTARROW: 'LEFT', RIGHTARROW: 'RIGHT', UPARROW: 'UP', DOWNARROW: 'DOWN',
  '◀': 'LEFT', '▶': 'RIGHT', '▲': 'UP', '▼': 'DOWN',
  LEFT: 'LEFT', RIGHT: 'RIGHT', UP: 'UP', DOWN: 'DOWN',
  TAB: 'TAB', HOME: 'HOME', END: 'END',
  VOLUMEUP: 'VOLUME_UP', VOLUMEDOWN: 'VOLUME_DOWN', VOLUMEMUTE: 'VOLUME_MUTE', MUTE: 'VOLUME_MUTE',
  AUDIOVOLUMEUP: 'VOLUME_UP', AUDIOVOLUMEDOWN: 'VOLUME_DOWN', AUDIOVOLUMEMUTE: 'VOLUME_MUTE',
  MEDIANEXT: 'MEDIA_NEXT', MEDIAPREV: 'MEDIA_PREV',
  MEDIANEXTTRACK: 'MEDIA_NEXT', MEDIAPREVIOUSTRACK: 'MEDIA_PREV', MEDIAPLAYPAUSE: 'MEDIA_PLAY_PAUSE',
  MEDIASTOP: 'MEDIA_STOP',
  PLAYPAUSE: 'MEDIA_PLAY_PAUSE', NEXT: 'MEDIA_NEXT', PREV: 'MEDIA_PREV', PREVIOUS: 'MEDIA_PREV',
  MEDIATRACKNEXT: 'MEDIA_NEXT', MEDIATRACKPREVIOUS: 'MEDIA_PREV', 'NUMPAD.': 'DECIMAL',
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
  const trimmed = String(raw == null ? '' : raw).trim();
  if (/^vol\+$/i.test(trimmed)) return VK.VOLUME_UP;
  if (/^vol-$/i.test(trimmed)) return VK.VOLUME_DOWN;
  const keypad = /^(?:Num|Numpad)\s*(\d|\.|Enter|Add|Subtract|Multiply|Divide|Decimal)$/i.exec(trimmed);
  if (keypad) {
    const key = keypad[1].toUpperCase();
    if (/^\d$/.test(key)) return VK[`NUMPAD${key}`];
    return VK[{ '.': 'DECIMAL', ENTER: 'ENTER', ADD: 'ADD', SUBTRACT: 'SUBTRACT', MULTIPLY: 'MULTIPLY', DIVIDE: 'DIVIDE', DECIMAL: 'DECIMAL' }[key]];
  }
  if (trimmed.length === 1 && PUNCTUATION_VK[trimmed] !== undefined) {
    return PUNCTUATION_VK[trimmed];
  }
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
    // Dedicated navigation keys and numpad divide/enter use extended scan codes.
    const extended = step.extended || [VK.LEFT, VK.UP, VK.RIGHT, VK.DOWN, VK.HOME, VK.END,
      VK.PAGEUP, VK.PAGEDOWN, VK.INSERT, VK.DELETE, VK.DIVIDE, VK.RWIN, VK.APPS].includes(step.vk);
    const flags = (extended ? KEYEVENTF_EXTENDEDKEY : 0) | (step.up ? KEYEVENTF_KEYUP : 0);
    return `[KadoKeys]::keybd_event(${step.vk}, 0, ${flags}, [UIntPtr]::Zero)`;
  });
  return `
$ErrorActionPreference = 'Stop'
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

function buildChordSequence(keyNames) {
  const vks = [];
  const unmapped = [];
  const shiftedSymbols = new Set('!@#$%^&*()_+{}|:"<>?~');
  let needsShift = false;
  for (const name of keyNames) {
    const vk = resolveVk(name);
    if (vk == null) unmapped.push(String(name));
    else {
      const extended = /^(?:Num|Numpad)\s*Enter$/i.test(String(name).trim());
      vks.push(extended ? { vk, extended: true } : { vk });
      if (shiftedSymbols.has(String(name))) needsShift = true;
    }
  }
  if (unmapped.length > 0) {
    // Never send a partial chord: "Win" alone opens the Start menu instead of "Win + -".
    return { error: `Unmappable key(s): ${unmapped.join(', ')} in ${keyNames.join('+')}` };
  }
  if (vks.length === 0) {
    return { error: `No mappable keys in: ${keyNames.join('+')}` };
  }
  // Users can pick keys in either order in the editor. Modifiers must be
  // pressed before the main key for Windows to recognize the combination.
  const modifiers = new Set([VK.SHIFT, VK.CONTROL, VK.ALT, VK.LWIN, VK.RWIN,
    VK.LSHIFT, VK.RSHIFT, VK.LCONTROL, VK.RCONTROL, VK.LALT, VK.RALT]);
  if (needsShift && !vks.some(key => [VK.SHIFT, VK.LSHIFT, VK.RSHIFT].includes(key.vk))) vks.unshift({ vk: VK.SHIFT });
  const ordered = [...vks.filter(key => modifiers.has(key.vk)), ...vks.filter(key => !modifiers.has(key.vk))];
  const sequence = [];
  for (const key of ordered) sequence.push({ ...key, up: false });
  for (let i = ordered.length - 1; i >= 0; i--) sequence.push({ ...ordered[i], up: true });
  return { sequence };
}

/* Native parity with the pad's curated consumer-HID tray. A code with no
 * mapping cannot be offered as an executable desktop-preview action. */
const MEDIA_ACTION_KEYS = Object.freeze({
  play_pause: ['MediaPlayPause'], stop: ['MediaStop'],
  next: ['MediaNextTrack'], prev: ['MediaPreviousTrack'],
  volume_up: ['VolumeUp'], volume_down: ['VolumeDown'], mute: ['VolumeMute'],
});
function mediaKeys(action) {
  return Object.prototype.hasOwnProperty.call(MEDIA_ACTION_KEYS, action) ? MEDIA_ACTION_KEYS[action] : null;
}

// Windows has no general virtual-key code for display brightness. Try WMI for
// built-in displays, then DDC/CI for compatible external monitors. Report a
// failure when neither control is available; support depends on the hardware.
function brightnessDirection(raw) {
  const key = String(raw || '').trim().replace(/[\s_-]/g, '').toLowerCase();
  if (key === 'brightnessup' || key === 'displaybrightnessup') return 1;
  if (key === 'brightnessdown' || key === 'displaybrightnessdown') return -1;
  return 0;
}

// Serialize read/modify/write operations: simultaneous taps otherwise read the
// same current level and collapse multiple requested steps into one.
let brightnessQueue = Promise.resolve();
function adjustDisplayBrightness(direction) {
  const operation = brightnessQueue.then(() => adjustDisplayBrightnessNow(direction));
  brightnessQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function adjustDisplayBrightnessNow(direction) {
  if (process.platform !== 'win32') return { success: false, error: 'Display brightness control requires Windows.' };
  const up = direction > 0 ? '$true' : '$false';
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $display = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Where-Object { $_.Active } | Select-Object -First 1
  if (-not $display) { throw 'No supported built-in display is available.' }
  $method = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Where-Object { $_.Active -and $_.InstanceName -eq $display.InstanceName } | Select-Object -First 1
  if (-not $method) { throw 'Windows cannot control brightness on this display.' }
  $current = [int]$display.CurrentBrightness
  $levels = @($display.Level | ForEach-Object { [int]$_ } | Sort-Object -Unique)
  if ($levels.Count -eq 0) { throw 'The display reported no supported brightness levels.' }
  # Some laptops report every integer from 0 to 100. Moving to the next
  # listed level changes only 1%, which is easy to mistake for no response.
  # Aim for a visible 10 percentage-point change, snapped to an allowed level.
  if (${up}) {
    $higher = @($levels | Where-Object { $_ -gt $current })
    $candidates = @($higher | Where-Object { $_ -ge ($current + 10) })
    $target = if ($candidates.Count) { $candidates[0] } elseif ($higher.Count) { $higher[$higher.Count - 1] } else { $current }
  } else {
    $lower = @($levels | Where-Object { $_ -lt $current })
    $candidates = @($lower | Where-Object { $_ -le ($current - 10) })
    $target = if ($candidates.Count) { $candidates[$candidates.Count - 1] } elseif ($lower.Count) { $lower[0] } else { $current }
  }
  if ($target -ne $current) {
    $result = Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]0; Brightness = [byte]$target }
    if ($result.ReturnValue -ne 0) { throw "The display rejected the brightness change ($($result.ReturnValue))." }
  }
  @{ success = $true; level = $target } | ConvertTo-Json -Compress
} catch {
  @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  const result = await powershell(script, { timeoutMs: 15000 });
  if (result.timedOut) return { success: false, error: 'Windows brightness control timed out.' };
  if (result.code !== 0) return { success: false, error: `Windows brightness control failed: ${result.stderr || 'PowerShell could not run.'}` };
  try {
    const response = JSON.parse(result.stdout);
    if (response.success === true && Number.isInteger(response.level) && response.level >= 0 && response.level <= 100) {
      return { success: true, brightness: response.level };
    }
    if (response.success === false && typeof response.error === 'string') {
      const external = await adjustExternalBrightness(direction);
      if (external.success) return external;
      return { success: false, error: `${response.error} ${external.error} External monitors may require DDC/CI enabled and a compatible connection.` };
    }
  } catch { /* An invalid response is not a successful adjustment. */ }
  return { success: false, error: 'Windows did not confirm a brightness change.' };
}

// repeat > 1 sends the chord several times inside ONE PowerShell process
// (spawning one process per detent made volume steps take seconds).
async function sendChord(keyNames, repeat = 1) {
  const built = buildChordSequence(keyNames);
  if (built.error) return { success: false, error: built.error };
  const count = Math.min(Math.max(1, Math.floor(repeat) || 1), 20);
  const sequence = [];
  for (let i = 0; i < count; i++) sequence.push(...built.sequence);
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
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped}')
`;
  return runPowershell(script);
}

function looksLikeExecutable(command) {
  const first = String(command || '').trim().match(/^"[^"]+"|^\S+/)?.[0] || '';
  return /\.(exe|cmd|bat|lnk)$/i.test(first.replace(/^"+|"+$/g, ''));
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
    if (keys.length === 1 && brightnessDirection(keys[0])) return adjustDisplayBrightness(brightnessDirection(keys[0]));
    return sendChord(keys);
  }

  if (category === 'media') {
    if (payload.mediaAction === 'brightness_up') return adjustDisplayBrightness(1);
    if (payload.mediaAction === 'brightness_down') return adjustDisplayBrightness(-1);
    const keys = mediaKeys(payload.mediaAction);
    if (!keys) return { success: false, error: `Unknown media action: ${payload.mediaAction}` };
    return sendChord(keys);
  }

  if (category === 'audio_session') {
    const processName = payload.processName || payload.target || 'master';
    const isMaster = !processName || String(processName).toLowerCase() === 'master';
    let audioError = '';
    if (!isMaster && payload.toggleMute && payload.muted === undefined) {
      return { success: false, error: 'Per-app mute toggle is not supported; specify a mute state.' };
    }

    if (audioNative) {
      try {
        if (payload.toggleMute) {
          if (isMaster) {
            const res = await audioNative.toggleMasterMute();
            if (res.ok) return { success: true, muted: res.value };
            audioError = res.error || 'Unable to toggle master mute.';
          } else {
            const muted = payload.muted !== undefined ? Boolean(payload.muted) : true;
            const res = await audioNative.setProcessMute(processName, muted);
            if (res.ok) return { success: true };
            audioError = res.error || 'Unable to set the app mute state.';
          }
        }

        if (typeof payload.targetVolume === 'number') {
          if (isMaster) {
            const res = await audioNative.setMasterVolume(payload.targetVolume);
            if (res.ok) return { success: true, volume: res.value };
            audioError = res.error || 'Unable to set master volume.';
          } else {
            const res = await audioNative.setProcessVolume(processName, payload.targetVolume);
            if (res.ok) return { success: true };
            audioError = res.error || 'Unable to set the app volume.';
          }
        }

        if (typeof payload.audioDelta === 'number') {
          if (isMaster) {
            const res = await audioNative.adjustMasterVolume(payload.audioDelta);
            if (res.ok) return { success: true, volume: res.value };
            audioError = res.error || 'Unable to adjust master volume.';
          } else {
            const res = await audioNative.adjustProcessVolume(processName, payload.audioDelta);
            if (res.ok) return { success: true, volume: res.value };
            audioError = res.error || 'Unable to adjust the app volume.';
          }
        }
      } catch (err) {
        audioError = err instanceof Error ? err.message : String(err);
      }
    }

    // A global media key must never replace a failed per-app adjustment.
    if (!isMaster) return { success: false, error: audioError || 'Per-app audio control is unavailable.' };
    if (typeof payload.targetVolume === 'number') return { success: false, error: audioError || 'Setting master volume is unavailable.' };
    if (payload.toggleMute) return sendChord(['VolumeMute']);
    if (typeof payload.audioDelta === 'number') {
      if (!Number.isFinite(payload.audioDelta) || payload.audioDelta === 0) {
        return { success: false, error: audioError || 'No volume change was requested.' };
      }
      const key = payload.audioDelta > 0 ? 'VolumeUp' : 'VolumeDown';
      const steps = Math.min(8, Math.max(1, Math.round(Math.abs(payload.audioDelta) / 2)));
      return sendChord([key], steps);
    }
    return { success: false, error: 'No audio delta or mute flag' };
  }

  if (category === 'text') {
    if (typeof payload.text !== 'string' || !payload.text.length) {
      return { success: false, error: 'No text to type' };
    }
    // A macro text step is never a launch request, even if the text ends in
    // .exe/.bat. Program launches must be explicit script/app_launch actions.
    return typeText(payload.text);
  }

  if (category === 'script') {
    if (typeof payload.command === 'string' && payload.command.startsWith('macro:')) {
      return { success: false, error: 'Macro expansion must be handled in the renderer' };
    }
    return runUserCommand(payload.command || '');
  }

  if (category === 'midi' || category === 'navigation') {
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

module.exports = { executeAction, sendChord, typeText, resolveVk, buildChordSequence, mediaKeys };
