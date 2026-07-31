# Registers the nightly database backup task (scripts\backup-db.ps1).
#
# Runs as the interactive user - no Administrator shell required:
#   powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
#
# ---------------------------------------------------------------------------------------
# Two deliberate choices here, both about Google Drive.
#
# 1. LogonType Interactive, NOT S4U ("run whether user is logged on or not"). Drive for
#    Desktop mounts G:\My Drive inside a USER SESSION - the drive letter simply does not
#    exist to a session-0 task. Under S4U the local dump would keep succeeding while the
#    off-site mirror silently never ran, which is the exact half-failure autologon exists
#    to prevent. This task must run in the logged-on session.
#
# 2. RunLevel Limited, NOT Highest. pg_dump needs no elevation, and an elevated process
#    gets a different token that cannot always see user-session drive mounts. Unelevated
#    is the configuration verified working on this box (2026-07-30), so it is the one
#    registered. Limited also means this script needs no admin rights itself.
# ---------------------------------------------------------------------------------------

param(
  [string]$UserId = "$env:USERDOMAIN\$env:USERNAME",
  [datetime]$At = "9:30PM"
)

$ErrorActionPreference = "Stop"

$project  = Split-Path $PSScriptRoot -Parent
$script   = Join-Path $project "scripts\backup-db.ps1"
$taskName = "DreamyCafe DB Backup"

if (-not (Test-Path $script)) { throw "Missing $script" }

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

# StartWhenAvailable so a run missed while the PC was off fires at the next opportunity
# instead of being skipped until tomorrow.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Nightly pg_dump of the dreamycafe database, verified with pg_restore and mirrored to Google Drive" | Out-Null

Write-Output "Registered '$taskName' for $UserId - daily at $($At.ToString('h:mm tt'))"
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
