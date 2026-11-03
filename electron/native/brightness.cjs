'use strict';

const { powershell } = require('./util.cjs');

// DDC/CI is optional and monitor/driver dependent. Probe monitor brightness VCP
// code 0x10 and change only the first controllable display; release every
// physical monitor handle even when a probe fails. This runs in a separate
// time-limited process because monitor firmware can respond slowly.
async function adjustExternalBrightness(direction) {
  const up = direction > 0 ? '$true' : '$false';
  const script = `
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ZeroMonitorBrightness {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct PHYSICAL_MONITOR {
    public IntPtr handle;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string description;
  }
  public delegate bool MonitorCallback(IntPtr monitor, IntPtr dc, ref RECT rect, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorCallback callback, IntPtr data);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr monitor, out uint count);
  [DllImport("dxva2.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr monitor, uint count, [Out] PHYSICAL_MONITOR[] physical);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool DestroyPhysicalMonitors(uint count, [In] PHYSICAL_MONITOR[] physical);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr monitor, byte code, out uint type, out uint current, out uint max);
  [DllImport("dxva2.dll", SetLastError=true)] static extern bool SetVCPFeature(IntPtr monitor, byte code, uint value);

  public static int Change(bool up) {
    List<IntPtr> displays = new List<IntPtr>();
    MonitorCallback callback = delegate(IntPtr monitor, IntPtr dc, ref RECT rect, IntPtr data) { displays.Add(monitor); return true; };
    if (!EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, callback, IntPtr.Zero)) throw new Exception("Windows could not enumerate displays.");
    foreach (IntPtr display in displays) {
      uint count;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(display, out count) || count == 0 || count > 64) continue;
      PHYSICAL_MONITOR[] monitors = new PHYSICAL_MONITOR[(int)count];
      if (!GetPhysicalMonitorsFromHMONITOR(display, count, monitors)) continue;
      try {
        foreach (PHYSICAL_MONITOR monitor in monitors) {
          uint type, current, max;
          if (!GetVCPFeatureAndVCPFeatureReply(monitor.handle, 0x10, out type, out current, out max) || max == 0 || current > max) continue;
          uint step = Math.Max(1U, max / 10U);
          uint target = up ? (uint)Math.Min((ulong)max, (ulong)current + step) : (current > step ? current - step : 0U);
          if (target != current && !SetVCPFeature(monitor.handle, 0x10, target)) throw new Exception("The monitor rejected the DDC/CI brightness change.");
          return (int)Math.Round(100.0 * target / max);
        }
      } finally { DestroyPhysicalMonitors(count, monitors); }
    }
    throw new Exception("No DDC/CI brightness-capable external monitor was found.");
  }
}
'@ -Language CSharp
$level = [ZeroMonitorBrightness]::Change(${up})
@{ success = $true; level = $level } | ConvertTo-Json -Compress
} catch {
@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
  const result = await powershell(script, { timeoutMs: 20000 });
  if (result.timedOut) return { success: false, error: 'External monitor brightness control timed out.' };
  if (result.code !== 0) return { success: false, error: `External monitor brightness control failed: ${result.stderr || 'PowerShell could not run.'}` };
  try {
    const response = JSON.parse(result.stdout);
    if (response.success === true && Number.isInteger(response.level) && response.level >= 0 && response.level <= 100) {
      return { success: true, brightness: response.level };
    }
    if (response.success === false && typeof response.error === 'string') return { success: false, error: response.error };
  } catch { /* Invalid data does not confirm the command. */ }
  return { success: false, error: 'Windows did not confirm external monitor brightness control.' };
}

module.exports = { adjustExternalBrightness };
