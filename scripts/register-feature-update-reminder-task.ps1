# Register a twice-yearly Windows Task Scheduler job that reminds a human to
# manually run the Windows feature update on a closed day (the feature version is
# pinned by configure-windows-updates.ps1, so the big upgrade never self-installs).
#
# Run in Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\register-feature-update-reminder-task.ps1
# Override the cadence/time if needed (default: every 26 weeks, Sunday 08:00):
#   powershell -ExecutionPolicy Bypass -File scripts\register-feature-update-reminder-task.ps1 -IntervalWeeks 26 -DayOfWeek Sunday -At 8:00AM

param(
  [int]$IntervalWeeks = 26,
  [ValidateSet("Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday")]
  [string]$DayOfWeek = "Sunday",
  [string]$At = "8:00AM"
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

$project  = Split-Path $PSScriptRoot -Parent
$script   = Join-Path $project "scripts\feature-update-reminder.ps1"
$taskName = "DreamyCafe Feature Update Reminder"

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval $IntervalWeeks -DaysOfWeek $DayOfWeek -At $At

# StartWhenAvailable so a missed fire (box off) still runs at next opportunity.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Twice-yearly reminder to manually run the pinned Windows feature update on a closed day, then re-run configure-windows-updates.ps1 to re-pin" `
  -RunLevel Highest

Write-Output "Registered '$taskName' - runs every $IntervalWeeks weeks on $DayOfWeek at $At"
Get-ScheduledTaskInfo -TaskName $taskName
