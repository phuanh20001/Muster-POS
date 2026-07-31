# Stop and disable NSSM services so start-pos.bat can run server + tunnel.
# Services stay installed — re-enable later with enable-windows-services.bat
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\disable-windows-services.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

foreach ($name in @("DreamyCafeTunnel", "DreamyCafeApp")) {
  $svc = Get-Service $name -ErrorAction SilentlyContinue
  if (-not $svc) { continue }
  if ($svc.Status -eq "Running") { Stop-Service $name -Force }
  elseif ($svc.Status -eq "Paused") {
    Resume-Service $name -ErrorAction SilentlyContinue
    Stop-Service $name -Force -ErrorAction SilentlyContinue
  }
  Set-Service $name -StartupType Disabled
  Write-Host "Disabled $name"
}

Write-Host ""
Write-Host "NSSM services stopped and disabled. Use start-pos.bat for server, tunnel, and kiosk."
