# Query Windows' Global System Media Transport Controls (SMTC).
# The PowerShell WinRT projection exposes IAsyncOperation<T>, whose AsTask is a
# static extension method, not an instance method on the operation.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
  $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation' + [char]96 + '1')
} | Select-Object -First 1
if (-not $asTask) { throw 'Windows Runtime async bridge is unavailable.' }

function Await-Operation($operation, [type]$resultType) {
  if ($null -eq $operation) { throw 'Windows returned an empty async operation.' }
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}

$manager = Await-Operation ($managerType::RequestAsync()) $managerType
if ($null -eq $manager) { throw 'Windows did not return a media session manager.' }
$current = $manager.GetCurrentSession()
$sessions = @($manager.GetSessions())
$results = @()
$errors = @()
foreach ($session in $sessions) {
  try {
    $props = Await-Operation ($session.TryGetMediaPropertiesAsync()) $propertiesType
    $playback = $session.GetPlaybackInfo()
    # Some players do not expose a timeline. Keep their title and playback
    # status rather than discarding the entire session.
    $position = 0; $duration = 0; $lastUpdated = $null
    try {
      $timeline = $session.GetTimelineProperties()
      if ($timeline) {
        $position = $timeline.Position.Ticks
        $duration = $timeline.EndTime.Ticks
        $lastUpdated = $timeline.LastUpdatedTime.ToUniversalTime().ToString('o')
      }
    } catch { }
    $results += @{
      title = [string]$props.Title
      artist = [string]$props.Artist
      album = [string]$props.AlbumTitle
      app = [string]$session.SourceAppUserModelId
      status = [string]$playback.PlaybackStatus
      current = ($null -ne $current -and $session.SourceAppUserModelId -eq $current.SourceAppUserModelId)
      position = $position
      duration = $duration
      lastUpdated = $lastUpdated
    }
  } catch {
    $errors += $_.Exception.Message
  }
}
if ($sessions.Count -gt 0 -and $results.Count -eq 0 -and $errors.Count -gt 0) {
  throw ('Could not read the Windows media sessions: ' + $errors[0])
}
@{ sessions = @($results) } | ConvertTo-Json -Depth 5 -Compress
