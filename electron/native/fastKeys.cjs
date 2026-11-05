'use strict';

// One pre-warmed helper for Windows key and text input. Commands are typed JSON
// data, never PowerShell source. Each action is acknowledged once; an uncertain
// action is never replayed automatically after a crash or timeout.
const { spawn } = require('node:child_process');

const WORKER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ZeroFastKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $id = 0
  try {
    $request = ConvertFrom-Json -InputObject $line -ErrorAction Stop
    $id = [int]$request.id
    if ($request.kind -eq 'keys') {
      foreach ($step in $request.events) {
        [ZeroFastKeys]::keybd_event([byte]$step.vk, 0, [uint32]$step.flags, [UIntPtr]::Zero)
      }
    } elseif ($request.kind -eq 'text') {
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait([string]$request.text)
    } else { throw 'Unsupported input operation.' }
    $reply = @{ id = $id; success = $true }
  } catch {
    $reply = @{ id = $id; success = $false; error = [string]$_.Exception.Message }
  }
  [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;
function createKeyWorker({ spawnProcess = spawn, timeoutMs = 10000, maxQueue = 64, workerScript = WORKER, label = 'Windows input helper' } = {}) {
  const encoded = Buffer.from(workerScript, 'utf16le').toString('base64');
  let child = null, ready = false, buffer = '', timer = null, inflight = null, sequence = 0;
  let queue = [], stopped = false;
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  function failWorker(message) {
    const previous = child;
    child = null; ready = false; buffer = ''; clearTimer();
    if (previous) { try { previous.kill(); } catch {} }
    if (inflight) { inflight.resolve({ success: false, transportFailure: true, error: `${message} The action may have been sent; check before retrying.` }); inflight = null; }
    for (const request of queue) request.resolve({ success: false, transportFailure: true, error: `${message} The action was not sent.` });
    queue = [];
  }
  function sendNext() {
    if (!ready || !child || inflight || !queue.length) return;
    inflight = queue.shift();
    const active = child;
    timer = setTimeout(() => { if (child === active) failWorker(`${label} timed out.`); }, timeoutMs);
    try { active.stdin.write(`${JSON.stringify(inflight.command)}\n`); }
    catch { failWorker(`${label} disconnected.`); }
  }
  function onLine(line, active) {
    if (child !== active) return;
    let value;
    try { value = JSON.parse(line); } catch { failWorker(`${label} returned invalid data.`); return; }
    if (value && value.ready === true && !ready) { clearTimer(); ready = true; sendNext(); return; }
    if (!ready || !inflight || !value || value.id !== inflight.command.id || typeof value.success !== 'boolean') {
      failWorker(`${label} returned an unexpected reply.`); return;
    }
    clearTimer(); const completed = inflight; inflight = null;
    const { id, ...result } = value;
    if (!value.success && typeof result.error !== 'string') result.error = 'Windows input was rejected.';
    completed.resolve(result);
    sendNext();
  }
  function start() {
    if (child || stopped) return;
    try {
      const active = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      child = active; ready = false; buffer = '';
      active.on('error', () => { if (child === active) failWorker(`Could not start ${label}.`); });
      active.on('close', () => { if (child === active) failWorker(`${label} stopped.`); });
      active.stdin.on('error', () => { if (child === active) failWorker(`${label} disconnected.`); });
      active.stdout.on('data', chunk => {
        if (child !== active) return;
        buffer += chunk.toString();
        if (buffer.length > 262144) { failWorker(`${label} returned too much data.`); return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0 && child === active) {
          const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          if (line) onLine(line, active);
        }
      });
      timer = setTimeout(() => { if (child === active && !ready) failWorker(`${label} did not start.`); }, timeoutMs);
    } catch { failWorker(`Could not start ${label}.`); }
  }
  function send(command) {
    if (stopped) return Promise.resolve({ success: false, error: 'Windows input helper is shutting down.' });
    if (queue.length + (inflight ? 1 : 0) >= maxQueue) return Promise.resolve({ success: false, error: 'Windows input queue is full; try again.' });
    return new Promise(resolve => {
      queue.push({ command: { ...command, id: ++sequence }, resolve });
      start(); sendNext();
    });
  }
  function stop() { stopped = true; failWorker('Windows input helper is shutting down.'); }
  return { start, send, stop };
}

const worker = createKeyWorker();
module.exports = { createKeyWorker, start: () => { if (process.platform === 'win32') worker.start(); },
  send: command => process.platform === 'win32' ? worker.send(command) : Promise.resolve({ success: false, error: 'Windows input requires Windows.' }),
  stop: () => worker.stop(), WORKER };
