/**
 * System telemetry: live CPU, GPU, RAM, and temperature metrics.
 *
 * Metrics are gathered from Windows subsystems that answer in < 300 ms.
 * CPU is sampled from typeperf.exe idle time with fallback to os.cpus(),
 * avoiding slow WMI queries that take 1-3 seconds.
 */

'use strict';

const os = require('node:os');
const { powershell, run, parseJsonLoose, clamp, logLine, ok, fail } = require('./util.cjs');

/* ------------------------------------------------------------- metrics */

let lastCpu = null;

/**
 * CPU usage from system idle time.
 * typeperf.exe samples in ~200 ms and is standard across Windows 10 & 11.
 */
async function cpuPercent() {
  if (lastCpu !== null && Date.now() - lastCpu.at < 900) return lastCpu.value;

  try {
    const r = await run('typeperf.exe', ['\\Processor(_Total)\\% Processor Time', '-sc', '1', '-y'], { timeoutMs: 3000 });
    const lines = String(r.stdout || '').split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    const parts = last ? last.split(',').map((s) => s.replace(/^"|"$/g, '')) : [];
    const value = clamp(parseFloat(parts[1] ?? ''), 0, 100);

    if (Number.isFinite(value) && parts.length > 1 && !Number.isNaN(value)) {
      lastCpu = { value, at: Date.now() };
      return value;
    }
  } catch (err) {
    // fall through to os.cpus()
  }

  // Fallback: derive from os.cpus()
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return 0;
  const total = cpus.reduce((acc, c) => {
    acc.idle += c.times.idle;
    acc.busy += c.times.user + c.times.nice + c.times.sys + c.times.irq;
    return acc;
  }, { idle: 0, busy: 0 });

  const pct = clamp((total.busy / Math.max(1, total.busy + total.idle)) * 100, 0, 100);
  lastCpu = { value: pct, at: Date.now() };
  return pct;
}

/**
 * GPU usage and temperature.
 * Probes nvidia-smi.exe and amd-smi.exe if available.
 */
const GPU_TOOLS = [
  { name: 'nvidia', command: 'nvidia-smi.exe', args: ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'] },
  { name: 'amd', command: 'amd-smi.exe', args: ['metric', '--usage', '--json'] },
];

async function gpuStats() {
  for (const tool of GPU_TOOLS) {
    try {
      const r = await run(tool.command, tool.args, { timeoutMs: 2500 });
      if (r.code !== 0 || !r.stdout) continue;

      if (tool.name === 'nvidia') {
        const [usage, temp] = String(r.stdout).split(/[,\n]/).map((s) => parseFloat(s.trim()));
        return {
          gpu: clamp(usage, 0, 100),
          temp: clamp(temp, 0, 150),
          source: 'NVIDIA',
        };
      }

      const parsed = parseJsonLoose(r.stdout);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const usage = first && first.metric ? clamp(first.metric.gfx_activity, 0, 100) : 0;
      const temp = first && first.metric && first.metric.edge_temperature
        ? clamp(Number(first.metric.edge_temperature), 0, 150) : 0;
      return { gpu: usage, temp, source: 'AMD' };
    } catch {
      // try next
    }
  }
  return { gpu: 0, temp: 0, source: null };
}

/**
 * CPU temperature via ACPI thermal zone.
 * Returns null if not exposed by the motherboard.
 */
async function cpuTemp() {
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
 */
async function getMetrics() {
  try {
    const [cpu, gpu, temp] = await Promise.all([cpuPercent(), gpuStats(), cpuTemp()]);
    const total = os.totalmem();
    const free = os.freemem();
    const ramPct = total ? Math.round(((total - free) / total) * 100) : 0;

    return ok({
      cpu: Math.round(cpu),
      ram: ramPct,
      gpu: Math.round(gpu.gpu),
      temp: temp !== null ? Math.round(temp) : Math.round(gpu.temp || 45),
      detail: {
        cores: os.cpus().length,
        ramUsedGb: Math.round(((total - free) / 1e9) * 10) / 10,
        ramTotalGb: Math.round((total / 1e9) * 10) / 10,
        gpuSource: gpu.source,
        tempSource: temp !== null ? 'ACPI' : gpu.source || null,
      },
    });
  } catch (err) {
    return fail(`Failed to read system metrics: ${err.message}`);
  }
}

async function selfTest() {
  const m = await getMetrics();
  const cpuOk = m.ok;
  const temp = await cpuTemp();
  const gpu = await gpuStats();
  return {
    ok: cpuOk,
    detail: [
      cpuOk ? `cpu ${m.value.cpu}%, ram ${m.value.ram}%` : `metrics failed: ${m.error}`,
      gpu.source ? `gpu from ${gpu.source}` : 'no dedicated GPU tool found',
      temp !== null ? `cpu temp ${temp}°C` : 'no ACPI temp sensor',
      `${os.cpus().length} cores, ${(os.totalmem() / 1e9).toFixed(1)} GB total RAM`,
    ].join(' · '),
  };
}

module.exports = {
  getMetrics,
  cpuPercent,
  gpuStats,
  cpuTemp,
  selfTest,
};

