param(
  [switch]$CreateScheduledTask = $true,
  [switch]$StartNow = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$smartMouseRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $smartMouseRoot 'start-supervised.cmd'

if (-not (Test-Path $startScript)) {
  throw "SmartMouse start script not found: $startScript"
}

# 1) Startup-folder launcher (works without admin)
$startupFolder = [Environment]::GetFolderPath('Startup')
if (-not $startupFolder) {
  throw 'Unable to resolve Windows Startup folder for current user.'
}
youtube.com$launcherPath = Join-Path $startupFolder 'start-smartmouse-supervised.cmd'
$launcherContent = @"
@echo off
call "$startScript"
"@
Set-Content -Path $launcherPath -Value $launcherContent -Encoding ASCII

Write-Host "Created Startup launcher: $launcherPath"

# 2) Optional Scheduled Task (extra reliability)
if ($CreateScheduledTask) {
  try {
    $taskName = 'SmartMouse Watchdog (OpenClaw)'
    $taskArgs = '/c "' + $startScript + '"'
    $action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $taskArgs
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts SmartMouse watchdog for OpenClaw at user logon.' -Force | Out-Null
    Write-Host "Registered Scheduled Task: $taskName"
  } catch {
    Write-Warning "Scheduled task registration failed (startup launcher is still active): $($_.Exception.Message)"
  }
}

if ($StartNow) {
  Write-Host 'Starting SmartMouse now...'
  & $startScript
}

Write-Host 'SmartMouse autostart setup complete.'
