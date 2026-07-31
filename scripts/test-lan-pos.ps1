# Quick LAN POS connectivity check — run on the shop PC.
$ErrorActionPreference = 'Continue'

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

if (-not $ip) {
  Write-Host 'No LAN IPv4 address found.' -ForegroundColor Red
  exit 1
}

$url = "http://${ip}:3000/login"
Write-Host "Shop PC LAN IP: $ip"
Write-Host "Tablet URL:     $url"
Write-Host ''

function Test-PosUrl($label, $testUrl) {
  try {
    $r = Invoke-WebRequest -Uri $testUrl -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 5
    Write-Host "[OK] $label -> HTTP $($r.StatusCode)" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "[FAIL] $label -> $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
}

$localOk = Test-PosUrl 'localhost' 'http://127.0.0.1:3000/login'
$lanOk = Test-PosUrl 'LAN IP' $url

$profile = (Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory
Write-Host ''
Write-Host "Wi-Fi network profile: $profile (Private is recommended for shop LAN)"
$rules = @(Get-NetFirewallRule -DisplayName 'DreamyCafe POS' -ErrorAction SilentlyContinue)
Write-Host "DreamyCafe firewall rules: $($rules.Count)"

if ($localOk -and -not $lanOk) {
  Write-Host ''
  Write-Host 'Server is up but LAN IP failed — run scripts/allow-lan-pos.ps1 as Administrator.' -ForegroundColor Yellow
  exit 1
}

if (-not $localOk) {
  Write-Host ''
  Write-Host 'POS server is not running — start open-pos.bat or the DreamyCafe Windows service first.' -ForegroundColor Yellow
  exit 1
}

if ($lanOk) {
  Write-Host ''
  Write-Host 'PC side looks good. On the iPad:' -ForegroundColor Cyan
  Write-Host "  1. Same Wi-Fi as this PC (not guest Wi-Fi)"
  Write-Host "  2. Safari -> $url"
  Write-Host '  3. Settings -> Privacy & Security -> Local Network -> Safari ON'
  Write-Host '  4. Share -> Add to Home Screen'
}
