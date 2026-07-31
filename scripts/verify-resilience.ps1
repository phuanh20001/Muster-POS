# DreamyCafe - verify resilience setup (read-only checks)
# Run: powershell -ExecutionPolicy Bypass -File scripts\verify-resilience.ps1
#   -PublicHost dreamy-cafe.com   check the public tunnel URL too (omit while LAN-only)
#
# Checks that do not apply are reported [SKIP], never [FAIL]. That distinction is the whole
# point: this box deliberately runs with no tunnel until the domain exists, and a script that
# reports two red failures every time it is run correctly is a script people learn to ignore.
param([string]$PublicHost = "")

$ErrorActionPreference = "Continue"
$project = Split-Path $PSScriptRoot -Parent
$ok = $true

function Check($label, $pass, $hint) {
  if ($pass) { Write-Host "[OK]   $label" -ForegroundColor Green }
  else { Write-Host "[FAIL] $label" -ForegroundColor Red; if ($hint) { Write-Host "       $hint" }; $script:ok = $false }
}
function Skip($label, $why) {
  Write-Host "[SKIP] $label" -ForegroundColor DarkGray
  if ($why) { Write-Host "       $why" -ForegroundColor DarkGray }
}
function Info($label) { Write-Host "[INFO] $label" -ForegroundColor Cyan }

Write-Host "DreamyCafe resilience checks`n"

$app = Get-Service DreamyCafeApp -ErrorAction SilentlyContinue
$tunnel = Get-Service DreamyCafeTunnel -ErrorAction SilentlyContinue
Check "DreamyCafeApp service (auto-start)" ($app -and $app.Status -eq "Running" -and $app.StartType -eq "Automatic") "Run scripts\install-windows-services.ps1 as Administrator"
if ($tunnel) {
  Check "DreamyCafeTunnel service (auto-start)" ($tunnel.Status -eq "Running" -and $tunnel.StartType -eq "Automatic") "Same as above"
} else {
  Skip "DreamyCafeTunnel service" "not installed - expected while running -AppOnly (no domain yet)"
}

# The reboot proof. A service being Running says nothing about whether WINDOWS started it:
# an admin who just ran install-windows-services.ps1 sees exactly the same thing. The evidence
# is the app process having started within moments of the machine itself.
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
$uptimeMin = ((Get-Date) - $boot).TotalMinutes
if ($app -and $app.Status -eq "Running") {
  # not $pid - that is a read-only PowerShell automatic variable (this process's own id)
  $svcPid = (Get-CimInstance Win32_Service -Filter "Name='DreamyCafeApp'").ProcessId
  # Win32_Process.CreationDate, not Get-Process/StartTime: StartTime needs a handle
  # opened with PROCESS_QUERY_(LIMITED_)INFORMATION on the target process, which a
  # non-elevated session can be denied for a SYSTEM-owned NSSM process. That failure
  # doesn't throw here - the property read comes back $null, and "$null - $boot"
  # silently coerces $null to [datetime]::MinValue (0001-01-01), producing a
  # multi-billion-minute delta that the old "-le 5" check still read as a pass.
  # CIM asks the WMI service to look the process up, so it works unelevated too.
  $cimProc = if ($svcPid) { Get-CimInstance Win32_Process -Filter "ProcessId=$svcPid" -ErrorAction SilentlyContinue } else { $null }
  if ($cimProc -and $cimProc.CreationDate) {
    $deltaMin = ($cimProc.CreationDate - $boot).TotalMinutes
    Info ("boot {0:yyyy-MM-dd HH:mm:ss}, uptime {1:N1} min, app started {2:N1} min after boot" -f $boot, $uptimeMin, $deltaMin)
    if ($deltaMin -lt -2 -or $deltaMin -gt $uptimeMin + 1) {
      # Sanity guard: the app cannot have started before boot (beyond trivial clock
      # rounding) or after "now" - a delta outside that range means the timestamp
      # read is bogus, not that the claim is true or false.
      Skip "App service started AT BOOT (unattended)" "delta ($([math]::Round($deltaMin,1)) min) is out of range for this boot - re-run to confirm"
    } elseif ($deltaMin -le 5) {
      Check "App service started AT BOOT (unattended)" $true $null
    } elseif ($uptimeMin -le 10) {
      Check "App service started AT BOOT (unattended)" $false "up $([math]::Round($uptimeMin,1)) min but app started $([math]::Round($deltaMin,1)) min in - it did not come up with the machine"
    } else {
      Skip "App service started AT BOOT (unattended)" "service has been restarted since this boot - reboot and re-run to prove it"
    }
  } else {
    Skip "App service started AT BOOT (unattended)" "could not read the app process's start time"
  }
}

$backup = Get-ChildItem (Join-Path $project "backups\*.dump") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Check "Recent local backup" ($backup -and $backup.LastWriteTime -gt (Get-Date).AddDays(-2)) "Run scripts\backup-db.ps1 or check Task Scheduler 'DreamyCafe DB Backup'"

$drill = Get-ScheduledTask -TaskName "DreamyCafe Restore Drill" -ErrorAction SilentlyContinue
Check "Quarterly restore drill task" ($drill -and $drill.State -ne "Disabled") "Run scripts\register-restore-drill-task.ps1 as Administrator"

try {
  $health = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 5
  Check "Local /api/health" ($health.StatusCode -eq 200 -and $health.Content -match '"ok":true') "Start the app (npm run start or DreamyCafeApp service)"
} catch {
  Check "Local /api/health" $false "App not reachable on localhost:3000"
}

# The old brand's domain was hardcoded here, so this check failed for a reason that had nothing
# to do with resilience. Pass -PublicHost once the real domain is live.
if ($PublicHost) {
  try {
    $public = Invoke-WebRequest -Uri "https://$PublicHost/api/health" -UseBasicParsing -TimeoutSec 15
    Check "Public /api/health (tunnel)" ($public.StatusCode -eq 200) "Start cloudflared / DreamyCafeTunnel; set up UptimeRobot per docs\uptime-monitoring.md"
  } catch {
    Check "Public /api/health (tunnel)" $false "Tunnel or app down - configure UptimeRobot on this URL when live"
  }
} else {
  Skip "Public /api/health (tunnel)" "no -PublicHost given; this box is LAN-only until the domain exists"
}

$swPath = Join-Path $project "public\sw.js"
if (Test-Path $swPath) {
  $sw = Get-Content $swPath -Raw
  Check "CACHE_VERSION in sw.js" ($sw -match "const CACHE_VERSION = 'dc-pos-") "Run npm run build to auto-bump"
} else {
  Check "CACHE_VERSION in sw.js" $false "public/sw.js not generated yet - run npm run build (or npm run dev/start); it is gitignored and created from scripts/sw.template.js"
}

Write-Host ""
if ($ok) { Write-Host "All checks passed." -ForegroundColor Green }
else { Write-Host "Some checks failed - see hints above." -ForegroundColor Yellow }
