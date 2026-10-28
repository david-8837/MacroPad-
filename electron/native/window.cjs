/**
 * Foreground window probe (PowerShell `GetForegroundWindow` shim).
 * No longer wired to auto-switching — kept as a manual diagnostic helper.
 * Uses Win32 GetForegroundWindow via PowerShell/C# without external dependencies.
 */

'use strict';

const { powershell, parseJsonLoose, logLine, ok, fail } = require('./util.cjs');

const SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32ActiveWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@ -ErrorAction SilentlyContinue

$h = [Win32ActiveWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 1024
[void][Win32ActiveWin]::GetWindowText($h, $sb, 1024)
$pidOut = 0
[void][Win32ActiveWin]::GetWindowThreadProcessId($h, [ref]$pidOut)

$proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
$path = ''
if ($proc) {
  try { $path = $proc.Path } catch {}
}
@{
  title = $sb.ToString();
  process = if ($proc) { $proc.ProcessName } else { '' };
  path = $path;
  pid = $pidOut;
} | ConvertTo-Json -Compress
`;

let last = null;
let timer = null;
const listeners = new Set();

function normalise(raw) {
  const processName = String(raw.process || '').toLowerCase().replace(/\.exe$/, '');
  return {
    title: String(raw.title || ''),
    app: processName,
    exePath: raw.path ? String(raw.path) : undefined,
    pid: Number(raw.pid || 0),
  };
}

async function getActiveWindow() {
  try {
    const r = await powershell(SCRIPT, { timeoutMs: 4000 });
    if (r.timedOut) {
      return fail('Active window query timed out.');
    }
    if (r.code !== 0 && !r.stdout) {
      return fail(`Could not read active window: ${r.stderr || `exit code ${r.code}`}`);
    }

    const parsed = parseJsonLoose(r.stdout);
    if (!parsed) {
      return fail('Unparseable active window output.');
    }

    last = normalise(parsed);
    return ok(last);
  } catch (err) {
    return fail(`Failed to query active window: ${err.message}`);
  }
}

let prevEmitted = null;

function emit(data) {
  listeners.forEach((l) => {
    try {
      l(data);
    } catch (e) {
      logLine('window', 'listener threw', e.message);
    }
  });
}

async function poll() {
  const r = await getActiveWindow();
  if (r.ok && r.value) {
    const current = r.value;
    if (
      !prevEmitted ||
      prevEmitted.app !== current.app ||
      prevEmitted.title !== current.title ||
      prevEmitted.pid !== current.pid
    ) {
      prevEmitted = current;
      emit(current);
    }
  }
}

function start(intervalMs = 600) {
  if (timer) return;
  timer = setInterval(() => { void poll(); }, intervalMs);
  void poll();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function subscribe(cb) {
  listeners.add(cb);
  start();
  if (last) cb(last);
  return () => {
    listeners.delete(cb);
    if (!listeners.size) stop();
  };
}

module.exports = {
  getActiveWindow,
  normalise,
  subscribe,
  start,
  stop,
};

