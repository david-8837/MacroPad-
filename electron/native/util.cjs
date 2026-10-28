/**
 * Small shared helpers for the Electron main process.
 * Plain CommonJS running under Node.js in Electron.
 */

'use strict';

const { spawn } = require('node:child_process');

/** A standard Result wrapper */
const ok = (value) => ({ ok: true, value });
const fail = (error) => ({ ok: false, error: String(error || 'Unknown failure.') });

/**
 * Run a command and resolve with what it produced. Always resolves.
 */
function run(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15000;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: opts.windowsHide !== false,
        cwd: opts.cwd,
        env: opts.env,
        shell: opts.shell || false,
      });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: `${command} could not be started: ${e.message}`, timedOut: false, ms: 0 });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startedAt = Date.now();
    const cap = opts.maxBytes || 1024 * 1024;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);

    child.stdout.on('data', (d) => { if (stdout.length < cap) stdout += d.toString(); });
    child.stderr.on('data', (d) => { if (stderr.length < cap) stderr += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      stderr += `\n${e.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: code === null ? -1 : code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        ms: Date.now() - startedAt,
      });
    });
  });
}

/**
 * Run PowerShell with safety flags:
 * -NoProfile: prevents arbitrary profile outputs from polluting responses.
 * -ExecutionPolicy Bypass: avoids restriction on fresh Windows installations.
 */
function powershell(script, opts = {}) {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    Object.assign({ timeoutMs: 30000 }, opts),
  );
}

/** Parse JSON loosely from PowerShell stdout */
function parseJsonLoose(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** Escape a string for embedding in a PowerShell single-quoted literal */
function psQuote(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`;
}

/** Escape for a double-quoted PowerShell literal */
function psDouble(s) {
  return `"${String(s ?? '').replace(/"/g, '`"').replace(/\$/g, '`$')}"`;
}

/** A timer that can be restarted, for debouncing */
function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { if (t) clearTimeout(t); t = null; };
  return wrapped;
}

/** Clamp to an inclusive range, tolerating NaN */
function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Optional require without crashing if missing */
function optionalRequire(name) {
  try {
    return { mod: require(name), error: null };
  } catch (e) {
    return { mod: null, error: e && e.message ? e.message : String(e) };
  }
}

const log = [];
function logLine(where, message, extra) {
  const entry = { at: Date.now(), where, message: String(message), extra: extra === undefined ? null : String(extra) };
  log.push(entry);
  if (log.length > 400) log.shift();
  if (process.env.KADOWAZ_DEBUG) console.log(`[kadowaz:${where}]`, message, extra === undefined ? '' : extra);
  return entry;
}

function getLog() { return log.slice(); }

module.exports = {
  ok, fail, run, powershell, parseJsonLoose, psQuote, psDouble,
  debounce, clamp, optionalRequire, logLine, getLog,
};
