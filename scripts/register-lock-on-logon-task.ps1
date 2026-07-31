# Registers a logon task that locks the console session straight after an unattended
# autologon (see scripts\lock-on-logon.ps1 for why autologon is needed at all).
#
# Register this BEFORE enabling autologon, so the very first unattended boot is never
# left sitting on an unlocked desktop.
#
# Runs as the interactive user - no Administrator shell required:
#   powershell -ExecutionPolicy Bypass -File scripts\register-lock-on-logon-task.ps1

param(
  [string]$UserId = "$env:USERDOMAIN\$env:USERNAME"
)

$ErrorActionPreference = "Stop"

$project  = Split-Path $PSScriptRoot -Parent
$script   = Join-Path $project "scripts\lock-on-logon.ps1"
$taskName = "DreamyCafe Lock On Logon"

if (-not (Test-Path $script)) { throw "Missing $script" }

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId

# Interactive principal: the task must run inside the logged-on session, because
# LockWorkStation only affects the session it is called from.
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited

# AllowStartIfOnBatteries so the lock still fires if the box is ever on a UPS/battery,
# and no execution time limit so a slow logon can't leave the desktop unlocked.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -DontStopOnIdleEnd

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "Locks the console session after autologon, so the unattended 4am reboot mounts G:\My Drive for backups without leaving the till unlocked" | Out-Null

Write-Output "Registered '$taskName' for $UserId (console sessions only)"
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
