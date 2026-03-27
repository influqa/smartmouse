param(
  [int]$Port = 7901,
  [int]$PollSeconds = 15,
  [int]$UnhealthySeconds = 45,
  [int]$StallSeconds = 180,
  [int]$RestartDelaySeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$smartMouseRoot = Split-Path -Parent $PSScriptRoot
$supervisorScript = Join-Path $PSScriptRoot 'watchdog-supervisor.ps1'
$powershellPath = Join-Path $PSHOME 'powershell.exe'

if (-not (Test-Path $supervisorScript)) {
  throw "Watchdog supervisor script not found: $supervisorScript"
}

function Get-ExistingSupervisorProcessId {
  try {
    $processes = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'"
  } catch {
    return $null
  }

  foreach ($processInfo in $processes) {
    $commandLine = [string]$processInfo.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) {
      continue
    }

    if ($commandLine -match 'watchdog-supervisor\.ps1' -and $commandLine -match "(^|\s)-Port\s+$Port(\s|$)") {
      return [int]$processInfo.ProcessId
    }
  }

  return $null
}

$existingSupervisorPid = Get-ExistingSupervisorProcessId
if ($null -ne $existingSupervisorPid) {
  Write-Host "SmartMouse watchdog supervisor already running (PID $existingSupervisorPid)."
  Write-Host "Watchdog log: $(Join-Path $smartMouseRoot 'logs\watchdog.jsonl')"
  exit 0
}

$arguments = @(
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  $supervisorScript,
  '-Port',
  $Port,
  '-PollSeconds',
  $PollSeconds,
  '-UnhealthySeconds',
  $UnhealthySeconds,
  '-StallSeconds',
  $StallSeconds,
  '-RestartDelaySeconds',
  $RestartDelaySeconds
)

$process = Start-Process -FilePath $powershellPath -ArgumentList $arguments -WorkingDirectory $smartMouseRoot -PassThru -WindowStyle Hidden

Write-Host "SmartMouse watchdog supervisor started in background (PID $($process.Id))."
Write-Host "Watchdog log: $(Join-Path $smartMouseRoot 'logs\watchdog.jsonl')"