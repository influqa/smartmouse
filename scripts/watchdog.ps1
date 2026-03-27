param(
  [int]$Port = 7901,
  [int]$PollSeconds = 15,
  [int]$UnhealthySeconds = 45,
  [int]$StallSeconds = 180,
  [switch]$StopOnExit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:SmartMouseRoot = Split-Path -Parent $PSScriptRoot
$script:LogsDir = Join-Path $script:SmartMouseRoot 'logs'
$script:StatePath = Join-Path $script:LogsDir 'watchdog-state.json'
$script:WatchdogLogPath = Join-Path $script:LogsDir 'watchdog.jsonl'
$script:StatusUrl = "http://localhost:$Port/status"
$script:LastHealthError = $null
$script:State = $null
$script:Mutex = $null
$script:StartedByWatchdog = New-Object 'System.Collections.Generic.HashSet[int]'

New-Item -ItemType Directory -Force -Path $script:LogsDir | Out-Null

function New-WatchdogState {
  return [ordered]@{
    port = $Port
    watchdog_pid = $PID
    last_status_at = $null
    unhealthy_since = $null
    stalled_since = $null
    last_progress_at = $null
    last_run_id = $null
    last_iteration = -1
    current_service_pid = $null
    last_start_at = $null
    last_restart_reason = $null
  }
}

function Load-WatchdogState {
  $state = New-WatchdogState

  if (Test-Path $script:StatePath) {
    try {
      $raw = Get-Content -Path $script:StatePath -Raw | ConvertFrom-Json
      foreach ($property in $raw.PSObject.Properties) {
        $state[$property.Name] = $property.Value
      }
    } catch {
      Write-WatchdogLog -Level 'warn' -Event 'state_reload_failed' -Details @{
        error = $_.Exception.Message
      }
    }
  }

  $state.watchdog_pid = $PID
  return $state
}

function Save-WatchdogState {
  param(
    [hashtable]$State
  )

  $State | ConvertTo-Json -Depth 8 | Set-Content -Path $script:StatePath -Encoding UTF8
}

function Write-WatchdogLog {
  param(
    [string]$Level,
    [string]$Event,
    [hashtable]$Details = @{}
  )

  $entry = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    level = $Level
    event = $Event
    port = $Port
    details = $Details
  }

  Add-Content -Path $script:WatchdogLogPath -Value ($entry | ConvertTo-Json -Compress -Depth 8)
}

function Enter-WatchdogMutex {
  $name = "Global\SmartMouseWatchdog_$Port"
  $script:Mutex = New-Object System.Threading.Mutex($false, $name)

  try {
    if (-not $script:Mutex.WaitOne(0, $false)) {
      throw "Another SmartMouse watchdog instance is already running for port $Port."
    }
  } catch [System.Threading.AbandonedMutexException] {
  }
}

function Exit-WatchdogMutex {
  if ($null -eq $script:Mutex) {
    return
  }

  try {
    $script:Mutex.ReleaseMutex()
  } catch {
  }

  $script:Mutex.Dispose()
}

function Resolve-BunPath {
  $command = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    $command = Get-Command bun -ErrorAction SilentlyContinue
  }

  if ($null -ne $command) {
    return $command.Source
  }

  $fallback = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
  if (Test-Path $fallback) {
    return $fallback
  }

  throw 'Unable to find bun.exe. Install Bun or add it to PATH before starting the SmartMouse watchdog.'
}

function Get-PortOwnerProcessId {
  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $connection) {
      return [int]$connection.OwningProcess
    }
  } catch {
  }

  $lines = netstat -ano -p tcp | Select-String -Pattern 'LISTENING'
  foreach ($line in $lines) {
    $parts = ($line.ToString() -split '\s+') | Where-Object { $_ }
    if ($parts.Length -lt 5) {
      continue
    }

    if ($parts[1] -match ":$Port$" -and $parts[3] -eq 'LISTENING') {
      return [int]$parts[4]
    }
  }

  return $null
}

function Get-ProcessInfo {
  param(
    [int]$ProcessId
  )

  try {
    return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
  } catch {
    return $null
  }
}

function Get-ProcessCommandLine {
  param(
    [int]$ProcessId
  )

  $processInfo = Get-ProcessInfo -ProcessId $ProcessId
  if ($null -eq $processInfo) {
    return $null
  }

  return [string]$processInfo.CommandLine
}

function Test-ProcessExists {
  param(
    [int]$ProcessId
  )

  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Test-IsSmartMouseProcess {
  param(
    [int]$ProcessId
  )

  $processInfo = Get-ProcessInfo -ProcessId $ProcessId
  if ($null -eq $processInfo) {
    return $false
  }

  $commandLine = [string]$processInfo.CommandLine
  $name = [string]$processInfo.Name

  if ($commandLine -match 'index\.ts' -and $commandLine -match "--port=$Port") {
    return $true
  }

  if ($commandLine -match 'smartmouse-ts' -and $commandLine -match "--port=$Port") {
    return $true
  }

  if ($name -match '^bun(\.exe)?$' -and $commandLine -match "--port=$Port") {
    return $true
  }

  return $false
}

function Get-SmartMouseStatus {
  $script:LastHealthError = $null

  try {
    return Invoke-RestMethod -Method Get -Uri $script:StatusUrl -TimeoutSec 10
  } catch {
    $script:LastHealthError = $_.Exception.Message
    return $null
  }
}

function Start-SmartMouseProcess {
  $bunPath = Resolve-BunPath
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdoutLog = Join-Path $script:LogsDir ("smartmouse-$timestamp.out.log")
  $stderrLog = Join-Path $script:LogsDir ("smartmouse-$timestamp.err.log")
  $process = Start-Process -FilePath $bunPath -ArgumentList @('index.ts', "--port=$Port") -WorkingDirectory $script:SmartMouseRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru -WindowStyle Hidden

  [void]$script:StartedByWatchdog.Add([int]$process.Id)

  return [ordered]@{
    pid = [int]$process.Id
    stdout_log = $stdoutLog
    stderr_log = $stderrLog
  }
}

function Stop-SmartMouseProcess {
  param(
    [int]$ProcessId,
    [string]$Reason
  )

  if (-not (Test-IsSmartMouseProcess -ProcessId $ProcessId)) {
    Write-WatchdogLog -Level 'error' -Event 'restart_blocked_non_smartmouse_owner' -Details @{
      reason = $Reason
      pid = $ProcessId
      command_line = (Get-ProcessCommandLine -ProcessId $ProcessId)
    }
    return $false
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    return $true
  } catch {
    Write-WatchdogLog -Level 'error' -Event 'stop_failed' -Details @{
      reason = $Reason
      pid = $ProcessId
      error = $_.Exception.Message
    }
    return $false
  }
}

function Restart-SmartMouse {
  param(
    [string]$Reason,
    [switch]$IfMissingOnly
  )

  $ownerPid = Get-PortOwnerProcessId
  if ($IfMissingOnly -and $null -ne $ownerPid) {
    return $false
  }

  if ($null -ne $ownerPid) {
    if (-not (Stop-SmartMouseProcess -ProcessId $ownerPid -Reason $Reason)) {
      return $false
    }
  }

  $startInfo = Start-SmartMouseProcess
  $now = (Get-Date).ToString('o')

  $script:State.current_service_pid = $startInfo.pid
  $script:State.last_start_at = $now
  $script:State.last_restart_reason = $Reason
  $script:State.unhealthy_since = $null
  $script:State.stalled_since = $null
  $script:State.last_progress_at = $null
  $script:State.last_run_id = $null
  $script:State.last_iteration = -1
  Save-WatchdogState -State $script:State

  $eventName = if ($null -ne $ownerPid) { 'service_restarted' } else { 'service_started' }
  $level = if ($null -ne $ownerPid) { 'warn' } else { 'info' }

  Write-WatchdogLog -Level $level -Event $eventName -Details @{
    reason = $Reason
    old_pid = $ownerPid
    new_pid = $startInfo.pid
    stdout_log = [System.IO.Path]::GetFileName($startInfo.stdout_log)
    stderr_log = [System.IO.Path]::GetFileName($startInfo.stderr_log)
  }

  Start-Sleep -Seconds 2
  return $true
}

function Reset-IdleProgressState {
  param(
    [datetime]$Now
  )

  $script:State.last_run_id = $null
  $script:State.last_iteration = -1
  $script:State.stalled_since = $null
  $script:State.last_progress_at = $Now.ToString('o')
}

function Handle-HealthyStatus {
  param(
    $Status,
    [datetime]$Now
  )

  $ownerPid = Get-PortOwnerProcessId
  if ($null -ne $ownerPid) {
    $script:State.current_service_pid = $ownerPid
  }

  if ($null -ne $script:State.unhealthy_since) {
    Write-WatchdogLog -Level 'info' -Event 'service_recovered' -Details @{
      pid = $script:State.current_service_pid
      run_id = $Status.current_run_id
      iteration = $Status.iteration
    }
  }

  $script:State.last_status_at = $Now.ToString('o')
  $script:State.unhealthy_since = $null

  if (-not [bool]$Status.is_running) {
    Reset-IdleProgressState -Now $Now
    return
  }

  $runId = [string]$Status.current_run_id
  $iteration = [int]$Status.iteration
  $lastRunId = [string]$script:State.last_run_id
  $lastIteration = if ($null -ne $script:State.last_iteration) { [int]$script:State.last_iteration } else { -1 }

  if (($runId -ne $lastRunId) -or ($iteration -gt $lastIteration)) {
    if ($runId -ne $lastRunId) {
      Write-WatchdogLog -Level 'info' -Event 'run_progress_started' -Details @{
        run_id = $runId
        iteration = $iteration
      }
    }

    $script:State.last_run_id = $runId
    $script:State.last_iteration = $iteration
    $script:State.last_progress_at = $Now.ToString('o')
    $script:State.stalled_since = $null
    return
  }

  if ($null -eq $script:State.stalled_since) {
    $script:State.stalled_since = $Now.ToString('o')
    Write-WatchdogLog -Level 'warn' -Event 'potential_stall' -Details @{
      run_id = $runId
      iteration = $iteration
    }
    return
  }

  $stalledForSeconds = [int](New-TimeSpan -Start ([datetime]$script:State.stalled_since) -End $Now).TotalSeconds
  if ($stalledForSeconds -lt $StallSeconds) {
    return
  }

  [void](Restart-SmartMouse -Reason "stall_detected run_id=$runId iteration=$iteration stalled_for=${stalledForSeconds}s")
}

function Handle-UnhealthyStatus {
  param(
    [datetime]$Now
  )

  $ownerPid = Get-PortOwnerProcessId
  if ($null -eq $ownerPid) {
    $statePid = $script:State.current_service_pid
    if ($null -ne $statePid -and -not (Test-ProcessExists -ProcessId ([int]$statePid))) {
      Write-WatchdogLog -Level 'warn' -Event 'stale_service_pid_cleared' -Details @{
        stale_pid = $statePid
      }
      $script:State.current_service_pid = $null
    }
  } else {
    $script:State.current_service_pid = $ownerPid
  }

  if ($null -eq $script:State.unhealthy_since) {
    $script:State.unhealthy_since = $Now.ToString('o')
    Write-WatchdogLog -Level 'warn' -Event 'status_unreachable' -Details @{
      error = $script:LastHealthError
      current_service_pid = $script:State.current_service_pid
      owner_pid = $ownerPid
    }
    return
  }

  $unhealthyForSeconds = [int](New-TimeSpan -Start ([datetime]$script:State.unhealthy_since) -End $Now).TotalSeconds
  if ($unhealthyForSeconds -lt $UnhealthySeconds) {
    return
  }

  [void](Restart-SmartMouse -Reason "status_unreachable for ${unhealthyForSeconds}s: $script:LastHealthError")
}

function Stop-StartedServiceOnExit {
  if (-not $StopOnExit) {
    return
  }

  $ownerPid = Get-PortOwnerProcessId
  if ($null -eq $ownerPid) {
    return
  }

  if ($script:StartedByWatchdog.Contains([int]$ownerPid) -and (Test-IsSmartMouseProcess -ProcessId $ownerPid)) {
    try {
      Stop-Process -Id $ownerPid -Force -ErrorAction Stop
      Write-WatchdogLog -Level 'info' -Event 'service_stopped_on_exit' -Details @{
        pid = $ownerPid
      }
    } catch {
      Write-WatchdogLog -Level 'error' -Event 'service_stop_on_exit_failed' -Details @{
        pid = $ownerPid
        error = $_.Exception.Message
      }
    }
  }
}

Enter-WatchdogMutex

try {
  $script:State = Load-WatchdogState
  Save-WatchdogState -State $script:State

  Write-Host "SmartMouse watchdog monitoring http://localhost:$Port/status"
  Write-Host "Watchdog log: $script:WatchdogLogPath"

  Write-WatchdogLog -Level 'info' -Event 'watchdog_started' -Details @{
    watchdog_pid = $PID
    poll_seconds = $PollSeconds
    unhealthy_seconds = $UnhealthySeconds
    stall_seconds = $StallSeconds
    stop_on_exit = [bool]$StopOnExit
  }

  $initialStatus = Get-SmartMouseStatus
  if ($null -eq $initialStatus) {
    $ownerPid = Get-PortOwnerProcessId
    if ($null -eq $ownerPid) {
      [void](Restart-SmartMouse -Reason 'initial_start' -IfMissingOnly)
    } elseif (-not (Test-IsSmartMouseProcess -ProcessId $ownerPid)) {
      Write-WatchdogLog -Level 'error' -Event 'port_owned_by_non_smartmouse' -Details @{
        pid = $ownerPid
        command_line = (Get-ProcessCommandLine -ProcessId $ownerPid)
      }
    } else {
      $script:State.current_service_pid = $ownerPid
      Save-WatchdogState -State $script:State
      Write-WatchdogLog -Level 'warn' -Event 'monitoring_existing_unhealthy_service' -Details @{
        pid = $ownerPid
        error = $script:LastHealthError
      }
    }
  } else {
    $ownerPid = Get-PortOwnerProcessId
    if ($null -ne $ownerPid) {
      $script:State.current_service_pid = $ownerPid
      Save-WatchdogState -State $script:State
    }

    Write-WatchdogLog -Level 'info' -Event 'monitoring_existing_service' -Details @{
      pid = $ownerPid
      run_id = $initialStatus.current_run_id
      iteration = $initialStatus.iteration
    }
  }

  while ($true) {
    try {
      $script:State = Load-WatchdogState
      $now = Get-Date
      $status = Get-SmartMouseStatus

      if ($null -ne $status) {
        Handle-HealthyStatus -Status $status -Now $now
      } else {
        Handle-UnhealthyStatus -Now $now
      }

      Save-WatchdogState -State $script:State
    } catch {
      Write-WatchdogLog -Level 'error' -Event 'watchdog_loop_error' -Details @{
        error = $_.Exception.Message
      }
    }

    Start-Sleep -Seconds $PollSeconds
  }
} finally {
  Stop-StartedServiceOnExit
  Write-WatchdogLog -Level 'info' -Event 'watchdog_stopped' -Details @{
    watchdog_pid = $PID
  }
  Exit-WatchdogMutex
}
