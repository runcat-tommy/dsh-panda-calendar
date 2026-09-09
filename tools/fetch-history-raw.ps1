#!/usr/bin/env pwsh
# Fill every missing zh-wikipedia "today in history" raw payload in
# $env:TEMP\panda-history-raw for ALL days (366 incl. 2/29). Existing files
# are skipped, so re-runs only chase the still-missing tail. Single sequential
# request stream with a gentle 1.1s inter-request pause + exponential backoff
# on 429/timeouts (known zh.wikipedia throttling).
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/fetch-history-raw.ps1
param(
  [int]$PauseMs = 1100,
  [int]$MaxTries = 6
)
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:TEMP "panda-history-raw"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ua = "dsh-panda-calendar/1.2.0 (history snapshot builder)"
$daysInMonth = @(31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
$want = 0; $had = 0; $failed = @()
for ($m = 1; $m -le 12; $m++) {
  for ($d = 1; $d -le $daysInMonth[$m - 1]; $d++) {
    $sel = Join-Path $dir "$m-$d-selected.json"
    $day = Join-Path $dir "$m-$d-day.json"
    $needSel = -not (Test-Path $sel) -or (Get-Item $sel).Length -lt 50
    $needDay = -not (Test-Path $day) -or (Get-Item $day).Length -lt 50
    if (-not $needSel -and -not $needDay) { $had++; continue }
    $want++
    if ($needSel) {
      $ok = $false
      for ($try = 1; $try -le $MaxTries -and -not $ok; $try++) {
        try {
          $u = "https://zh.wikipedia.org/api/rest_v1/feed/onthisday/selected/$m/$d"
          $r = Invoke-WebRequest -Uri $u -TimeoutSec 30 -UseBasicParsing -Headers @{ "User-Agent" = $ua }
          [System.IO.File]::WriteAllText($sel, $r.Content, [System.Text.UTF8Encoding]::new($false))
          $ok = $true
        } catch {
          Write-Output "retry selected $m/$d try$try"
          Start-Sleep -Seconds (6 * $try)
        }
      }
      if (-not $ok) { $failed += "selected $m/$d" }
    }
    if ($needDay) {
      $ok = $false
      for ($try = 1; $try -le $MaxTries -and -not $ok; $try++) {
        try {
          $page = [System.Uri]::EscapeDataString("${m}月${d}日")
          $u = "https://zh.wikipedia.org/w/api.php?action=parse&page=$page&prop=wikitext&format=json&formatversion=2"
          $r = Invoke-WebRequest -Uri $u -TimeoutSec 30 -UseBasicParsing -Headers @{ "User-Agent" = $ua }
          [System.IO.File]::WriteAllText($day, $r.Content, [System.Text.UTF8Encoding]::new($false))
          $ok = $true
        } catch {
          Write-Output "retry day $m/$d try$try"
          Start-Sleep -Seconds (6 * $try)
        }
      }
      if (-not $ok) { $failed += "day $m/$d" }
    }
    Start-Sleep -Milliseconds $PauseMs
  }
  Write-Output "month $m done"
}
Write-Output "summary wanted=$want alreadyHad=$had failed=$($failed.Count)"
if ($failed.Count) { Write-Output ("FAILED: " + ($failed -join "; ")) }
Write-Output "gap-fill complete"
