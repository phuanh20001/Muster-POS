# DreamyCafe - install NSSM Windows services for auto-start after reboot
# Run in Administrator PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1 -AppOnly
#
# -AppOnly installs just DreamyCafeApp and skips the tunnel. This exists so reboot survival
# (production-setup Phase 10) can be set up and PROVEN at home, weeks before the domain exists.
# The app service has no shop dependency whatsoever - it wraps `npm run start` against a local
# PostgreSQL - whereas the tunnel needs a registered domain, `cloudflared tunnel login`, and a
# Cloudflare Transform Rule that must exist BEFORE it first runs. Without this switch the script
# was all-or-nothing: it resolved cloudflared and threw on a missing config before installing
# anything, so the one genuinely home-doable half was gated behind the one that is not. Proving
# a service survives a cold boot costs several reboots of wall-clock time, which is the worst
# thing to discover you still owe on shop-fitting day.
#
# Re-run WITHOUT -AppOnly once the tunnel is configured to add it; that reinstalls both cleanly.
param([switch]$AppOnly)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell (right-click -> Run as administrator)"
}

$project = Split-Path $PSScriptRoot -Parent
$logsDir = Join-Path $project "logs"
$nssmDir = Join-Path $project "tools\nssm"
$nssmExe = Join-Path $nssmDir "nssm.exe"
$nodeNpm = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path $nodeNpm)) { throw "npm.cmd not found at $nodeNpm" }
if (-not (Test-Path (Join-Path $project ".next"))) {
  throw "No production build found - run 'npm run build' in the project folder first"
}

# Resolved only when the tunnel is actually being installed - under -AppOnly a missing
# cloudflared must not stop the app service from being set up.
$cf = if ($AppOnly) { $null } else { (Get-Command cloudflared -ErrorAction Stop).Source }

function Ensure-Nssm {
  if (Test-Path $nssmExe) { return $nssmExe }

  New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
  $sources = @(
    @{
      Url = "https://github.com/fawno/nssm.cc/releases/download/v2.24.1/nssm-v2.24.1-Win64.zip"
      Root = "nssm.exe"
    },
    @{
      Url = "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip"
      Root = "win64\nssm.exe"
    },
    @{
      Url = "https://nssm.cc/release/nssm-2.24.zip"
      Root = "nssm-2.24\win64\nssm.exe"
    }
  )

  foreach ($src in $sources) {
    $extract = Join-Path $env:TEMP ("nssm-dl-" + [Guid]::NewGuid().ToString("n"))
    $zip = Join-Path $env:TEMP "nssm-download.zip"
    try {
      Write-Host "Downloading NSSM from $($src.Url) ..."
      Invoke-WebRequest -Uri $src.Url -OutFile $zip -UseBasicParsing
      Expand-Archive -Path $zip -DestinationPath $extract -Force
      $found = Get-ChildItem -Path $extract -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue |
        Sort-Object { if ($_.FullName -match '\\win64\\') { 0 } else { 1 } } |
        Select-Object -First 1
      if ($found) {
        Copy-Item $found.FullName $nssmExe -Force
        Write-Host "NSSM ready at $nssmExe"
        return $nssmExe
      }
    } catch {
      Write-Warning "Download failed: $($_.Exception.Message)"
    } finally {
      Remove-Item $zip -Force -ErrorAction SilentlyContinue
      Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  throw "Could not download NSSM. Try: winget install NSSM.NSSM then re-run this script."
}

Ensure-Nssm | Out-Null

if (-not (Test-Path $nssmExe)) { throw "NSSM not found at $nssmExe after download" }

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# Only remove what this run reinstalls. Under -AppOnly an already-configured DreamyCafeTunnel
# is left strictly alone rather than silently torn down - a re-run to update the app must never
# be the thing that takes the shop's online ordering offline.
$targets = if ($AppOnly) { @("DreamyCafeApp") } else { @("DreamyCafeApp", "DreamyCafeTunnel") }
if ($AppOnly -and (Get-Service DreamyCafeTunnel -ErrorAction SilentlyContinue)) {
  Write-Warning "DreamyCafeTunnel is already installed; -AppOnly leaves it untouched. Re-run without -AppOnly to reinstall both."
}
foreach ($name in $targets) {
  $existing = Get-Service $name -ErrorAction SilentlyContinue
  if ($existing) {
    if ($existing.Status -eq "Running") { Stop-Service $name -Force }
    & $nssmExe remove $name confirm
  }
}

# Find the local PostgreSQL service so the app can depend on it. The name is
# version-specific (postgresql-x64-18, -16, ...), so detect it rather than hardcode.
$pgService = Get-Service -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'postgresql*' -or $_.DisplayName -like 'PostgreSQL*' } |
  Select-Object -First 1
if ($pgService) {
  Write-Host "Found PostgreSQL service: $($pgService.Name)"
} else {
  Write-Warning "No local PostgreSQL service found. If Postgres is on this PC, the app service won't wait for it at boot; if Postgres is remote, this is expected."
}

Write-Host "Installing DreamyCafeApp..."
& $nssmExe install DreamyCafeApp $nodeNpm "run" "start"
& $nssmExe set DreamyCafeApp AppDirectory $project
# TZ pins the shop's local timezone so day-boundary reports (today's sales, Z-report,
# daily breakdowns) are correct even if the OS clock/region is ever UTC or wrong.
& $nssmExe set DreamyCafeApp AppEnvironmentExtra "NODE_ENV=production" "TZ=Australia/Sydney"
& $nssmExe set DreamyCafeApp DisplayName "DreamyCafe POS Server"
& $nssmExe set DreamyCafeApp Description "Next.js POS app on port 3000"
& $nssmExe set DreamyCafeApp Start SERVICE_AUTO_START
& $nssmExe set DreamyCafeApp AppStdout (Join-Path $logsDir "app-stdout.log")
& $nssmExe set DreamyCafeApp AppStderr (Join-Path $logsDir "app-stderr.log")
& $nssmExe set DreamyCafeApp AppRotateFiles 1
& $nssmExe set DreamyCafeApp AppRotateOnline 1
& $nssmExe set DreamyCafeApp AppRotateBytes 10485760
# Cold-boot ordering: wait for PostgreSQL before starting, or `prisma migrate deploy`
# in `npm run start` fails the race on a power-loss reboot (common on a shop mini PC).
if ($pgService) { & $nssmExe set DreamyCafeApp DependOnService $pgService.Name }
# Crash recovery: restart on unexpected exit, but throttle so a genuinely broken
# start (e.g. bad migration) doesn't hot-loop and spam the CPU/logs.
& $nssmExe set DreamyCafeApp AppExit Default Restart
& $nssmExe set DreamyCafeApp AppRestartDelay 5000
& $nssmExe set DreamyCafeApp AppThrottle 10000

if ($AppOnly) {
  Write-Host "-AppOnly: skipping DreamyCafeTunnel (needs a domain + 'cloudflared tunnel login')."
} else {
  Write-Host "Installing DreamyCafeTunnel..."
  $cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
  $cloudflaredConfig = Join-Path $cloudflaredDir "config.yml"
  $originCert = Join-Path $cloudflaredDir "cert.pem"
  if (-not (Test-Path $cloudflaredConfig)) {
    throw "cloudflared config not found at $cloudflaredConfig - run 'cloudflared tunnel login' first, or use -AppOnly to install just the app service"
  }

  $configText = Get-Content $cloudflaredConfig -Raw
  if ($configText -notmatch '(?m)^origincert:' -and (Test-Path $originCert)) {
    $origincertLine = "origincert: $originCert"
    $configText = $configText -replace '(?m)^credentials-file:', "$origincertLine`r`ncredentials-file:"
    Set-Content -Path $cloudflaredConfig -Value $configText.TrimEnd() -Encoding ascii
  }

  icacls $cloudflaredDir /grant "NT AUTHORITY\SYSTEM:(OI)(CI)R" /T | Out-Null

  & $nssmExe install DreamyCafeTunnel $cf "tunnel" "--config" $cloudflaredConfig "run" "dreamycafe"
  & $nssmExe set DreamyCafeTunnel AppDirectory $cloudflaredDir
  & $nssmExe set DreamyCafeTunnel DisplayName "DreamyCafe Cloudflare Tunnel"
  & $nssmExe set DreamyCafeTunnel Description "Exposes the public domain to localhost:3000"
  & $nssmExe set DreamyCafeTunnel Start SERVICE_AUTO_START
  & $nssmExe set DreamyCafeTunnel AppStdout (Join-Path $logsDir "tunnel-stdout.log")
  & $nssmExe set DreamyCafeTunnel AppStderr (Join-Path $logsDir "tunnel-stderr.log")
  & $nssmExe set DreamyCafeTunnel AppRotateFiles 1
  & $nssmExe set DreamyCafeTunnel AppRotateOnline 1
  & $nssmExe set DreamyCafeTunnel AppRotateBytes 10485760
  & $nssmExe set DreamyCafeTunnel DependOnService DreamyCafeApp
  # Reconnect after a transient network drop instead of staying down. Throttle is
  # deliberately left low (set to 1500ms just before first start below) so the tunnel
  # can retry quickly while establishing its initial connection.
  & $nssmExe set DreamyCafeTunnel AppExit Default Restart
  & $nssmExe set DreamyCafeTunnel AppRestartDelay 5000
  if (Test-Path $originCert) {
    & $nssmExe set DreamyCafeTunnel AppEnvironmentExtra "TUNNEL_ORIGIN_CERT=$originCert"
  }
}

Write-Host "Starting services..."
Start-Service DreamyCafeApp
Start-Sleep -Seconds 15
if (-not $AppOnly) {
  try {
    $tunnelSvc = Get-Service DreamyCafeTunnel -ErrorAction Stop
    if ($tunnelSvc.Status -eq "Paused") {
      Resume-Service DreamyCafeTunnel -ErrorAction SilentlyContinue
      Stop-Service DreamyCafeTunnel -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    & $nssmExe reset DreamyCafeTunnel AppThrottle 1500 2>$null
    Start-Service DreamyCafeTunnel
  } catch {
    Write-Warning "DreamyCafeTunnel failed to start - see logs\tunnel-stderr.log"
    Get-Content (Join-Path $logsDir "tunnel-stderr.log") -Tail 8 -ErrorAction SilentlyContinue
    throw
  }
  Start-Sleep -Seconds 5
}

$appCode = (Invoke-WebRequest -Uri "http://localhost:3000/pos" -UseBasicParsing -TimeoutSec 30).StatusCode
Write-Host "DreamyCafeApp localhost:3000/pos -> $appCode"

Get-Service $targets | Format-Table Name, Status, StartType -AutoSize
Write-Host ""
Write-Host "Done. The till reaches the POS over the LAN at http://<this-pc-ip>:3000 (iPad deployment)."
Write-Host "  Needs the firewall rule: scripts\allow-lan-pos.ps1"
Write-Host "  On a box using the Electron till instead, open it with open-pos.bat."
# start-pos.bat runs `npm run build` then the Electron kiosk, which binds port 3000 itself -
# with the service already listening it fails on EADDRINUSE, and the failure is silent because
# the .bat relaunches hidden via start-pos-hidden.vbs and only writes logs\startup.log.
Write-Host "Do NOT use start-pos.bat while these services are running - port 3000 conflict."
Write-Host "After code updates: npm run build, then Restart-Service DreamyCafeApp"
if ($AppOnly) {
  Write-Host ""
  Write-Host "TUNNEL NOT INSTALLED. When the domain exists: cloudflared tunnel login, create the" -ForegroundColor Yellow
  Write-Host "tunnel + config.yml, add the Cloudflare Transform Rule FIRST, then re-run this script" -ForegroundColor Yellow
  Write-Host "without -AppOnly. Until then this box serves the LAN only." -ForegroundColor Yellow
}
