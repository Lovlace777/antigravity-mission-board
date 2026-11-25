<#
.SYNOPSIS
  Removes Windows Desktop, Start Menu, and Startup shortcuts for Antigravity Mission Board.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity Mission Board.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Antigravity Mission Board (Demo).lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity Mission Board.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Antigravity Mission Board (Demo).lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\Antigravity Mission Board.lnk')
)

$removed = 0
foreach ($path in $targets) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "[OK] Removed shortcut: $path"
    $removed += 1
  }
}

if ($removed -eq 0) {
  Write-Host "No Antigravity Mission Board shortcuts were found."
} else {
  Write-Host "Removed $removed shortcut(s)."
}
