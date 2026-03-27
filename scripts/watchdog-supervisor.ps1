param(
  [int]$Port = 7901,
  [int]$PollSeconds = 15,
  [int]$UnhealthySeconds = 45,
  [int]$StallSeconds = 180,
  [int]$RestartDelaySeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:SmartMouseRoot = Split-Path -Parent $PSScriptRoot
$script:WatchdogScript = Join-Path $PSScriptRoot 'watchdog.ps1'
$script:PowerShellPath = Join-Path $PSHOME 'powershell.exe'
$script:SupervisorMutex = $null

if (-not (Test-Path $script:WatchdogScript)) {
  throw "Watchdog script not found: $script:WatchdogScript"
}

function Enter-SupervisorMutex {
  $mutexName = "Global\SmartMouseWatchdogSupervisor_$Port"
  $script:SupervisorMutex = New-Object System.Threading.Mutex($false, $mutexName)

  try {
    if (-not $script:SupervisorMutex.WaitOne(0, $false)) {
      Write-Host "SmartMouse watchdog supervisor already active for port $Port."
      exit 0
    }
  } catch [System.Threading.AbandonedMutexException] {
  }
}

function Exit-SupervisorMutex {
  if ($null -eq $script:SupervisorMutex) {
    return
  }

  try {
    $script:SupervisorMutex.ReleaseMutex()
  } catch {
  }

  $script:SupervisorMutex.Dispose()
}

function Get-ExistingWatchdogProcessId {
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

    if ($commandLine -match 'watchdog\.ps1' -and $commandLine -match "(^|\s)-Port\s+$Port(\s|$)") {
      return [int]$processInfo.ProcessId
    }
  }

  return $null
}

Enter-SupervisorMutex

try {
  Write-Host "SmartMouse watchdog supervisor active for port $Port."

  while ($true) {
    try {
      $existingWatchdogPid = Get-ExistingWatchdogProcessId
      if ($null -ne $existingWatchdogPid) {
        Start-Sleep -Seconds ([Math]::Max($PollSeconds, 5))
        continue
      }

      $arguments = @(
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $script:WatchdogScript,
        '-Port',
        $Port,
        '-PollSeconds',
        $PollSeconds,
        '-UnhealthySeconds',
        $UnhealthySeconds,
        '-StallSeconds',
        $StallSeconds
      )

      $watchdogProcess = Start-Process -FilePath $script:PowerShellPath -ArgumentList $arguments -WorkingDirectory $script:SmartMouseRoot -PassThru -WindowStyle Hidden
      Write-Host "Started SmartMouse watchdog child (PID $($watchdogProcess.Id))."

      Wait-Process -Id $watchdogProcess.Id
      Write-Warning "SmartMouse watchdog child exited (PID $($watchdogProcess.Id)). Restarting in $RestartDelaySeconds second(s)."
    } catch {
      Write-Warning "Watchdog supervisor loop error: $($_.Exception.Message). Restarting in $RestartDelaySeconds second(s)."
    }

    Start-Sleep -Seconds ([Math]::Max($RestartDelaySeconds, 1))
  }
} finally {
  Exit-SupervisorMutex
}