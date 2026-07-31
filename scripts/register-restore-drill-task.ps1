# Register a quarterly Windows Task Scheduler job for the restore drill
# Run in Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\register-restore-drill-task.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

$project = Split-Path $PSScriptRoot -Parent
$script  = Join-Path $project "scripts\restore-drill.ps1"
$taskName = "DreamyCafe Restore Drill"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 13 -DaysOfWeek Monday -At 9:00AM

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Quarterly pg_restore drill into restore_test (safe, no live data touched)" `
  -RunLevel Highest

Write-Output "Registered '$taskName' - runs every 13 weeks on Monday at 9:00 AM"
Get-ScheduledTaskInfo -TaskName $taskName
