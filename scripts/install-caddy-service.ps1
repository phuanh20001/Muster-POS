# DreamyCafe - install Caddy as an NSSM Windows service to terminate LAN TLS.
#
# Puts HTTPS in front of the Wi-Fi tills: tablets talk to Caddy on :443, Caddy
# forwards to Next.js on 127.0.0.1:3000 (loopback). Certs are self-issued by
# Caddy's internal CA. The plaintext :3000 port is then blocked to the LAN so
# tablets MUST use TLS. See docs/lan-tls.md for the full walkthrough.
#
# Run in Administrator PowerShell (needs to bind :443, register a service, and
# add firewall rules):
#   powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1 -LanHost 192.168.1.20

param(
  # This mini-PC's STATIC LAN IP. Must match what the tablets browse to and the
  # host's actual address, or the cert won't validate. Defaults to the IP used
  # throughout DEPLOY.md.
  [string]$LanHost = "192.168.1.10",

  # mDNS hostname the cert ALSO covers, so the tablets survive the IP changing.
  # An IP-only cert is pinned to that IP: if the address has to move at the shop,
  # every tablet needs its root CA re-trusted by hand. With this on the cert they
  # just follow the machine. Defaults to this box's own name + .local.
  [string]$LanName = "$($env:COMPUTERNAME.ToLower()).local"
)

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell (right-click -> Run as administrator)"
}

$project = Split-Path $PSScriptRoot -Parent
$logsDir = Join-Path $project "logs"
$caddyfile = Join-Path $project "Caddyfile"
$nssmExe = Join-Path $project "tools\nssm\nssm.exe"
$caddyDir = Join-Path $project "tools\caddy"
$caddyExe = Join-Path $caddyDir "caddy.exe"

if (-not (Test-Path $caddyfile)) { throw "Caddyfile not found at $caddyfile" }

# --- Locate NSSM (reuse the one install-windows-services.ps1 downloads) ---------
if (-not (Test-Path $nssmExe)) {
  $onPath = Get-Command nssm -ErrorAction SilentlyContinue
  if ($onPath) {
    $nssmExe = $onPath.Source
  } else {
    throw "NSSM not found. Run scripts\install-windows-services.ps1 first (it downloads NSSM to tools\nssm\), or 'winget install NSSM.NSSM', then re-run this script."
  }
}

# --- Ensure caddy.exe -----------------------------------------------------------
function Ensure-Caddy {
  if (Test-Path $caddyExe) { return $caddyExe }

  $onPath = Get-Command caddy -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }

  # Primary: winget. Falls through to a pinned download if winget is unavailable.
  try {
    Write-Host "Installing Caddy via winget..."
    winget install --id Caddy.Caddy --accept-source-agreements --accept-package-agreements --silent | Out-Null
    $onPath = Get-Command caddy -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
  } catch {
    Write-Warning "winget install failed: $($_.Exception.Message)"
  }

  Write-Host "Downloading Caddy (pinned) into tools\caddy\ ..."
  New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null
  $url = "https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip"
  $zip = Join-Path $env:TEMP "caddy-download.zip"
  $extract = Join-Path $env:TEMP ("caddy-dl-" + [Guid]::NewGuid().ToString("n"))
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $found = Get-ChildItem -Path $extract -Recurse -Filter caddy.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
      Copy-Item $found.FullName $caddyExe -Force
      return $caddyExe
    }
  } finally {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
  }

  throw "Could not obtain caddy.exe. Install it manually from https://caddyserver.com/download (Windows amd64) into $caddyDir"
}

$caddy = Ensure-Caddy
Write-Host "Using Caddy: $caddy"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# --- Validate the Caddyfile before registering anything ------------------------
Write-Host "Validating Caddyfile..."
$env:POS_LAN_HOST = $LanHost
$env:POS_LAN_NAME = $LanName
& $caddy validate --config $caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw "Caddyfile failed validation - fix it before installing the service" }

# --- (Re)install the service ---------------------------------------------------
$svc = "DreamyCafeCaddy"
$existing = Get-Service $svc -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") { Stop-Service $svc -Force }
  & $nssmExe remove $svc confirm
}

Write-Host "Installing $svc..."
& $nssmExe install $svc $caddy "run" "--config" $caddyfile "--adapter" "caddyfile"
& $nssmExe set $svc AppDirectory $project
& $nssmExe set $svc AppEnvironmentExtra "POS_LAN_HOST=$LanHost" "POS_LAN_NAME=$LanName"
& $nssmExe set $svc DisplayName "DreamyCafe LAN TLS (Caddy)"
& $nssmExe set $svc Description "Terminates HTTPS on :443 for LAN tablets, proxies to 127.0.0.1:3000"
& $nssmExe set $svc Start SERVICE_AUTO_START
& $nssmExe set $svc AppStdout (Join-Path $logsDir "caddy-stdout.log")
& $nssmExe set $svc AppStderr (Join-Path $logsDir "caddy-stderr.log")
& $nssmExe set $svc AppRotateFiles 1
& $nssmExe set $svc AppRotateOnline 1
& $nssmExe set $svc AppRotateBytes 10485760
# Start after the app so 127.0.0.1:3000 is up; restart on crash with a throttle.
& $nssmExe set $svc DependOnService DreamyCafeApp
& $nssmExe set $svc AppExit Default Restart
& $nssmExe set $svc AppRestartDelay 5000
& $nssmExe set $svc AppThrottle 10000

# --- Firewall: open TLS ports, close plaintext 3000 to the LAN -----------------
# Loopback (127.0.0.1) is never filtered by Windows Firewall, so blocking 3000
# inbound stops off-box devices while the kiosk, Caddy, and cloudflared keep
# reaching the app on loopback. A Block rule wins over any pre-existing allow.
function Set-FirewallRule($name, $port, $action) {
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action $action -Profile Any | Out-Null
}
Write-Host "Configuring Windows Firewall..."
Set-FirewallRule "DreamyCafe HTTPS (443)" 443 Allow
Set-FirewallRule "DreamyCafe HTTP redirect (80)" 80 Allow
Set-FirewallRule "DreamyCafe block direct 3000 (use TLS)" 3000 Block

# --- Start and verify ----------------------------------------------------------
Write-Host "Starting $svc..."
Start-Service $svc
Start-Sleep -Seconds 6

# Export Caddy's root CA to the project folder so it can be trusted on the iPads.
# When Caddy runs as the SYSTEM service its data lives under the system profile.
$rootCandidates = @(
  "C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\pki\authorities\local\root.crt",
  (Join-Path $env:ProgramData "Caddy\pki\authorities\local\root.crt")
)
$rootSrc = $rootCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($rootSrc) {
  $rootDest = Join-Path $project "caddy-root-ca.crt"
  Copy-Item $rootSrc $rootDest -Force
  Write-Host "Root CA exported to: $rootDest  (install + trust this on each iPad)"

  # Trust the root on THIS machine, because Caddy's own attempt fails here and says so
  # only in its stderr log, which nobody reads. Observed 2026-07-30:
  #   pki.ca.local  "failed to install root certificate"
  #                 error="add cert failed: Failed adding cert: The request is not supported."
  # That is Caddy's trust-store install not working when it runs as a Windows SERVICE
  # under SYSTEM. docs/lan-tls.md used to claim the mini-PC was trusted automatically;
  # it is not, and the gap is silent - `curl https://<ip>` and any .NET client fail
  # chain validation while `curl -k` happily returns 200, so a smoke test that skips
  # verification reports success either way. Importing it here makes the box able to
  # verify its own TLS, which is what lets the install actually be checked rather than
  # assumed. Idempotent: re-importing the same root is a no-op.
  try {
    $already = Get-ChildItem Cert:\LocalMachine\Root -ErrorAction Stop |
      Where-Object { $_.Subject -like "*Caddy*" }
    if (-not $already) {
      Import-Certificate -FilePath $rootDest -CertStoreLocation Cert:\LocalMachine\Root -ErrorAction Stop | Out-Null
      Write-Host "Root CA trusted in the LocalMachine store (Caddy's own attempt fails under SYSTEM)."
    } else {
      Write-Host "Root CA already trusted in the LocalMachine store."
    }
  } catch {
    Write-Warning "Could not trust the root CA locally: $($_.Exception.Message). The tablets are unaffected, but this box cannot verify its own TLS."
  }
} else {
  Write-Warning "Root CA not found yet - it is created on first run. Re-check under $($rootCandidates[0]) shortly."
}

# End-to-end TLS check. Both names are checked, and deliberately WITHOUT -k: an
# unverified check passes even when the trust chain is broken, which is exactly how
# the failed root install above went unnoticed. Invoke-WebRequest uses the Windows
# trust store, so a 200 here proves cert + chain + name all line up.
# Non-fatal: a wrong -LanHost or a not-yet-warm CA shouldn't abort the install.
foreach ($name in @($LanHost, $LanName)) {
  try {
    $r = Invoke-WebRequest -Uri "https://$name/api/health" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    Write-Host "https://$name/api/health -> $($r.StatusCode) (chain verified)"
  } catch {
    Write-Warning "https://$name/api/health did NOT verify: $($_.Exception.Message)"
  }
}
# Secondary signal: if both checks above failed, this distinguishes "Caddy isn't
# listening at all" from "it is listening but the name/chain is wrong".
$t = Test-NetConnection -ComputerName 127.0.0.1 -Port 443 -WarningAction SilentlyContinue
Write-Host "TLS port 443 listening: $($t.TcpTestSucceeded)"

Get-Service DreamyCafeApp, DreamyCafeCaddy, DreamyCafeTunnel -ErrorAction SilentlyContinue |
  Format-Table Name, Status, StartType -AutoSize

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Trust caddy-root-ca.crt on each iPad (see docs\lan-tls.md)."
Write-Host "  2. Point each tablet at https://$LanHost (drop the :3000)."
Write-Host "  3. Once ALL tablets are on HTTPS, set SESSION_COOKIE_SECURE=1 in .env"
Write-Host "     and Restart-Service DreamyCafeApp to make session cookies Secure."
