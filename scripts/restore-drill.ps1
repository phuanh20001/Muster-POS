# DreamyCafe - quarterly restore drill (safe: uses throwaway restore_test DB only)
# Manual run:  powershell -ExecutionPolicy Bypass -File scripts\restore-drill.ps1
#
# This is the job that proves the backups are actually RESTORABLE - the one check
# that catches a year of dumps that were never recoverable. Because it runs from
# Task Scheduler with -WindowStyle Hidden, it needs its own paper trail: every run
# appends to logs\restore-drill.log and pings a healthcheck, so a failed drill
# can't disappear into a closed window.
#
# Alerting: RESTORE_DRILL_HEALTHCHECK_URL if set, else the shared
# BACKUP_HEALTHCHECK_URL (in .env or the environment). Pings <url> on a pass and
# <url>/fail on any failure. Leave both unset to disable.
#   - A DEDICATED check is better here: set its period to ~90 days and healthchecks.io
#     also tells you when the drill stops running at all (a quarterly job sharing the
#     daily backup check gets failure alerts, but no dead-man's cover of its own).

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path $PSScriptRoot -Parent

function Get-EnvValue($Name) {
  $existing = [Environment]::GetEnvironmentVariable($Name)
  if ($existing) { return $existing }
  $envFile = Join-Path $ProjectRoot ".env"
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern "^\s*$Name\s*=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return ($line.Line -replace "^\s*$Name\s*=", '').Trim().Trim('"').Trim("'") }
  }
  return $null
}

function Get-DbPassword {
  $pw = Get-EnvValue "PGPASSWORD"
  if ($pw) { return $pw }
  $url = Get-EnvValue "DATABASE_URL"
  if ($url -and $url -match '://[^:/@]+:([^@]+)@') { return [Uri]::UnescapeDataString($Matches[1]) }
  return $null
}

# --- Failure alerting (same pattern as backup-db.ps1 / db-maintenance.ps1) ---
$HealthcheckUrl = Get-EnvValue "RESTORE_DRILL_HEALTHCHECK_URL"
if (-not $HealthcheckUrl) { $HealthcheckUrl = Get-EnvValue "BACKUP_HEALTHCHECK_URL" }

function Send-Ping($Suffix, $Body) {
  if (-not $HealthcheckUrl) { return }
  try {
    Invoke-WebRequest -Uri ("$HealthcheckUrl$Suffix") -Method Post -Body $Body `
      -UseBasicParsing -TimeoutSec 10 | Out-Null
  } catch {
    Write-Warning "Healthcheck ping ($Suffix) failed: $($_.Exception.Message)"
  }
}
# ---------------------------------------------------------------------------

# Log to console (manual runs), to an in-memory list (the ping body), and to
# logs\restore-drill.log (the scheduled run's only durable record). The file write
# is best-effort so a locked/unwritable log can never cost us the alert.
$logsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$logFile = Join-Path $logsDir "restore-drill.log"

$log = New-Object System.Collections.Generic.List[string]
function Log($msg) {
  $line = "$(Get-Date -Format s)  $msg"
  Write-Output $line
  $log.Add($line)
  Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

try {
  $PgBin      = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\PostgreSQL\bin" }
  $DbUser     = "postgres"
  $DbPassword = Get-DbPassword               # from PGPASSWORD or parsed from DATABASE_URL in .env; never hardcoded
  $BackupDir  = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }
  $TestDb     = "restore_test"

  if (-not (Test-Path $PgBin)) { throw "PostgreSQL bin not found at $PgBin" }
  if (-not $DbPassword) { throw "No DB password: set PGPASSWORD in the environment or add it to .env" }

  # Quarantined dumps live in backups\quarantine\, so a plain listing of this
  # folder only ever sees files that passed the backup's own integrity check.
  $latest = Get-ChildItem -Path $BackupDir -Filter "dreamycafe_*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $latest) {
    throw "No backup files in $BackupDir - run scripts\backup-db.ps1 first"
  }

  $ageHrs = [math]::Round(((Get-Date) - $latest.LastWriteTime).TotalHours, 1)
  Log "Restore drill using $($latest.Name) (${ageHrs}h old)"

  $env:PGPASSWORD = $DbPassword
  try {
    & "$PgBin\dropdb.exe" -U $DbUser --if-exists $TestDb
    if ($LASTEXITCODE -ne 0) { throw "dropdb failed with code $LASTEXITCODE" }

    & "$PgBin\createdb.exe" -U $DbUser $TestDb
    if ($LASTEXITCODE -ne 0) { throw "createdb failed with code $LASTEXITCODE" }

    # --exit-on-error so a dump that restores with per-object errors FAILS the drill
    # instead of silently "passing" on a partially-broken backup.
    & "$PgBin\pg_restore.exe" -U $DbUser -d $TestDb --exit-on-error $latest.FullName
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with code $LASTEXITCODE" }

    $sqlFile = Join-Path $env:TEMP "dc-restore-drill.sql"
    Set-Content -Path $sqlFile -Value 'SELECT COUNT(*) FROM "Order";' -Encoding ascii
    $count = & "$PgBin\psql.exe" -U $DbUser -d $TestDb -t -A -f $sqlFile
    Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { throw "sanity query failed with code $LASTEXITCODE" }

    # A count that isn't a plain integer means the query didn't really run against a
    # restored schema - treat that as a failed drill, not a pass.
    $countText = "$count".Trim()
    if ($countText -notmatch '^\d+$') { throw "sanity query did not return a row count (got: '$countText') - restore is not trustworthy" }

    Log "Restore drill OK - Order count in restore_test: $countText"

    & "$PgBin\dropdb.exe" -U $DbUser $TestDb
    if ($LASTEXITCODE -ne 0) { throw "dropdb cleanup failed with code $LASTEXITCODE" }

    Log "Cleaned up $TestDb"
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }

  Send-Ping "" ($log -join "`n")
} catch {
  $err = $_.Exception.Message
  # A failed drill means the backups are not proven restorable - the loudest
  # possible signal is the right one, even though nothing is broken *right now*.
  Log "RESTORE DRILL FAILED: $err"
  Log "The nightly backups are NOT proven restorable. Investigate before you need them: docs/database-backup.md"
  Write-Error $err
  Send-Ping "/fail" (($log -join "`n") + "`n`nRESTORE DRILL FAILED: $err")
  exit 1
}
