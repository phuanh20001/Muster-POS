# One-time shop PC setup — allow LAN tablets to reach the POS on port 3000.
# Run in PowerShell as Administrator.

$existing = @(Get-NetFirewallRule -DisplayName 'DreamyCafe POS' -ErrorAction SilentlyContinue)
if ($existing.Count -gt 0) {
  $existing | Remove-NetFirewallRule
}

New-NetFirewallRule `
  -DisplayName 'DreamyCafe POS' `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow `
  -Profile Any | Out-Null

Write-Host 'Firewall rule added: inbound TCP 3000 (all profiles).' -ForegroundColor Green
Write-Host 'Optional: set shop Wi-Fi to Private — Settings -> Network -> Wi-Fi -> your network -> Private'
Write-Host ''
& "$PSScriptRoot\test-lan-pos.ps1"
