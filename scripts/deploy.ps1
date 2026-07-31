# DreamyCafe - one-command live deploy for the 24/7 mini PC.
#
# Safe order: BACKUP -> TEST -> BUILD -> (only if both OK) RESTART -> HEALTH CHECK.
# A failed test or build NEVER restarts the service, so a broken change can't take
# the running POS down - the old build keeps serving until a good build replaces it.
#
# Run (Administrator PowerShell, from anywhere):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
# Options:
#   -Pull        git pull (fast-forward only) before building
#   -SkipBackup  skip the pre-deploy pg_dump (not recommended)
#   -SkipTests   skip the test suite (emergency deploys only - see step 3)

param(
  [switch]$Pull,
  [switch]$SkipBackup,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$AppService = "DreamyCafeApp"

$project = Split-Path $PSScriptRoot -Parent
$npm     = "C:\Program Files\nodejs\npm.cmd"
$logsDir = Join-Path $project "logs"

function Fail($msg) { Write-Host ""; Write-Host "DEPLOY ABORTED: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }

# --- Preflight --------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Run in an Administrator PowerShell (Restart-Service needs elevation)." }
if (-not (Test-Path $npm)) { Fail "npm.cmd not found at $npm" }
$svc = Get-Service $AppService -ErrorAction SilentlyContinue
if (-not $svc) { Fail "Service '$AppService' not found. Install services first (scripts\install-windows-services.ps1)." }
# A Disabled service can't be started, so Restart-Service would fail AFTER we've
# already run the backup + build. Check up front and fail fast with a clear fix.
if ($svc.StartType -eq 'Disabled') {
  Fail "Service '$AppService' is Disabled and can't be started. This deploy tool is for a mini PC running the NSSM services. On a machine using the manual launcher (start-pos.bat), rebuild by closing the app, running 'npm run build', and relaunching start-pos.bat. To switch this PC to services, run enable-windows-services.bat as administrator, then re-run deploy."
}

Set-Location $project
Write-Host "DreamyCafe deploy - project: $project" -ForegroundColor Green
Write-Host "Service '$AppService' is currently: $($svc.Status)"

# --- 1. Pre-deploy backup ---------------------------------------------------
# A bad migration is the one thing that could corrupt data; a snapshot taken
# BEFORE we build/migrate makes any deploy reversible. Gate on its exit code.
if (-not $SkipBackup) {
  Step "Backing up database (pre-deploy snapshot)"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "backup-db.ps1")
  if ($LASTEXITCODE -ne 0) { Fail "Pre-deploy backup failed - not touching the app. Fix the backup or re-run with -SkipBackup if you accept the risk." }
} else {
  Write-Host "Skipping pre-deploy backup (-SkipBackup)." -ForegroundColor Yellow
}

# --- 2. Optional git pull ---------------------------------------------------
if ($Pull) {
  Step "git pull (fast-forward only)"
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Fail "git pull failed - resolve it before deploying. App untouched." }
}

# --- 3. Test suite (the regression net) -------------------------------------
# Runs AFTER -Pull so it tests the code actually about to ship, and BEFORE the
# build so a failure costs seconds instead of a full compile. These tests cover
# money math, zone gating, credential lockout, order totals, loyalty and
# vouchers - the paths where a regression doesn't crash, it just silently
# produces a wrong number or exposes a staff route. -SkipTests exists for a
# genuine emergency deploy; using it routinely defeats the point of the gate.
if (-not $SkipTests) {
  Step "Running tests (npm test)"
  & $npm test
  if ($LASTEXITCODE -ne 0) {
    Fail "Tests failed. The app was NOT restarted - it is still serving the previous working build. Fix the failing test(s) and re-run."
  }
  Write-Host "Tests OK." -ForegroundColor Green
} else {
  Write-Host "Skipping tests (-SkipTests)." -ForegroundColor Yellow
}

# --- 4. Build (does NOT touch the running app) ------------------------------
# next build compiles into .next/ while the live server keeps serving the old
# build. The app only picks up new code on the restart in step 5.
Step "Building (npm run build)"
& $npm run build
if ($LASTEXITCODE -ne 0) {
  Fail "Build failed. The app was NOT restarted - it is still serving the previous working build. Fix the error and re-run."
}
Write-Host "Build OK." -ForegroundColor Green

# --- 5. Restart the app service (the only downtime) -------------------------
Step "Restarting $AppService"
Restart-Service $AppService -Force
Write-Host "Restart issued." -ForegroundColor Green

# --- 6. Health check --------------------------------------------------------
Step "Health check (localhost:3000/pos)"
$healthy = $false
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  try {
    $code = (Invoke-WebRequest -Uri "http://localhost:3000/pos" -UseBasicParsing -TimeoutSec 5).StatusCode
    if ($code -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}

if ($healthy) {
  Write-Host ""
  Write-Host "DEPLOY OK - new build is live and serving 200 on /pos." -ForegroundColor Green
  Get-Service $AppService | Format-Table Name, Status, StartType -AutoSize
} else {
  Write-Host ""
  Write-Host "WARNING: build deployed and service restarted, but /pos did not return 200 within 60s." -ForegroundColor Red
  Write-Host "The service may still be booting, or the new build fails at runtime. Last app errors:" -ForegroundColor Red
  $errLog = Join-Path $logsDir "app-stderr.log"
  if (Test-Path $errLog) { Get-Content $errLog -Tail 15 } else { Write-Host "(no $errLog found)" }
  Write-Host ""
  Write-Host "If it stays down: check the log above, or roll back with the pre-deploy backup" -ForegroundColor Yellow
  Write-Host "(pg_restore -U postgres -d dreamycafe --clean <file>.dump) and redeploy a known-good build." -ForegroundColor Yellow
  exit 1
}
