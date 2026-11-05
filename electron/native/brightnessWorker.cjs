'use strict';
const { createKeyWorker } = require('./fastKeys.cjs');

// Separate helper: a slow monitor must not block keyboard input.
const WORKER = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
function Adjust-Brightness([bool]$up) {

$ErrorActionPreference = 'Stop'
$attempted = $false
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
  if ($up) {
    $higher = @($levels | Where-Object { $_ -gt $current })
    $candidates = @($higher | Where-Object { $_ -ge ($current + 10) })
    $target = if ($candidates.Count) { $candidates[0] } elseif ($higher.Count) { $higher[$higher.Count - 1] } else { $current }
  } else {
    $lower = @($levels | Where-Object { $_ -lt $current })
    $candidates = @($lower | Where-Object { $_ -le ($current - 10) })
    $target = if ($candidates.Count) { $candidates[$candidates.Count - 1] } elseif ($lower.Count) { $lower[0] } else { $current }
  }
  if ($target -ne $current) {
    # Some CIM providers return no ReturnValue even though the write succeeds.
    # Never interpret a missing value as a non-zero error, and do not try a
    # second display after a write was attempted: that could change two screens.
    $attempted = $true
    $result = Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]0; Brightness = [byte]$target }
    $code = if ($null -ne $result -and $null -ne $result.ReturnValue) { $result.ReturnValue } elseif ($result -is [ValueType]) { $result } else { $null }
    if ($null -ne $code -and [int]$code -ne 0) { throw "The display rejected the brightness change ($code)." }
    $confirmed = $false
    for ($i = 0; $i -lt 10; $i++) {
      Start-Sleep -Milliseconds 150
      $reading = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Where-Object { $_.Active -and $_.InstanceName -eq $display.InstanceName } | Select-Object -First 1
      if ($reading -and [int]$reading.CurrentBrightness -eq $target) { $confirmed = $true; break }
    }
    if (-not $confirmed) { throw 'The brightness request was sent, but Windows could not confirm the new level. Check the display.' }
  }
  @{ success = $true; level = $target; atLimit = ($target -eq $current) } | ConvertTo-Json -Compress
} catch {
  @{ success = $false; error = $_.Exception.Message; attempted = $attempted } | ConvertTo-Json -Compress
}
}
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $id = 0
  try {
    $request = ConvertFrom-Json -InputObject $line -ErrorAction Stop
    $id = [int]$request.id
    if ($request.kind -ne 'brightness') { throw 'Unsupported display operation.' }
    $json = Adjust-Brightness ([bool]$request.up)
    $reply = ConvertFrom-Json -InputObject $json -ErrorAction Stop
    $reply | Add-Member -NotePropertyName id -NotePropertyValue $id
  } catch {
    $reply = @{ id = $id; success = $false; attempted = $true; error = [string]$_.Exception.Message }
  }
  [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;
const worker = createKeyWorker({ workerScript: WORKER, timeoutMs: 15000, label: 'Windows brightness helper' });
module.exports = { WORKER, start: () => { if (process.platform === 'win32') worker.start(); },
  send: up => process.platform === 'win32' ? worker.send({ kind: 'brightness', up }) : Promise.resolve({ success:false, error:'Display brightness control requires Windows.' }),
  stop: () => worker.stop() };
