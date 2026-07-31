# DreamyCafe - twice-yearly nudge to manually run the Windows feature update.
#
# The POS host pins its Windows feature version (see configure-windows-updates.ps1)
# so the big semi-annual upgrade never installs itself mid-trade. That means a
# human has to run it deliberately, on a closed day. A pinned version left alone
# forever eventually falls out of servicing and stops getting security patches -
# so this fires twice a year to make sure that day gets scheduled.
#
# Registered as a Windows Scheduled Task by register-feature-update-reminder-task.ps1.
# Writes a durable log line, pings healthchecks.io, and best-effort pops a message
# to any signed-in session on the mini-PC.
#
# Alerting: set FEATURE_UPDATE_HEALTHCHECK_URL (in .env or the environment) to a
# healthchecks.io ping URL. This is the ONLY channel that reaches a human, and it is
# the reason the ping exists: this box runs 24/7 headless behind autologon + immediate
# lock, so on the day this actually fires there is normally nobody signed in. The
# msg.exe popup lands on a locked screen and the log file is never read - both are
# belt-and-braces, not the alert.
#
# It pings <url>/FAIL deliberately, not the plain URL. A plain ping means "up" and
# sends no notification; /fail raises one immediately and carries the message body.
# It also makes the dashboard honest: the check stays DOWN while the feature update
# is still outstanding. Clear it by pinging the plain URL (or resolving it in the
# dashboard) once the update is done and re-pinned.
#
# NOTE: there is deliberately NO fallback to BACKUP_HEALTHCHECK_URL, unlike
# db-maintenance.ps1. Pinging the backup check's /fail would announce a
# BACKUP FAILURE that never happened - a false alarm on the one check that must stay
# trustworthy. Unset means no off-box alert, and the log says so.

$ErrorActionPreference = "Continue"

$project = Split-Path $PSScriptRoot -Parent

function Get-EnvValue($Name) {
  $existing = [Environment]::GetEnvironmentVariable($Name)
  if ($existing) { return $existing }
  $envFile = Join-Path $project ".env"
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern "^\s*$Name\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return ($line.Line -replace "^\s*$Name\s*=", '').Trim().Trim('"').Trim("'") }
  }
  return $null
}
$logsDir = Join-Path $project "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Force -Path $logsDir | Out-Null }
$log = Join-Path $logsDir "feature-update-reminder.log"

$cv = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" -ErrorAction SilentlyContinue
$current = if ($cv -and $cv.DisplayVersion) { $cv.DisplayVersion } else { "current" }

$msg = "DreamyCafe: time to run the Windows feature update. This box is pinned to $current. On a CLOSED day, unpin/bump the feature version, install the update, then re-run scripts\configure-windows-updates.ps1 to re-pin."

$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
Add-Content -Path $log -Value "[$stamp] $msg"

# The off-box alert. Never let a ping failure (offline, DNS, dead check) throw: a
# reminder that crashes is worse than one that only managed to write its log.
$HealthcheckUrl = Get-EnvValue "FEATURE_UPDATE_HEALTHCHECK_URL"
if ($HealthcheckUrl) {
  try {
    Invoke-WebRequest -Uri "$HealthcheckUrl/fail" -Method Post -Body $msg `
      -UseBasicParsing -TimeoutSec 10 | Out-Null
    Add-Content -Path $log -Value "[$stamp] Alert sent (healthchecks.io /fail)."
  } catch {
    Add-Content -Path $log -Value "[$stamp] ALERT FAILED: $($_.Exception.Message) - nobody has been told. Check FEATURE_UPDATE_HEALTHCHECK_URL."
  }
} else {
  Add-Content -Path $log -Value "[$stamp] NO ALERT SENT - FEATURE_UPDATE_HEALTHCHECK_URL is not set, so this reminder reached nobody off this machine."
}

# Best-effort on-screen nudge for whoever is signed in to the mini-PC. msg.exe is
# absent/irrelevant on a headless box, so never let it fail the task.
try {
  $msgExe = Join-Path $env:WINDIR "System32\msg.exe"
  if (Test-Path $msgExe) { & $msgExe * $msg 2>$null }
} catch { }
