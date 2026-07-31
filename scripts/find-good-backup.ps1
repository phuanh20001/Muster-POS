# DreamyCafe - find the newest RESTORABLE backup (read-only, never touches live data).
#
# Scans backups newest-first and verifies each with `pg_restore -l` (proves the
# archive can actually be read back, not just that a file exists). Reports the
# newest one that passes and prints the exact restore command to use it. This is
# the "fall back to a working version" logic - if last night's dump is corrupt,
# it walks back to the newest good one for you.
#
# It does NOT restore anything. Restoring overwrites live data, so that stays a
# deliberate human step - copy the printed command and run it yourself.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts\find-good-backup.ps1

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path $PSScriptRoot -Parent

# --- Config (kept in sync with backup-db.ps1) -------------------------------
$PgBin       = if ($env:PG_BIN) { $env:PG_BIN } else { "C:\PostgreSQL\bin" }
$DbName      = "dreamycafe"
$DbUser      = "postgres"
$LocalDir    = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }
$GDriveSub   = "DreamyCafe-Backups"
# ---------------------------------------------------------------------------

$PgRestore = Join-Path $PgBin "pg_restore.exe"
if (-not (Test-Path $PgRestore)) { throw "pg_restore not found at $PgRestore" }

# Collect candidate dumps from local AND Google Drive, so if the whole local
# folder is lost/corrupt we can still surface a good off-site copy.
$dirs = @($LocalDir)
$gdRoot = (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.Root "My Drive" } |
  Where-Object { Test-Path $_ } | Select-Object -First 1)
if ($gdRoot) {
  $gdDir = Join-Path $gdRoot $GDriveSub
  if (Test-Path $gdDir) { $dirs += $gdDir }
}

$candidates = foreach ($d in $dirs) {
  Get-ChildItem -Path $d -Filter "dreamycafe_*.dump" -ErrorAction SilentlyContinue |
    ForEach-Object { [pscustomobject]@{ File = $_.FullName; Name = $_.Name; When = $_.LastWriteTime; Size = $_.Length; Source = $d } }
}
$candidates = @($candidates | Sort-Object When -Descending)

if ($candidates.Count -eq 0) {
  Write-Host "No backup files found in:" -ForegroundColor Red
  $dirs | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "Checking $($candidates.Count) backup(s) newest-first (read-only, live DB untouched)...`n"

$good = $null
$checked = 0
foreach ($c in $candidates) {
  $checked++
  $label = "{0}  ({1:yyyy-MM-dd HH:mm}, {2} KB)" -f $c.Name, $c.When, [int]($c.Size / 1KB)
  if ($c.Size -lt 1024) {
    Write-Host "[BAD]  $label  - too small to be a real dump" -ForegroundColor Red
    continue
  }
  & $PgRestore -l $c.File > $null 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[GOOD] $label" -ForegroundColor Green
    $good = $c
    break
  } else {
    Write-Host "[BAD]  $label  - pg_restore could not read the archive" -ForegroundColor Red
  }
}

Write-Host ""
if (-not $good) {
  Write-Host "NO restorable backup found - all $checked checked dump(s) failed the integrity check." -ForegroundColor Red
  Write-Host "This is a serious situation: verify PostgreSQL tools, disk health, and any older/off-site copies manually." -ForegroundColor Red
  exit 1
}

if ($checked -gt 1) {
  Write-Host "Newer backups were unreadable - fell back to the newest GOOD one." -ForegroundColor Yellow
}
Write-Host "Newest restorable backup:" -ForegroundColor Green
Write-Host "  File: $($good.File)"
Write-Host "  Time: $($good.When)"
Write-Host "  From: $($good.Source)"
Write-Host ""
Write-Host "To restore it OVER the live database (this OVERWRITES current data - stop the app first):" -ForegroundColor Cyan
Write-Host "  `$env:PGPASSWORD = '<db password>'" -ForegroundColor Cyan
Write-Host "  & '$PgRestore' -h localhost -U $DbUser -d $DbName --clean --if-exists '$($good.File)'" -ForegroundColor Cyan
Write-Host "  `$env:PGPASSWORD = ''" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test it safely into a throwaway DB instead, run: scripts\restore-drill.ps1" -ForegroundColor DarkGray
