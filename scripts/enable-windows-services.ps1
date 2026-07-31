# Re-enable NSSM services (auto-start on boot). Use start-pos.bat OR services — never both.
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\enable-windows-services.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  throw "Run this script in an Administrator PowerShell"
}

Set-Service DreamyCafeApp -StartupType Automatic
Start-Service DreamyCafeApp
Start-Sleep -Seconds 15
Set-Service DreamyCafeTunnel -StartupType Automatic
Start-Service DreamyCafeTunnel
Start-Sleep -Seconds 5

Get-Service DreamyCafeApp, DreamyCafeTunnel | Format-Table Name, Status, StartType -AutoSize
Write-Host ""
Write-Host "NSSM services enabled. Stop using start-pos.bat — use open-pos.bat for the kiosk only."
