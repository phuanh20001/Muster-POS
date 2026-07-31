# Locks the workstation immediately after an unattended autologon.
#
# Why autologon exists at all: Google Drive for Desktop runs in a USER SESSION, not as a
# service. After the ~04:00 forced update reboot nobody is signed in, so G:\My Drive never
# mounts and the off-site backup mirror in backup-db.ps1 silently stops - the local backup
# still succeeds, which is exactly what makes it easy to miss. Autologon restores the
# session; this script makes sure that session isn't left sitting unlocked overnight.
#
# ---------------------------------------------------------------------------------------
# The guard is UPTIME-based, and deliberately not SESSIONNAME-based.
#
# The obvious guard - skip unless $env:SESSIONNAME -eq 'Console' - reads correct and is
# actively misleading. Without autologon, an RDP logon creates a fresh session reporting
# 'RDP-Tcp#0', so the check appears to work. WITH autologon the console session already
# exists, an RDP connection TAKES OVER that session (Windows 11 Pro allows one interactive
# session per user), and processes in it report SESSIONNAME='Console' - so the guard passes
# and locks a human's live remote session. It fails precisely in the configuration this
# script is written for. Verified the hard way on 2026-07-29.
#
# Uptime encodes the actual intent: the only logon this task should act on is the one
# Windows performs by itself at boot. Any logon minutes later is a human who does not want
# their screen locked.
#
# DEPENDENCY: this guard requires Windows FAST STARTUP to stay disabled (done 2026-07-30 via
# `powercfg /h off`; confirm with `powercfg /a`, which must list Fast Startup as unavailable).
# With Fast Startup, "shut down" hibernates the kernel session and the next power-on RESUMES
# it, so LastBootUpTime can still report the last full boot. The guard would then see a large
# uptime, skip, and leave an autologon desktop unlocked - the exact failure it exists to
# prevent. Re-enabling hibernation on this box silently breaks this script.
# ---------------------------------------------------------------------------------------
#
# Use -DryRun to test the guard without locking anything.

param(
  [int]$MaxBootAgeMinutes = 5,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Task Scheduler history and the 4800 "workstation locked" audit are both OFF by default on
# this box, so a silent unattended lock leaves no evidence either way. Log it here instead -
# otherwise the only signal is a task exit code that looks identical whether the guard
# skipped or the console was actually locked.
$logDir = Join-Path (Split-Path $PSScriptRoot -Parent) "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "lock-on-logon.log"
function Log($msg) { Add-Content -Path $logFile -Value "$(Get-Date -Format s)  $msg" -Encoding utf8 }

$bootAge = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$mins = [math]::Round($bootAge.TotalMinutes, 1)

if ($bootAge.TotalMinutes -gt $MaxBootAgeMinutes) {
  Log "skipped - booted $mins min ago (> $MaxBootAgeMinutes), so this is a human logon, not the boot-time autologon"
  exit 0
}

if ($DryRun) {
  Log "DRY RUN - would lock (booted $mins min ago, session '$env:SESSIONNAME')"
  Write-Output "would LOCK (booted $mins min ago)"
  exit 0
}

# Let the shell and Drive finish starting before the screen locks. Locking does not stop
# either - the session keeps running, which is the whole point - but racing the shell can
# leave the lock screen behind an unpainted desktop.
Start-Sleep -Seconds 10

rundll32.exe user32.dll,LockWorkStation
Log "console session locked after autologon (booted $mins min ago)"
