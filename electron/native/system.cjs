/**
 * System telemetry: live CPU, GPU, RAM, and temperature metrics.
 *
 * Three rules, because the panel is the one place in the app where a number is
 * read as a fact:
 *
 *  1. Every value is measured. When a source is missing the field is `null` and
 *     the panel draws `--`. Nothing here guesses, defaults or interpolates.
 *  2. `sources` names where each number came from, so the drawer can say
 *     "os.cpus · GPU Engine · ACPI" instead of implying a machine is instrumented
 *     when it is not.
 *  3. CPU is measured over the interval between OS tick samples. GPU counters
 *     use two Windows samples; slow temperature queries are cached.
 *
 * CPU and RAM are real on every platform (os.cpus() deltas, os.freemem()).
 * GPU utilisation and package temperature are Windows-only: there is no portable
 * API for either, so elsewhere they are honestly `null`.
 */

'use strict';

const os = require('node:os');
const { powershell, run, parseJsonLoose, clamp, ok, fail } = require('./util.cjs');

const IS_WINDOWS = process.platform === 'win32';

/* ------------------------------------------------------------- metrics */

let lastCpu = null;

/** Per-platform sources, filled in as values are measured. */
function blankSources() {
  return { cpu: null, gpu: null, temp: null };
}

/**
 * CPU usage from an os.cpus() tick delta.
 *
 * `os.cpus()` counters are cumulative since boot, so a single reading is the
 * average since the machine started — useless on the panel. Keeping the previous
 * sample and differencing it gives load over the last poll interval, which is
 * what a CPU meter is supposed to show.
 */
let prevTimes = null;

function cpuPercentFromDelta(previous, current) {
  if (!previous || !current) return null;
  const dIdle = current.idle - previous.idle;
  const dBusy = current.busy - previous.busy;
  const total = dIdle + dBusy;
  if (dIdle < 0 || dBusy < 0 || total <= 0) return null;
  return clamp((dBusy / total) * 100, 0, 100);
}

function cpuPercentFromTicks() {
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return null;
  const now = cpus.reduce((acc, c) => {
    acc.idle += c.times.idle;
    acc.busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
    return acc;
  }, { idle: 0, busy: 0 });
  const value = cpuPercentFromDelta(prevTimes, now);
  prevTimes = now;
  return value;
}

/** CPU activity over a real sampling interval, not a single typeperf sample. */
async function readCpu() {
  const cached = lastCpu && Date.now() - lastCpu.at < 900 ? lastCpu : null;
  if (cached) return cached;
  const value = cpuPercentFromTicks();
  if (value === null) return { value: null, source: null, at: Date.now() };
  lastCpu = { value: Math.round(value), source: 'os.cpus (active time)', at: Date.now() };
  return lastCpu;
}

/**
 * GPU usage and temperature.
 *
 * Prefer Windows engine counters for the busiest engine (similar to Task
 * Manager). Vendor utilization is a fallback and may use a different definition.
 */
const GPU_TOOLS = [
  { name: 'nvidia', command: 'nvidia-smi.exe', args: ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'] },
  { name: 'amd', command: 'amd-smi.exe', args: ['metric', '--usage', '--json'] },
];

async function gpuFromVendorTools() {
  for (const tool of GPU_TOOLS) {
    try {
      const r = await run(tool.command, tool.args, { timeoutMs: 2500 });
      if (r.code !== 0 || !r.stdout) continue;

      if (tool.name === 'nvidia') {
        const [usage, temp] = String(r.stdout).split(/[,\n]/).map((s) => parseFloat(s.trim()));
        if (!Number.isFinite(usage)) continue;
        return {
          gpu: clamp(usage, 0, 100),
          temp: Number.isFinite(temp) && temp > 0 ? clamp(temp, 0, 150) : null,
          source: 'NVIDIA',
        };
      }

      const parsed = parseJsonLoose(r.stdout);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const rawUsage = first && first.metric ? Number(first.metric.gfx_activity) : NaN;
      if (!Number.isFinite(rawUsage)) continue;
      const usage = clamp(rawUsage, 0, 100);
      const edge = first.metric.edge_temperature;
      return {
        gpu: usage,
        temp: edge !== undefined && Number.isFinite(Number(edge)) ? clamp(Number(edge), 0, 150) : null,
        source: 'AMD',
      };
    } catch {
      // try the next tool
    }
  }
  return null;
}

/** Add the per-process shares of each physical engine, then take the busiest.
 * Do not add different engines or adapters together: that overstates usage. */
function gpuPercentFromCounters(samples) {
  const totals = new Map();
  for (const sample of Array.isArray(samples) ? samples : [samples]) {
    if (!sample || typeof sample.instance !== 'string') continue;
    const match = /^pid_\d+_(luid_.+_phys_\d+_eng_\d+_engtype_.+)$/i.exec(sample.instance);
    if (!match || sample.value === null || sample.value === undefined || sample.value === '') continue;
    const value = Number(sample.value);
    if (!Number.isFinite(value) || value < 0) continue;
    const engine = match[1].toLowerCase();
    totals.set(engine, (totals.get(engine) || 0) + value);
  }
  return totals.size ? clamp(Math.max(...totals.values()), 0, 100) : null;
}

/** Windows GPU Engine counters need two samples to yield real rates. */
async function gpuFromPerformanceCounters() {
  try {
    const r = await powershell(`
$ErrorActionPreference='Stop'
$sets = @(Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage' -SampleInterval 1 -MaxSamples 2 -ErrorAction Stop)
$last = $sets[-1]
@($last.CounterSamples | Where-Object { $null -eq $_.Status -or $_.Status -eq 0 -or $_.Status -eq 1 } | ForEach-Object {
  @{ instance = $_.InstanceName; value = $_.CookedValue }
}) | ConvertTo-Json -Compress
`, { timeoutMs: 5000 });
    if (r.code !== 0 || r.timedOut) return null;
    const samples = parseJsonLoose(r.stdout);
    const gpu = gpuPercentFromCounters(samples);
    return gpu === null ? null : { gpu: Math.round(gpu), temp: null, source: 'Windows GPU Engine (busiest adapter)' };
  } catch {
    return null;
  }
}

async function gpuStats() {
  if (!IS_WINDOWS) return { gpu: null, temp: null, source: null };
  const counters = await gpuFromPerformanceCounters();
  if (counters) return counters;
  return await gpuFromVendorTools() || { gpu: null, temp: null, source: null };
}

/**
 * CPU temperature via ACPI thermal zone.
 * Returns null if not exposed by the motherboard — many desktops do not expose it.
 */
let cachedTemp = null;
let tempCheckedAt = 0;
async function cpuTemp() {
  if (!IS_WINDOWS) return null;
  if (Date.now() - tempCheckedAt < 30000) return cachedTemp;
  tempCheckedAt = Date.now();
  cachedTemp = null;
  try {
    const r = await powershell(`
$ErrorActionPreference='SilentlyContinue'
$t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue
if ($t) { [math]::Round((($t | Select-Object -First 1).CurrentTemperature / 10) - 273.15, 1) } else { '' }
`, { timeoutMs: 4000 });

    const v = parseFloat(String(r.stdout || '').trim());
    if (!Number.isFinite(v) || v < 0 || v > 120) return null;
    cachedTemp = v;
    return v;
  } catch {
    return null;
  }
}

/**
 * Primary telemetry snapshot function.
 *
 * `null` means "not measured"; it is never replaced with a plausible number.
 */
async function getMetrics() {
  const sources = blankSources();
  try {
    // GPU counters and temperature probes can take seconds on Windows. Sample
    // CPU after they finish so the value we broadcast is recent, rather than
    // showing the interval from before those slow probes ran.
    const [gpu, temp] = await Promise.all([gpuStats(), cpuTemp()]);
    const cpu = await readCpu();

    const total = os.totalmem();
    const free = os.freemem();
    const ramPct = total ? Math.round(((total - free) / total) * 100) : null;

    sources.cpu = cpu.source;
    sources.gpu = gpu.source;
    // An ACPI thermal zone is not necessarily the CPU package. Name the
    // actual source; if absent, a vendor GPU sensor may be available.
    sources.temp = temp !== null ? 'ACPI' : gpu.temp !== null ? gpu.source : null;

    return ok({
      cpu: cpu.value,
      ram: ramPct,
      gpu: gpu.gpu,
      temp: temp !== null ? Math.round(temp) : gpu.temp !== null ? Math.round(gpu.temp) : null,
      sources,
      detail: {
        cores: os.cpus().length,
        ramUsedGb: Math.round(((total - free) / 1e9) * 10) / 10,
        ramTotalGb: Math.round((total / 1e9) * 10) / 10,
        gpuSource: gpu.source,
        tempSource: sources.temp,
      },
    });
  } catch (err) {
    return fail(`Failed to read system metrics: ${err.message}`);
  }
}

/** The sentence the drawer shows under the meters. */
function describeSources(sources) {
  const parts = [];
  if (sources.cpu) parts.push(`CPU ${sources.cpu}`);
  if (sources.gpu) parts.push(`GPU ${sources.gpu}`);
  if (sources.temp) parts.push(`temp ${sources.temp}`);
  return parts.join(' · ');
}

async function selfTest() {
  const m = await getMetrics();
  const okNow = m.ok;
  const gpu = await gpuStats();
  const temp = await cpuTemp();
  const shown = (v) => (v === null || v === undefined ? '--' : v);
  return {
    ok: okNow,
    detail: [
      okNow
        ? `cpu ${shown(m.value.cpu)}%, ram ${shown(m.value.ram)}%${m.value.sources.cpu ? ` (${m.value.sources.cpu})` : ''}`
        : `metrics failed: ${m.error}`,
      gpu.source ? `gpu ${shown(gpu.gpu)}% from ${gpu.source}` : 'no GPU source on this machine',
      temp !== null ? `cpu temp ${temp}°C (ACPI)` : 'no ACPI temp sensor',
      `${os.cpus().length} cores, ${(os.totalmem() / 1e9).toFixed(1)} GB total RAM`,
    ].join(' · '),
  };
}

module.exports = {
  getMetrics,
  cpuPercent: async () => {
    const r = await readCpu();
    return r.value;
  },
  gpuStats,
  cpuTemp,
  cpuPercentFromDelta, gpuPercentFromCounters,
  describeSources,
  selfTest,
  IS_WINDOWS,
};
