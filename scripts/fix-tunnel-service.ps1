# Fix DreamyCafeTunnel when cloudflared cannot find cert.pem (service runs as SYSTEM).
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\fix-tunnel-service.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

$project = Split-Path $PSScriptRoot -Parent
$nssmExe = Join-Path $project "tools\nssm\nssm.exe"
$logsDir = Join-Path $project "logs"
$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
$cloudflaredConfig = Join-Path $cloudflaredDir "config.yml"
$originCert = Join-Path $cloudflaredDir "cert.pem"

if (-not (Test-Path $nssmExe)) { throw "NSSM not found - run install-windows-services.bat first" }
if (-not (Get-Service DreamyCafeTunnel -ErrorAction SilentlyContinue)) {
  throw "DreamyCafeTunnel service not found - run install-windows-services.bat first"
}
if (-not (Test-Path $cloudflaredConfig)) {
  throw "cloudflared config not found at $cloudflaredConfig"
}

Write-Host "Configuring tunnel service for $cloudflaredConfig"

if (Test-Path $originCert) {
  $configText = Get-Content $cloudflaredConfig -Raw
  $origincertLine = "origincert: $originCert"
  if ($configText -notmatch '(?m)^origincert:') {
    $configText = $configText -replace '(?m)^credentials-file:', "$origincertLine`r`ncredentials-file:"
    Set-Content -Path $cloudflaredConfig -Value $configText.TrimEnd() -Encoding ascii
    Write-Host "Added origincert to config.yml"
  }
}

icacls $cloudflaredDir /grant "NT AUTHORITY\SYSTEM:(OI)(CI)R" /T | Out-Null

$svc = Get-Service DreamyCafeTunnel
if ($svc.Status -eq "Running") {
  Stop-Service DreamyCafeTunnel -Force
  Start-Sleep -Seconds 2
} elseif ($svc.Status -eq "Paused") {
  Resume-Service DreamyCafeTunnel -ErrorAction SilentlyContinue
  Stop-Service DreamyCafeTunnel -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

& $nssmExe set DreamyCafeTunnel AppDirectory $cloudflaredDir
& $nssmExe set DreamyCafeTunnel AppParameters "tunnel --config `"$cloudflaredConfig`" run dreamycafe"
if (Test-Path $originCert) {
  & $nssmExe set DreamyCafeTunnel AppEnvironmentExtra "TUNNEL_ORIGIN_CERT=$originCert"
}
& $nssmExe reset DreamyCafeTunnel AppThrottle 1500 2>$null

Write-Host "Starting DreamyCafeTunnel..."
Start-Service DreamyCafeTunnel
Start-Sleep -Seconds 8

$svc = Get-Service DreamyCafeTunnel
Write-Host "DreamyCafeTunnel status: $($svc.Status)"

if ($svc.Status -ne "Running") {
  Write-Host ""
  Write-Host "Tunnel still not running. Recent log:"
  Get-Content (Join-Path $logsDir "tunnel-stderr.log") -Tail 10 -ErrorAction SilentlyContinue
  throw "DreamyCafeTunnel failed to start"
}

Write-Host "Tunnel service fixed and running."
