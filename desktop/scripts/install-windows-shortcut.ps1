<#
.SYNOPSIS
  Creates zero-terminal native Windows shortcuts for Antigravity Mission Board.
.DESCRIPTION
  Installs Desktop and Start Menu (.lnk) shortcuts that launch Electron directly
  with zero CMD/PowerShell window, using the custom multi-resolution app icon.
  Pass -EnableAutoStart to also register silent login auto-start (Startup folder).
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$EnableAutoStart,
  [switch]$Demo,
  [switch]$NoDesktop,
  [switch]$NoStartMenu
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DesktopDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RepoRoot   = (Resolve-Path (Join-Path $DesktopDir '..')).Path
$ElectronExe = Join-Path $DesktopDir 'node_modules\electron\dist\electron.exe'
$IconPath    = Join-Path $DesktopDir 'assets\icon.ico'
$ServerDist  = Join-Path $RepoRoot 'server\dist\server\src\index.js'

$ElectronInstallJs = Join-Path $DesktopDir 'node_modules\electron\install.js'
if (-not (Test-Path -LiteralPath $ElectronExe) -and (Test-Path -LiteralPath $ElectronInstallJs)) {
  Write-Host "Downloading Electron runtime binary..."
  & node $ElectronInstallJs
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to download Electron binary."
    exit 1
  }
}

if (-not (Test-Path -LiteralPath $ElectronExe)) {
  Write-Error "Electron binary not found at: $ElectronExe`nPlease run 'npm run setup:desktop' first."
  exit 1
}

if (-not (Test-Path -LiteralPath $ServerDist)) {
  Write-Warning "Built server was not found at $ServerDist. Run 'npm run build' before launching the shortcut."
}

$ShortcutName = if ($Demo) { 'Antigravity Mission Board (Demo).lnk' } else { 'Antigravity Mission Board.lnk' }
$BaseArgs = "`"$DesktopDir`""
if ($Demo) {
  $BaseArgs = "$BaseArgs --demo"
}

function New-AppShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$ShortcutPath,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [Parameter(Mandatory = $true)][string]$Description
  )

  if (-not $PSCmdlet.ShouldProcess($ShortcutPath, "Create Windows shortcut -> $ElectronExe $Arguments")) {
    return
  }

  $parentDir = Split-Path -Parent $ShortcutPath
  if (-not (Test-Path -LiteralPath $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $ElectronExe
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.Description = $Description
  $shortcut.WindowStyle = 1
  if (Test-Path -LiteralPath $IconPath) {
    $shortcut.IconLocation = "$IconPath,0"
  }
  $shortcut.Save()
  Write-Host "[OK] Created shortcut: $ShortcutPath"
}

$created = @()

if (-not $NoDesktop) {
  $desktopPath = [Environment]::GetFolderPath('Desktop')
  $desktopLnk = Join-Path $desktopPath $ShortcutName
  New-AppShortcut -ShortcutPath $desktopLnk -Arguments $BaseArgs -Description 'Antigravity Mission Board - Always-On-Top Floating Widget & Live Monitor'
  $created += $desktopLnk
}

if (-not $NoStartMenu) {
  $startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $startMenuLnk = Join-Path $startMenuDir $ShortcutName
  New-AppShortcut -ShortcutPath $startMenuLnk -Arguments $BaseArgs -Description 'Antigravity Mission Board - Always-On-Top Floating Widget & Live Monitor'
  $created += $startMenuLnk
}

if ($EnableAutoStart) {
  $startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  $startupLnk = Join-Path $startupDir 'Antigravity Mission Board.lnk'
  $autoArgs = "`"$DesktopDir`" --autostart"
  if ($Demo) {
    $autoArgs = "$autoArgs --demo"
  }
  New-AppShortcut -ShortcutPath $startupLnk -Arguments $autoArgs -Description 'Antigravity Mission Board (Launch silently at login)'
  $created += $startupLnk
}

Write-Host ""
Write-Host "Antigravity Mission Board shortcuts installed ($($created.Count) created)."
Write-Host "Double-click the Desktop or Start Menu icon to launch with ZERO terminal window."
