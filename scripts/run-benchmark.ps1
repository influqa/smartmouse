param(
  [int]$MaxIterations = 20,
  [int]$RequestTimeoutSec = 1800,
  [string]$OutPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutPath)) {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutPath = Join-Path (Get-Location) ("logs/benchmark-$timestamp.json")
}

$tasks = @(
  [pscustomobject]@{
    benchmark_index = 1
    platform = 'instagram'
    agent = 'openclaw-bench-instagram-1'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to Instagram, search influencer marketing victoria, find ONE recent post, leave ONE unique friendly human-like comment referencing something specific in the post, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  },
  [pscustomobject]@{
    benchmark_index = 2
    platform = 'instagram'
    agent = 'openclaw-bench-instagram-2'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to Instagram, search seo services halifax, find ONE recent post, leave ONE unique friendly human-like comment referencing something specific in the post, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  },
  [pscustomobject]@{
    benchmark_index = 3
    platform = 'tiktok'
    agent = 'openclaw-bench-tiktok-1'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to TikTok, search content marketing brampton, find ONE recent video, leave ONE unique friendly human-like comment referencing something specific in the video, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  },
  [pscustomobject]@{
    benchmark_index = 4
    platform = 'tiktok'
    agent = 'openclaw-bench-tiktok-2'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to TikTok, search digital marketing agency montreal, find ONE recent video, leave ONE unique friendly human-like comment referencing something specific in the video, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  },
  [pscustomobject]@{
    benchmark_index = 5
    platform = 'youtube'
    agent = 'openclaw-bench-youtube-1'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to YouTube, search influencer marketing regina, find ONE recent video, leave ONE unique friendly human-like comment referencing something specific in the video, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  },
  [pscustomobject]@{
    benchmark_index = 6
    platform = 'youtube'
    agent = 'openclaw-bench-youtube-2'
    goal = 'SMARTMOUSE_TASK Goal: Open Chrome, go to YouTube, search social media marketing burnaby, find ONE recent video, leave ONE unique friendly human-like comment referencing something specific in the video, then close Chrome. Constraints: Real mouse and keyboard actions only. Open Chrome first. Complete full workflow end-to-end. Success Criteria: 1 comment posted and task marked done.'
  }
)

function Wait-ForIdle {
  param(
    [int]$TimeoutSec = 1200,
    [int]$PollSec = 8
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $status = Invoke-RestMethod -Uri 'http://localhost:7901/status' -TimeoutSec 10
      if (-not [bool]$status.is_running) {
        return $true
      }

      Write-Host ("WAIT busy run_id=$($status.current_run_id) iter=$($status.iteration)")
    } catch {
      Write-Host ("WAIT status_error=$($_.Exception.Message)")
    }

    Start-Sleep -Seconds $PollSec
  }

  return $false
}

function Invoke-BenchTask {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Task,
    [int]$TimeoutSec
  )

  if (-not (Wait-ForIdle)) {
    return [pscustomobject]@{
      benchmark_index = $Task.benchmark_index
      platform = $Task.platform
      agent = $Task.agent
      run_id = $null
      status = 'idle_timeout'
      estimated_comments_submitted = $null
      target_comments = $null
      iterations = $null
      actions_executed = $null
      completion_reason = 'Timed out waiting for SmartMouse idle state'
      final_url = $null
      chrome_closed = $null
      duration_seconds = 0
      started_at = $null
      finished_at = $null
    }
  }

  $body = @{
    goal = $Task.goal
    requesting_agent = $Task.agent
    wait_for_completion = $true
    max_iterations = $MaxIterations
  } | ConvertTo-Json -Depth 8

  $started = Get-Date

  try {
    $response = Invoke-RestMethod -Uri 'http://localhost:7901/run' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSec
    $report = $response.report
    $durationSec = [int]((Get-Date) - $started).TotalSeconds

    return [pscustomobject]@{
      benchmark_index = $Task.benchmark_index
      platform = $Task.platform
      agent = $Task.agent
      run_id = $response.run_id
      status = $report.status
      estimated_comments_submitted = $report.estimated_comments_submitted
      target_comments = $report.target_comments
      iterations = $report.iterations
      actions_executed = $report.actions_executed
      completion_reason = $report.completion_reason
      final_url = $report.final_url
      chrome_closed = $report.chrome_closed
      duration_seconds = $durationSec
      started_at = $report.started_at
      finished_at = $report.finished_at
    }
  } catch {
    $durationSec = [int]((Get-Date) - $started).TotalSeconds
    return [pscustomobject]@{
      benchmark_index = $Task.benchmark_index
      platform = $Task.platform
      agent = $Task.agent
      run_id = $null
      status = 'request_error'
      estimated_comments_submitted = $null
      target_comments = $null
      iterations = $null
      actions_executed = $null
      completion_reason = $_.Exception.Message
      final_url = $null
      chrome_closed = $null
      duration_seconds = $durationSec
      started_at = $null
      finished_at = $null
    }
  }
}

$results = @()

foreach ($task in $tasks) {
  Write-Host ("RUN_START index=$($task.benchmark_index) platform=$($task.platform) agent=$($task.agent)")

  $row = Invoke-BenchTask -Task $task -TimeoutSec $RequestTimeoutSec
  $results += $row

  Write-Host ("RUN_DONE index=$($task.benchmark_index) status=$($row.status) est_comments=$($row.estimated_comments_submitted) iter=$($row.iterations) actions=$($row.actions_executed) duration_s=$($row.duration_seconds)")

  Start-Sleep -Seconds 2
}

$total = $results.Count
$completedCount = @($results | Where-Object { $_.status -eq 'completed' }).Count
$maxCount = @($results | Where-Object { $_.status -eq 'max_iterations' }).Count
$errorCount = @($results | Where-Object { $_.status -eq 'request_error' -or $_.status -eq 'failed' -or $_.status -eq 'idle_timeout' }).Count
$maxRate = if ($total -gt 0) { [Math]::Round(($maxCount * 100.0) / $total, 2) } else { 0 }

$summary = [ordered]@{
  generated_at = (Get-Date).ToString('o')
  total_runs = $total
  completed_runs = $completedCount
  max_iterations_runs = $maxCount
  request_or_failed_runs = $errorCount
  max_iterations_rate_percent = $maxRate
  max_iterations = $MaxIterations
  results = $results
}

$parent = Split-Path -Parent $OutPath
if (-not [string]::IsNullOrWhiteSpace($parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

$summary | ConvertTo-Json -Depth 8 | Set-Content -Path $OutPath -Encoding UTF8

Write-Host ("BENCHMARK_FILE=$OutPath")
Write-Host ("SUMMARY total=$total completed=$completedCount max_iterations=$maxCount errors=$errorCount max_rate_percent=$maxRate")
