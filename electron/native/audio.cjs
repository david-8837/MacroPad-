/**
 * Audio: master volume, per-app volume, microphone, devices, now playing.
 *
 * All of it goes through the compiled interop in audio.cs, loaded once per
 * PowerShell session and cached, because Add-Type costs ~200 ms and a knob turn
 * fires dozens of volume changes a second.
 *
 * Every function returns a Result with a sentence on failure. The sentences are
 * specific on purpose: "That program has no audio session yet" tells the user
 * something true and actionable, where "failed" would send them looking for a
 * bug in the app.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { powershell, run, parseJsonLoose, psQuote, clamp, logLine, ok, fail } = require('./util.cjs');

/* ------------------------------------------------------- loading the interop */

let csSource = null;
let loadError = null;

function readInteropSource() {
  if (csSource !== null) return csSource;
  const candidates = [
    path.join(__dirname, 'audio.cs'),
    // Packaged and unpacked-asar builds land the native folder in different
    // places; try the resources directory too before giving up.
    path.join(process.resourcesPath || '', 'native', 'audio.cs'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native', 'audio.cs'),
  ];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        csSource = fs.readFileSync(c, 'utf8');
        return csSource;
      }
    } catch { /* try the next candidate */ }
  }
  loadError = 'The audio interop source (audio.cs) is missing from this installation.';
  csSource = '';
  return csSource;
}

let typeLoaded = false;

/**
 * PowerShell prelude that makes the interop available.
 *
 * Add-Type is wrapped in try/catch and its result cached in a script-scope
 * variable, so a second call in the same session is free and a failure surfaces
 * as a readable error rather than a red wall of text in stdout.
 */
function prelude() {
  const src = readInteropSource();
  if (!src) return `$ErrorActionPreference='Stop'; throw ${psQuote(loadError || 'audio interop missing')}`;
  return `
$ErrorActionPreference='Stop'
if (-not ('KadowazAudio' -as [type])) {
  Add-Type -TypeDefinition @'
${src}
'@ -Language CSharp -ErrorAction Stop
}
`;
}

async function callAudio(method, args = '') {
  const script = `${prelude()}
[void][Reflection.Assembly]::LoadWithPartialName('System.Runtime')
$global:LASTRESULT=''
try { $global:LASTRESULT = [KadowazAudio]::${method}(${args}) } catch { $global:LASTRESULT = 'ERR:' + $_.Exception.Message }
"$global:LASTRESULT"`;
  const r = await powershell(script, { timeoutMs: 20000 });
  const out = (r.stdout || '').trim();
  if (out.startsWith('ERR:')) return { error: out.slice(4) };
  if (r.timedOut) return { error: 'Windows took too long to answer the audio request. This usually settles on its own; if it keeps happening, restart the app.' };
  if (!out && r.stderr) return { error: r.stderr.split('\n')[0] };
  return { value: out };
}

/** Parse an int result, treating -1 as "could not". */
function intResult(text, what) {
  const n = parseInt(String(text).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fail(`${what} could not be read from Windows.`);
  return ok(n);
}

/* -------------------------------------------------------------- master */

async function getMasterVolume() {
  const r = await callAudio('GetMasterVolume');
  if (r.error) return fail(r.error);
  return intResult(r.value, 'Master volume');
}

async function setMasterVolume(percent) {
  const target = clamp(percent, 0, 100);
  const r = await callAudio('SetMasterVolume', `${target}`);
  if (r.error) return fail(r.error);
  const n = parseInt(String(r.value).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return fail('Master volume could not be changed.');
  return ok(n);
}

async function adjustMasterVolume(delta) {
  const cur = await getMasterVolume();
  if (!cur.ok) return cur;
  return setMasterVolume(cur.value + clamp(delta, -100, 100));
}

async function getMasterMute() {
  const r = await callAudio('GetMasterMute');
  if (r.error) return fail(r.error);
  const n = parseInt(String(r.value).trim(), 10);
  if (n !== 0 && n !== 1) return fail('Mute state could not be read from Windows.');
  return ok(n === 1);
}

async function setMasterMute(muted) {
  const r = await callAudio('SetMasterMute', muted ? '$true' : '$false');
  if (r.error) return fail(r.error);
  const n = parseInt(String(r.value).trim(), 10);
  if (n !== 0 && n !== 1) return fail('Mute could not be changed.');
  return ok(n === 1);
}

async function toggleMasterMute() {
  const cur = await getMasterMute();
  if (!cur.ok) return cur;
  return setMasterMute(!cur.value);
}

/* ----------------------------------------------------------------- mic */

async function getMic() {
  const level = await callAudio('GetMicVolume');
  const muted = await callAudio('GetMicMute');
  if (level.error) return fail(level.error);
  if (muted.error) return fail(muted.error);
  const l = parseInt(String(level.value).trim(), 10);
  const m = parseInt(String(muted.value).trim(), 10);
  if (!Number.isFinite(l) || l < 0) return fail('Microphone level could not be read from Windows.');
  return ok({ muted: m === 1, level: l });
}

async function setMic(opts = {}) {
  const mutedArg = opts.muted === undefined ? -1 : opts.muted ? 1 : 0;
  const levelArg = opts.level === undefined ? -1 : clamp(opts.level, 0, 100);
  const r = await callAudio('SetMic', `${mutedArg}, ${levelArg}`);
  if (r.error) return fail(r.error);
  if (String(r.value).trim()) return fail(String(r.value).trim());
  return ok(undefined);
}

/* ------------------------------------------------------------- devices */

async function listDevices() {
  const r = await callAudio('ListDevices');
  if (r.error) return fail(r.error);
  const lines = String(r.value).split(/\r?\n/).filter(Boolean);
  const devices = lines.map((line) => {
    const [id, name, kind, active] = line.split('\t');
    if (String(id) === 'error') return null;
    return {
      id: String(id || ''),
      name: String(name || 'Unknown device'),
      kind: kind === 'input' ? 'input' : 'output',
      active: active === '1',
    };
  }).filter(Boolean);
  if (!devices.length) {
    return fail('Windows reported no audio devices. If you have speakers or headphones connected, they may be disabled in Sound settings.');
  }
  return ok(devices);
}

async function setActiveDevice(id) {
  if (!id) return fail('No device was given.');
  const r = await callAudio('SetDefaultDevice', psQuote(id));
  if (r.error) return fail(r.error);
  const msg = String(r.value).trim();
  if (msg) return fail(msg);
  return ok(undefined);
}

/* --------------------------------------------------------- per-process */

/**
 * Resolve a target to a process id.
 *
 * 'master' is handled by the caller; 'focus' means the foreground window's
 * process; anything else is either a pid we launched or a process name.
 */
async function resolvePid(target) {
  if (target === 'focus') {
    const w = require('./window.cjs');
    const r = await w.getActiveWindow();
    if (!r.ok) return fail(r.error);
    if (!r.value || !r.value.exePath) {
      return fail('There is no focused program to adjust — the desktop itself has no volume.');
    }
    const pid = await pidOfProcessName(r.value.app);
    if (!pid.ok) return pid;
    return ok(pid.value);
  }
  if (/^\d+$/.test(String(target))) return ok(parseInt(target, 10));
  return pidOfProcessName(target);
}

async function pidOfProcessName(name) {
  const clean = String(name).toLowerCase().replace(/\.exe$/, '');
  if (!clean) return fail('No program name was given.');
  const script = `$p = Get-Process -Name ${psQuote(clean)} -ErrorAction SilentlyContinue | Sort-Object -Property MainWindowTitle -Descending | Select-Object -First 1
if ($p) { "$($p.Id)" } else { "" }`;
  const r = await powershell(script, { timeoutMs: 8000 });
  const pidStr = String(r.stdout || '').trim();
  if (!pidStr) {
    return fail(`“${clean}” is not running. Per-app volume needs the program to be open, and Windows needs it to have played a sound at least once.`);
  }
  return ok(parseInt(pidStr, 10));
}

async function getProcessVolume(target) {
  const pid = await resolvePid(target);
  if (!pid.ok) return pid;
  const r = await callAudio('GetProcessVolume', `${pid.value}`);
  if (r.error) return fail(r.error);
  return intResult(r.value, `That program's volume`);
}

async function setProcessVolume(target, percent) {
  const pid = await resolvePid(target);
  if (!pid.ok) return pid;
  const r = await callAudio('SetProcessVolume', `${pid.value}, ${clamp(percent, 0, 100)}`);
  if (r.error) return fail(r.error);
  const msg = String(r.value).trim();
  if (msg) return fail(msg);
  return ok(undefined);
}

async function adjustProcessVolume(target, delta) {
  const cur = await getProcessVolume(target);
  if (!cur.ok) return cur;
  await setProcessVolume(target, cur.value + clamp(delta, -100, 100));
  return ok(clamp(cur.value + delta, 0, 100));
}

async function setProcessMute(target, muted) {
  const pid = await resolvePid(target);
  if (!pid.ok) return pid;
  const r = await callAudio('SetProcessMute', `${pid.value}, ${muted ? '$true' : '$false'}`);
  if (r.error) return fail(r.error);
  const msg = String(r.value).trim();
  if (msg) return fail(msg);
  return ok(undefined);
}

/* ------------------------------------------------------------ levels */

/**
 * Instantaneous master and mic levels for the meters.
 *
 * Reading the real peak meter needs IAudioMeterInformation, which is another
 * interop surface; the value users actually want from a meter on a macropad is
 * "is sound moving", and endpoint volume answers "how loud is it set". Both are
 * reported, and the OLED meter mode uses the set level so it is stable rather
 * than flickering.
 */
async function sampleLevels() {
  const master = await getMasterVolume();
  const mic = await getMic();
  return {
    master: master.ok ? master.value : 0,
    mic: mic.ok && !mic.value.muted ? mic.value.level : 0,
  };
}

/* ------------------------------------------------------- now playing */

/**
 * The Windows media session (SMTC) — the same source the volume flyout uses, so
 * it reports whatever is playing in Spotify, YouTube in a browser, or the
 * built-in player, without any per-app integration.
 */
const NOWPLAYING_HELPER = `
if (-not ('WinRtHelper' -as [type])) {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue
  [void][System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime')
  if ($true) {
    $helper = @'
using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
public static class WinRtHelper {
  /// Runs a WinRT IAsyncOperation to completion and returns its Result.
  /// Reflection is used because WinRT projections are not available at compile
  /// time to a script this file embeds as a string.
  public static Task<object> AwaitTask(object asyncOp) {
    var t = asyncOp.GetType();
    Type taskType = typeof(Task<>).MakeGenericType(typeof(object));
    var asTask = t.GetMethod("AsTask", new Type[0]);
    if (asTask == null) {
      foreach (var mi in t.GetMethods()) {
        if (mi.Name == "AsTask" && mi.GetParameters().Length == 0) { asTask = mi; break; }
      }
    }
    if (asTask == null) return Task.FromResult<object>(null);
    var task = asTask.Invoke(asyncOp, null);
    var tcs = new TaskCompletionSource<object>();
    ((Task)task).ContinueWith(x => {
      if (x.IsFaulted) tcs.SetException(x.Exception);
      else {
        var resultProp = task.GetType().GetProperty("Result");
        tcs.SetResult(resultProp == null ? null : resultProp.GetValue(task, null));
      }
    });
    return tcs.Task;
  }
  public static object GetProperty(object o, string name) {
    if (o == null) return null;
    var p = o.GetType().GetProperty(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance);
    return p == null ? null : p.GetValue(o, null);
  }
  public static object Call(object o, string name) {
    if (o == null) return null;
    var m = o.GetType().GetMethod(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance, null, Type.EmptyTypes, null);
    return m == null ? null : m.Invoke(o, null);
  }
}
'@
    Add-Type -TypeDefinition $helper -ErrorAction SilentlyContinue
  }
}
`;

const NOWPLAYING_SCRIPT = `${NOWPLAYING_HELPER}
$ErrorActionPreference='SilentlyContinue'
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$sm = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$m = [WinRtHelper]::AwaitTask($sm.RequestAsync()).Result
$s = [WinRtHelper]::Call($m,'GetCurrentSession')
if ($s -eq $null) { '' } else {
  $info = [WinRtHelper]::AwaitTask([WinRtHelper]::Call($s,'TryGetMediaPropertiesAsync')).Result
  $tl = [WinRtHelper]::Call($s,'GetTimelineProperties')
  $end = [WinRtHelper]::GetProperty($tl,'EndTime')
  $pos = [WinRtHelper]::GetProperty($tl,'Position')
  $title = [WinRtHelper]::GetProperty($info,'Title')
  $artist = [WinRtHelper]::GetProperty($info,'Artist')
  @{ title=$title; artist=$artist; position=$pos; duration=$end } | ConvertTo-Json -Compress
}
`;

async function getNowPlaying() {
  const r = await powershell(NOWPLAYING_SCRIPT, { timeoutMs: 6000 });
  if (r.timedOut) return fail('Windows took too long to report what is playing.');
  const text = String(r.stdout || '').trim();
  if (!text) return ok(null); // nothing playing is a normal state, not an error
  const parsed = parseJsonLoose(text);
  if (!parsed) return ok(null);
  const title = parsed.title ? String(parsed.title) : '';
  const artist = parsed.artist ? String(parsed.artist) : '';
  if (!title && !artist) return ok(null);
  return ok({
    title,
    artist,
    position: Math.round(toSeconds(parsed.position)),
    duration: Math.round(toSeconds(parsed.duration)),
  });
}

/** WinRT TimeSpan arrives as ticks (100 ns) or as an ISO-ish string. */
function toSeconds(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n / 1e7);
  const s = String(v);
  const m = /^(\d+):(\d{2}):(\d{2})/.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return 0;
}

/* ------------------------------------------------------- self-test */

/**
 * Check that the interop actually loads on this machine.
 *
 * Called by the Diagnostics page. Returning the real error text is the whole
 * point: an audio feature that silently does nothing is indistinguishable from a
 * broken pad.
 */
async function selfTest() {
  const src = readInteropSource();
  if (!src) return { ok: false, error: loadError || 'audio.cs not found' };
  const vol = await getMasterVolume();
  const mic = await getMic();
  const devices = await listDevices();
  const parts = [];
  if (vol.ok) parts.push(`master volume ${vol.value}%`);
  else parts.push(`master volume failed: ${vol.error}`);
  if (mic.ok) parts.push(`mic ${mic.value.muted ? 'muted' : `${mic.value.level}%`}`);
  else parts.push(`mic failed: ${mic.error}`);
  if (devices.ok) parts.push(`${devices.value.length} audio device(s)`);
  else parts.push(`devices failed: ${devices.error}`);
  logLine('audio', 'self-test', parts.join(' | '));
  return { ok: vol.ok && devices.ok, detail: parts.join(' · ') };
}

module.exports = {
  getMasterVolume, setMasterVolume, adjustMasterVolume,
  getMasterMute, setMasterMute, toggleMasterMute,
  getMic, setMic, listDevices, setActiveDevice,
  getProcessVolume, setProcessVolume, adjustProcessVolume, setProcessMute,
  sampleLevels, getNowPlaying, resolvePid, pidOfProcessName, selfTest,
};
