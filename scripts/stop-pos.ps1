$ErrorActionPreference = 'SilentlyContinue'
$root = if ($env:DREAMYCAFE_ROOT) { $env:DREAMYCAFE_ROOT } else { Split-Path $PSScriptRoot -Parent }
$rootNorm = $root.ToLower()
$selfPid = $PID

Write-Host "Stopping DreamyCafe (root: $root)..."

# Track which pids we've already stopped so a process caught by more than one
# rule (e.g. the Node server is both on port 3000 and matches by command line)
# is only reported and killed once.
$killed = @{}
function Stop-Reported($processId, $label) {
  if (-not $processId -or $killed.ContainsKey([int]$processId)) { return }
  $killed[[int]$processId] = $true
  Write-Host "  $label PID $processId"
  Stop-Process -Id $processId -Force
}

# --- Electron desktop shell (matched by repo root in its command line) ---
$electron = Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='DreamyCafe.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($rootNorm) }
if ($electron) { $electron | ForEach-Object { Stop-Reported $_.ProcessId 'Electron' } }
else { Write-Host "  Electron: not running" }

# --- Node server ---
# The launcher runs `npm run start` (prisma migrate deploy && next start) via a
# shell, so the worker is a node.exe. Match it by command line (repo root or the
# `next` signature) so a server that is still migrating (not yet listening on
# 3000) or wedged is caught too, not only one that currently holds the port.
$node = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object {
    $_.ProcessId -ne $selfPid -and $_.CommandLine -and (
      $_.CommandLine.ToLower().Contains($rootNorm) -or
      $_.CommandLine.ToLower().Contains('next start') -or
      $_.CommandLine.ToLower().Contains('next-server')
    )
  }
# Also anything currently listening on port 3000 (the original detection).
$portPids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { $_.OwningProcess }

$foundNode = $false
if ($node) { $node | ForEach-Object { Stop-Reported $_.ProcessId 'Node server'; $foundNode = $true } }
if ($portPids) { $portPids | ForEach-Object { Stop-Reported $_ 'Port 3000'; $foundNode = $true } }
if (-not $foundNode) { Write-Host "  Node server: not running (or managed by an NSSM service)" }

# --- Cloudflare tunnel ---
$tunnel = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*dreamycafe*' }
if ($tunnel) { $tunnel | ForEach-Object { Stop-Reported $_.ProcessId 'cloudflared' } }
else { Write-Host "  cloudflared: not running" }

Start-Sleep -Seconds 1
$still = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($still) {
  Write-Host ""
  Write-Host "Warning: port 3000 is still in use. End remaining Node.js tasks in Task Manager." -ForegroundColor Yellow
} else {
  Write-Host ""
  Write-Host "DreamyCafe stopped. Run start-pos.bat to start again, or enable NSSM services." -ForegroundColor Green
}
