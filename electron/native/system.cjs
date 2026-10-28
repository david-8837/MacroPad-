/**
 * System telemetry: live CPU, GPU, RAM, and temperature metrics.
 *
 * Three rules, because the panel is the one place in the app where a number is
 * read as a fact:
 *
 *  1. Every value is measured. When a source is missing the field is `null` and
 *     the panel draws `--`. Nothing here guesses, defaults or interpolates.
 *  2. `sources` names where each number came from, so the drawer can say
 *     "typeperf · NVIDIA · ACPI" instead of implying a machine is instrumented
 *     when it is not.
 *  3. Fast paths only. CPU is sampled from typeperf.exe idle time (about 200 ms)
 *     or from an os.cpus() delta in-process; nothing here runs a 1–3 s WMI query
 *     on the 1.2 s broadcast tick.
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

function cpuPercentFromTicks() {
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return null;

  const now = cpus.reduce((acc, c) => {
    acc.idle += c.times.idle;
    acc.busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
    return acc;
  }, { idle: 0, busy: 0 });

  const prev = prevTimes;
  prevTimes = now;
  if (!prev) return null; // first call: no interval to measure yet

  const dIdle = now.idle - prev.idle;
  const dBusy = now.busy - prev.busy;
  const total = dIdle + dBusy;
  if (total <= 0) return null;
  return clamp((dBusy / total) * 100, 0, 100);
}

/**
 * CPU usage from system idle time.
 * typeperf.exe samples in ~200 ms and is standard across Windows 10 & 11.
 */
async function cpuPercentWindows() {
  try {
    const r = await run('typeperf.exe', ['\\Processor(_Total)\\% Processor Time', '-sc', '1', '-y'], { timeoutMs: 3000 });
    const lines = String(r.stdout || '').split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    const parts = last ? last.split(',').map((s) => s.replace(/^"|"$/g, '')) : [];
    const value = clamp(parseFloat(parts[1] ?? ''), 0, 100);
    if (parts.length > 1 && Number.isFinite(value)) return value;
  } catch {
    // fall through to the tick delta
  }
  return null;
}

/** CPU percent plus the source that produced it. */
async function readCpu() {
  const cached = lastCpu && Date.now() - lastCpu.at < 900 ? lastCpu : null;
  if (cached) return cached;

  let value = null;
  let source = null;

  if (IS_WINDOWS) {
    value = await cpuPercentWindows();
    if (value !== null) source = 'typeperf';
  }

  if (value === null) {
    value = cpuPercentFromTicks();
    if (value !== null) source = 'os.cpus';
  }

  // Nothing measurable yet (first tick on a non-Windows host): reuse the previous
  // number rather than inventing one.
  if (value === null) {
    if (lastCpu) return lastCpu;
    return { value: null, source: null, at: Date.now() };
  }

  const sample = { value: Math.round(value), source, at: Date.now() };
  lastCpu = sample;
  return sample;
}

/**
 * GPU usage and temperature.
 *
 * Order matters: vendor tools also report temperature, so they win. The Windows
 * "GPU Engine" performance counters need no vendor tool at all and work on any
 * Windows 10 1709+ machine, but they only give utilisation.
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
      const usage = first && first.metric ? clamp(first.metric.gfx_activity, 0, 100) : null;
      if (usage === null || !Number.isFinite(usage)) continue;
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

/** Sum of the 3D engine GPU counters — present on any modern Windows GPU. */
async function gpuFromPerformanceCounters() {
  try {
    const r = await powershell(`
$ErrorActionPreference='SilentlyContinue'
$s = (Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples
if ($s) { [math]::Round((($s | Measure-Object -Property CookedValue -Sum).Sum), 0) } else { '' }
`, { timeoutMs: 3000 });
    const v = parseFloat(String(r.stdout || '').trim());
    if (!Number.isFinite(v) || v < 0) return null;
    return { gpu: clamp(v, 0, 100), temp: null, source: 'GPU Engine' };
  } catch {
    return null;
  }
}

async function gpuStats() {
  const vendor = await gpuFromVendorTools();
  if (vendor) return vendor;
  if (IS_WINDOWS) {
    const counters = await gpuFromPerformanceCounters();
    if (counters) return counters;
  }
  return { gpu: null, temp: null, source: null };
}

/**
 * CPU temperature via ACPI thermal zone.
 * Returns null if not exposed by the motherboard — many desktops do not expose it.
 */
async function cpuTemp() {
  if (!IS_WINDOWS) return null;
  try {
    const r = await powershell(`
$ErrorActionPreference='SilentlyContinue'
$t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue
if ($t) { [math]::Round((($t | Select-Object -First 1).CurrentTemperature / 10) - 273.15, 1) } else { '' }
`, { timeoutMs: 4000 });

    const v = parseFloat(String(r.stdout || '').trim());
    if (!Number.isFinite(v) || v < 0 || v > 120) return null;
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
    const [cpu, gpu, temp] = await Promise.all([readCpu(), gpuStats(), cpuTemp()]);

    const total = os.totalmem();
    const free = os.freemem();
    const ramPct = total ? Math.round(((total - free) / total) * 100) : null;

    sources.cpu = cpu.source;
    sources.gpu = gpu.source;
    // A package sensor is better than a GPU reading for the panel's single temp
    // slot, and the drawer names whichever one answered.
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
  describeSources,
  selfTest,
  IS_WINDOWS,
};
