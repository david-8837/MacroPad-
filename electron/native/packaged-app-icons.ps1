# Find logo images for installed Microsoft Store / packaged apps. This returns
# paths only; Electron reads the PNG itself, without executing app-supplied code.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$results = @()
foreach ($package in @(Get-AppxPackage)) {
  try {
    if (-not $package.InstallLocation -or -not $package.PackageFamilyName) { continue }
    $root = [IO.Path]::GetFullPath($package.InstallLocation).TrimEnd('\') + '\'
    $manifestPath = Join-Path $root 'AppxManifest.xml'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { continue }
    [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
    foreach ($application in @($manifest.SelectNodes("//*[local-name()='Applications']/*[local-name()='Application']"))) {
      $id = $application.GetAttribute('Id')
      $visual = $application.SelectSingleNode("./*[local-name()='VisualElements']")
      if (-not $id -or -not $visual) { continue }
      $logo = $visual.GetAttribute('Square44x44Logo')
      if (-not $logo) { $logo = $visual.GetAttribute('Square150x150Logo') }
      if (-not $logo) { continue }
      $logoPath = [IO.Path]::GetFullPath((Join-Path $root $logo))
      if (-not $logoPath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { continue }
      if ([IO.Path]::GetExtension($logoPath).ToLowerInvariant() -ne '.png') { continue }
      $folder = [IO.Path]::GetDirectoryName($logoPath)
      $stem = [IO.Path]::GetFileNameWithoutExtension($logoPath)
      $candidates = @(Get-ChildItem -LiteralPath $folder -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Extension -ieq '.png' -and ($_.BaseName -ieq $stem -or $_.BaseName.StartsWith($stem + '.', [StringComparison]::OrdinalIgnoreCase))
      } | Sort-Object @{ Expression = {
        if ($_.Name -match 'targetsize-(32|48)(_|\.)') { 0 }
        elseif ($_.Name -match 'scale-(100|125|150|200)(_|\.)') { 1 }
        elseif ($_.BaseName -ieq $stem) { 2 }
        else { 3 }
      } }, Name)
      if ($candidates.Count -gt 0) {
        $results += @{ id = "$($package.PackageFamilyName)!$id"; path = $candidates[0].FullName }
      }
    }
  } catch {
    # A single inaccessible or malformed package must not break discovery.
  }
}
ConvertTo-Json -InputObject @($results) -Compress -Depth 3
