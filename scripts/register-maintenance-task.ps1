# Register a monthly Windows Task Scheduler job for DB & disk maintenance.
# Run in Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\register-maintenance-task.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

$project  = Split-Path $PSScriptRoot -Parent
$script   = Join-Path $project "scripts\db-maintenance.ps1"
$taskName = "DreamyCafe DB Maintenance"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

# First of each month at 3:00 AM - well outside trading hours and clear of the
# 9:30 PM backup, so a VACUUM never competes with a dump or live sales.
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Sunday -At 3:00AM

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Monthly PrintJob prune + VACUUM ANALYZE + desktop.log trim (keeps the POS fast over years)" `
  -RunLevel Highest

Write-Output "Registered '$taskName' - runs every 4 weeks on Sunday at 3:00 AM"
Get-ScheduledTaskInfo -TaskName $taskName
