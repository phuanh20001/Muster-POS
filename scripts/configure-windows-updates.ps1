# DreamyCafe - configure Windows Update for the 24/7 mini-PC POS host.
#
# Goal: stay patched against security holes automatically, but never let Windows
# surprise-reboot during trading hours, and never let a big "feature update"
# (e.g. 25H2 -> 26H1) install itself unattended. On a revenue-critical POS the
# reboot timing and the feature-upgrade timing are the two real risks; monthly
# security patches are welcome as long as the restart lands overnight.
#
# What this sets (all machine-wide policy, honoured on Windows 11 Pro):
#   1. Active hours 06:00-18:00  -> no automatic restart during the trading day.
#   2. Scheduled install + forced restart at ~04:00 -> pending reboots land in
#      the closed window, even if the box is left signed in.
#   3. Quality (security) updates auto-install, with a short settle buffer so a
#      bad Patch-Tuesday build is usually pulled before it reaches this box.
#   4. Feature updates PINNED to the version this box is already on (detected at
#      run time) -> the semi-annual big upgrade only happens when YOU run it
#      on a closed day and re-run this script to re-pin. See the twice-yearly
#      reminder in scripts\register-feature-update-reminder-task.ps1.
#   5. Delivery Optimization: stop Windows sharing update files peer-to-peer over
#      the shop's internet connection, and cap background download bandwidth. That
#      one uplink also carries card payments and online orders.
#   6. Power: never sleep/hibernate on AC (a sleeping POS drops off the LAN).
#
# This changes system-wide policy + power settings. Run it ON THE MINI-PC, in an
# Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\configure-windows-updates.ps1
# Defaults suit a ~6am-6pm cafe; override per-shop, e.g.:
#   powershell -ExecutionPolicy Bypass -File scripts\configure-windows-updates.ps1 -ActiveHoursStart 5 -ActiveHoursEnd 19 -RebootHour 4

param(
  # Start/end of the "do not auto-restart" window (0-23, local time). Windows
  # caps active hours at an 18-hour span; 06-18 is a 12h window with headroom.
  [int]$ActiveHoursStart = 6,
  [int]$ActiveHoursEnd   = 18,

  # Hour (0-23) to install pending updates and force any needed restart. Pick a
  # time the shop is reliably closed AND clear of the 21:30 backup / 03:00 DB
  # maintenance jobs. 04:00 sits after both.
  [int]$RebootHour = 4,

  # Days to hold a monthly quality/security update before installing it, letting
  # a bad build get pulled first. 0-30; a few days is a sensible insurance buffer.
  [int]$QualityDeferDays = 4,

  # Percentage of the internet link Windows may use for BACKGROUND update
  # downloads. The default is uncapped, which on a small-business connection can
  # crowd out the card reader and online orders mid-service. 1-100.
  [int]$MaxUpdateBandwidthPercent = 40,

  # Leave Delivery Optimization peering at Windows' default (peer-to-peer sharing
  # over the internet ON). Set this only if the shop deliberately wants it.
  [switch]$AllowUpdatePeering,

  # Skip the powercfg sleep/hibernate changes (set this if power is managed
  # elsewhere, e.g. a custom power plan or Group Policy).
  [switch]$SkipPowerConfig
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell (right-click -> Run as administrator)"
}

if ($ActiveHoursStart -lt 0 -or $ActiveHoursStart -gt 23 -or $ActiveHoursEnd -lt 0 -or $ActiveHoursEnd -gt 23) {
  throw "ActiveHoursStart/End must be 0-23"
}
if ((($ActiveHoursEnd - $ActiveHoursStart + 24) % 24) -gt 18) {
  throw "Active hours span cannot exceed 18 hours (Windows limit). Narrow the window."
}
if ($RebootHour -lt 0 -or $RebootHour -gt 23) { throw "RebootHour must be 0-23" }
if ($QualityDeferDays -lt 0 -or $QualityDeferDays -gt 30) { throw "QualityDeferDays must be 0-30" }
if ($MaxUpdateBandwidthPercent -lt 1 -or $MaxUpdateBandwidthPercent -gt 100) { throw "MaxUpdateBandwidthPercent must be 1-100" }

# --- Detect the feature version to pin to (whatever this box is already on) -----
$cv = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion"
$displayVersion = $cv.DisplayVersion              # e.g. "25H2"
$build = [int]$cv.CurrentBuildNumber
$productVersion = if ($build -ge 22000) { "Windows 11" } else { "Windows 10" }
if ([string]::IsNullOrWhiteSpace($displayVersion)) {
  throw "Could not read DisplayVersion from CurrentVersion - cannot pin the feature update safely. Aborting."
}

$wu = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate"
$au = "$wu\AU"

function Set-PolicyValue($path, $name, $value, $type) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $type -Force | Out-Null
}

Write-Host "Configuring Windows Update policy for the POS host..." -ForegroundColor Cyan
Write-Host ("  Detected: {0} (build {1}), feature version {2}" -f $productVersion, $build, $displayVersion)

# --- 1. Active hours: no auto-restart during trading --------------------------
Set-PolicyValue $wu "SetActiveHours"   1                 "DWord"
Set-PolicyValue $wu "ActiveHoursStart" $ActiveHoursStart "DWord"
Set-PolicyValue $wu "ActiveHoursEnd"   $ActiveHoursEnd   "DWord"

# --- 2. Auto-install + force the restart into the closed window ----------------
# AUOptions=4: auto download and schedule the install. ScheduledInstallDay=0:
# every day. AlwaysAutoRebootAtScheduledTime forces the pending restart at the
# scheduled time even if the box was left signed in, after a short countdown.
Set-PolicyValue $au "NoAutoUpdate"        0            "DWord"
Set-PolicyValue $au "AUOptions"           4            "DWord"
Set-PolicyValue $au "ScheduledInstallDay" 0            "DWord"
Set-PolicyValue $au "ScheduledInstallTime" $RebootHour "DWord"
Set-PolicyValue $au "AlwaysAutoRebootAtScheduledTime"        1  "DWord"
Set-PolicyValue $au "AlwaysAutoRebootAtScheduledTimeMinutes" 15 "DWord"

# --- 3. Quality (security) updates: install, with a short settle buffer --------
Set-PolicyValue $wu "DeferQualityUpdates"            1                 "DWord"
Set-PolicyValue $wu "DeferQualityUpdatesPeriodInDays" $QualityDeferDays "DWord"

# --- 4. Feature updates: pin to the current version (manual bump only) ---------
# TargetReleaseVersion pinning is the reliable way to hold a feature version on
# Win 11 Pro (more dependable than DeferFeatureUpdatesPeriodInDays). Windows will
# not jump to the next feature release until TargetReleaseVersionInfo is changed
# and this box is re-run through this script.
Set-PolicyValue $wu "TargetReleaseVersion"     1               "DWord"
Set-PolicyValue $wu "ProductVersion"           $productVersion "String"
Set-PolicyValue $wu "TargetReleaseVersionInfo" $displayVersion "String"

# --- 5. Delivery Optimization: don't seed updates to the internet --------------
# Measured on this box (2026-07-30): DoSvc was the single largest disk writer of
# any process at ~133 MB/h - more than everything else on the machine combined,
# POS included. Disk wear is NOT the reason to change it (see below); bandwidth is.
#
# With no policy set, Windows' default is peer-to-peer: this machine both downloads
# update content from strangers and UPLOADS it back out over the shop's connection.
# That same connection carries Square card authorisations and online orders, so an
# upload burst during service is a payment that spins. DODownloadMode = 0 keeps
# Delivery Optimization's download manager (resume, throttling) but turns peering
# off entirely - HTTP from Microsoft only, nothing shared outward.
#
# The bandwidth cap is the second half. Foreground/background split matters: this
# caps only BACKGROUND traffic, so a manually-triggered update still runs at full
# speed when someone is deliberately waiting for it.
if (-not $AllowUpdatePeering) {
  $doPol = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization"
  Write-Host "Disabling Delivery Optimization peering and capping background bandwidth..." -ForegroundColor Cyan
  Set-PolicyValue $doPol "DODownloadMode" 0 "DWord"
  Set-PolicyValue $doPol "DOPercentageMaxBackgroundBandwidth" $MaxUpdateBandwidthPercent "DWord"
} else {
  Write-Host "Leaving Delivery Optimization at Windows defaults (-AllowUpdatePeering was set)." -ForegroundColor Yellow
}

# --- 6. Power: a POS must never sleep off the LAN -----------------------------
if (-not $SkipPowerConfig) {
  Write-Host "Applying power settings (no sleep/hibernate/disk-sleep on AC)..." -ForegroundColor Cyan
  powercfg /change standby-timeout-ac 0   | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  powercfg /change disk-timeout-ac 0      | Out-Null
  # Monitor can still sleep - saves the panel, does not drop the network.
}

# --- Read back and summarise ---------------------------------------------------
Write-Host ""
Write-Host "Applied Windows Update policy:" -ForegroundColor Green
$wuNow = Get-ItemProperty $wu
$auNow = Get-ItemProperty $au
[PSCustomObject]@{
  "Active hours"              = ("{0:00}:00 - {1:00}:00" -f $wuNow.ActiveHoursStart, $wuNow.ActiveHoursEnd)
  "Forced restart at"         = ("{0:00}:00 (+{1} min countdown)" -f $auNow.ScheduledInstallTime, $auNow.AlwaysAutoRebootAtScheduledTimeMinutes)
  "Quality update settle"     = ("{0} day(s)" -f $wuNow.DeferQualityUpdatesPeriodInDays)
  "Feature version pinned to" = ("{0} {1}" -f $wuNow.ProductVersion, $wuNow.TargetReleaseVersionInfo)
  "Update peering"            = $(if ($AllowUpdatePeering) { "Windows default (peer-to-peer ON)" } else { "OFF - HTTP from Microsoft only" })
  "Background bandwidth cap"  = $(if ($AllowUpdatePeering) { "uncapped" } else { "{0}%" -f $MaxUpdateBandwidthPercent })
} | Format-List

Write-Host "Notes:" -ForegroundColor Yellow
Write-Host "  - Settings > Windows Update will now read 'Some settings are managed by your organization' - expected."
Write-Host "  - The feature version is PINNED. Twice a year, on a CLOSED day, remove the pin"
Write-Host "    (or bump TargetReleaseVersionInfo), let the feature update install, then re-run"
Write-Host "    this script to re-pin to the new version. Register the reminder with:"
Write-Host "      powershell -ExecutionPolicy Bypass -File scripts\register-feature-update-reminder-task.ps1"
Write-Host "  - Confirm the POS auto-starts after an unattended reboot:"
Write-Host "      powershell -ExecutionPolicy Bypass -File scripts\verify-resilience.ps1"
