# DreamyCafe - automated PostgreSQL backup
# Dumps the dreamycafe database to a timestamped, compressed file and
# prunes backups older than $RetentionDays. Safe to run from Task Scheduler.
#
# Manual run:   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
# Restore with: pg_restore -U postgres -d dreamycafe --clean <file>.dump
#
# Failure alerting: set BACKUP_HEALTHCHECK_URL (in .env or as an environment
# variable) to a healthchecks.io ping URL. This script pings it on success and
# <url>/fail on any error; healthchecks.io emails you if the success ping stops
# arriving on schedule - which also catches "the task never ran" (PC off / task
# deleted), something an in-script alert can never do. Leave it unset to disable.

$ErrorActionPreference = "Stop"

# Project root is the parent of this scripts/ folder — used to locate .env and
# the default backups/ dir, so the script has no machine-specific paths baked in.
$ProjectRoot = Split-Path $PSScriptRoot -Parent

# Read a single KEY=value from the project .env (env var wins if already set).
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

# DB password: PGPASSWORD env/.env wins; otherwise parse it out of DATABASE_URL
# (postgresql://user:PASSWORD@host...) so .env stays the single source of truth.
function Get-DbPassword {
  $pw = Get-EnvValue "PGPASSWORD"
  if ($pw) { return $pw }
  $url = Get-EnvValue "DATABASE_URL"
  if ($url -and $url -match '://[^:/@]+:([^@]+)@') { return [Uri]::UnescapeDataString($Matches[1]) }
  return $null
}

# --- Config -----------------------------------------------------------------
$PgDump        = if ($env:PG_BIN) { Join-Path $env:PG_BIN "pg_dump.exe" } else { "C:\PostgreSQL\bin\pg_dump.exe" }
$DbHost        = "localhost"
$DbPort        = "5432"
$DbName        = "dreamycafe"
$DbUser        = "postgres"
$DbPassword    = Get-DbPassword          # from PGPASSWORD or parsed from DATABASE_URL in .env; never hardcoded
$BackupDir     = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $ProjectRoot "backups" }
$RetentionDays = 30
$KeepMinimum   = 7                             # never prune below the N newest dumps, whatever their age
$MaxGoodAgeHrs = 48                            # alert if the newest VERIFIED-good backup is older than this
$MinFreeGB     = 5                             # alert if the backup drive drops below this - a full disk
                                               # stops PostgreSQL writing (no sales) AND breaks backups

# Google Drive mirror (Google Drive for Desktop). Leave $GDriveRoot blank to
# auto-detect the "My Drive" mount; the dump is copied into a subfolder there
# and Google syncs it to the cloud. If Drive isn't mounted yet, the mirror is
# skipped with a warning (the local backup still succeeds).
$GDriveRoot       = ""                         # e.g. "G:\My Drive" to force it
# Per-machine subfolder. Two POS boxes signed into the same Google account would
# otherwise interleave dumps under identical "dreamycafe_<stamp>.dump" names in one
# folder - and nothing in the filename or size says whose database a file holds. That
# is a restore-the-wrong-shop trap, and it springs at the worst possible moment. Each
# machine also prunes this folder, so sharing it means pruning someone else's history.
$GDriveSubfolder  = "DreamyCafe-Backups\$env:COMPUTERNAME"
$GDriveRetention  = 90                          # keep more history in the cloud
# ---------------------------------------------------------------------------

# --- Failure alerting (healthchecks.io dead-man's switch) -------------------
# Read the ping URL from the environment, or from .env if the task didn't load it.
$HealthcheckUrl = Get-EnvValue "BACKUP_HEALTHCHECK_URL"

# Fire a healthcheck ping. $Suffix "" = success, "/fail" = failure, "/log" = info.
# Never let a ping failure (offline, DNS) affect the backup's own exit code.
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

# Everything runs inside this try so ANY failure pings /fail with the error text.
$log = New-Object System.Collections.Generic.List[string]
function Log($msg) { $line = "$(Get-Date -Format s)  $msg"; Write-Output $line; $log.Add($line) }

try {
  if (-not (Test-Path $PgDump)) { throw "pg_dump not found at $PgDump" }
  if (-not $DbPassword) { throw "No DB password: set PGPASSWORD in the environment or add it to .env" }
  if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }

  $stamp   = Get-Date -Format "yyyy-MM-dd_HHmmss"
  $outFile = Join-Path $BackupDir "dreamycafe_$stamp.dump"

  # Pass the password via env var so it never appears on the command line.
  $PgRestore = Join-Path (Split-Path $PgDump -Parent) "pg_restore.exe"
  $env:PGPASSWORD = $DbPassword
  try {
    & $PgDump -h $DbHost -p $DbPort -U $DbUser -d $DbName -Fc -f $outFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }

    # pg_dump can exit 0 yet leave a truncated/empty file (version skew, disk full).
    # A dump is only useful if it can be read back, so verify before we trust it and
    # before the prune below could delete an older good copy in its favour.
    if (-not (Test-Path $outFile)) { throw "pg_dump reported success but no file was written to $outFile" }
    $bytes = (Get-Item $outFile).Length
    if ($bytes -lt 1024) { throw "Backup file is only $bytes bytes - almost certainly not a real dump. Aborting." }

    if (Test-Path $PgRestore) {
      # Capture pg_restore's real stderr so a failure is DIAGNOSABLE, not just
      # "integrity check failed". This is the evidence you need to tell disk-full
      # from version-skew from a mid-write dump. Flatten each line to its plain
      # text so the PowerShell NativeCommandError envelope doesn't clutter the alert.
      $restoreErr = ((& $PgRestore -l $outFile 2>&1) |
        ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" } }) -join "`n"
      if ($LASTEXITCODE -ne 0) {
        throw "Integrity check failed: pg_restore could not read the archive $outFile. The dump is corrupt - not trusting it.`npg_restore said:`n$($restoreErr.Trim())"
      }
    } else {
      Write-Warning "pg_restore.exe not found next to pg_dump - skipped the archive integrity check."
    }
  } catch {
    # A bad dump must not survive as a "good" backup, but DON'T hard-delete it -
    # quarantine it so you can inspect what went wrong. It's moved out of the main
    # folder (so it can't be restored by mistake or count toward the keep-newest
    # floor) into backups\quarantine\, and its details go into the /fail alert.
    if ($outFile -and (Test-Path $outFile)) {
      try {
        $qDir = Join-Path $BackupDir "quarantine"
        if (-not (Test-Path $qDir)) { New-Item -ItemType Directory -Path $qDir -Force | Out-Null }
        $qFile = Join-Path $qDir ((Split-Path $outFile -Leaf) + ".corrupt")
        Move-Item -Path $outFile -Destination $qFile -Force
        Log "Quarantined bad dump for inspection -> $qFile"
      } catch {
        # If we can't even move it, fall back to deleting so it can't masquerade as good.
        Remove-Item $outFile -Force -ErrorAction SilentlyContinue
      }
    }
    throw
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }

  $sizeMB = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
  Log "Backup OK (verified) -> $outFile ($sizeMB MB)"

  # --- Product images (stored on disk, NOT in the DB dump) -----------------
  # Product.imageUrl holds a path like /uploads/products/xxx.png; the file itself
  # lives on disk. The DB dump captures the path but not the bytes, so a restore
  # on a fresh machine would leave broken images. Snapshot the folder alongside the
  # dump (same timestamp) so images and their DB references restore together. This
  # is best-effort: a failure here is a warning, never fails the DB backup.
  $uploadsDir = Join-Path (Split-Path $PSScriptRoot -Parent) "public\uploads\products"
  if (Test-Path $uploadsDir) {
    $imgFiles = @(Get-ChildItem -Path $uploadsDir -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne ".gitkeep" })
    if ($imgFiles.Count -gt 0) {
      try {
        $imgZip = Join-Path $BackupDir "uploads_$stamp.zip"
        Compress-Archive -Path (Join-Path $uploadsDir "*") -DestinationPath $imgZip -Force
        Log "Product images archived -> $imgZip ($($imgFiles.Count) file(s))"
      } catch {
        Log "WARNING: product-image archive failed: $($_.Exception.Message) (DB backup is unaffected)"
      }
    }
  }

  # --- Caddy root CA certificate (public half only) -------------------------
  # The LAN-TLS root that every till tablet trusts. It lives only on this machine
  # and is in neither git nor the DB dump, but you need it to onboard a new tablet
  # (see docs/lan-tls.md). This is the PUBLIC certificate - the CA private key
  # stays on the machine and is deliberately NOT copied here, because this folder
  # is mirrored to Google Drive and that key can mint certs the tablets trust.
  # Fixed filename, overwritten each run: it almost never changes, so timestamped
  # copies would just be clutter the prune below would have to chase.
  $caCert = Join-Path $ProjectRoot "caddy-root-ca.crt"
  if (Test-Path $caCert) {
    try {
      Copy-Item -Path $caCert -Destination (Join-Path $BackupDir "caddy-root-ca.crt") -Force
      Log "Caddy root CA certificate copied (public cert only; CA key intentionally not backed up)."
    } catch {
      Log "WARNING: could not copy caddy-root-ca.crt: $($_.Exception.Message) (DB backup is unaffected)"
    }
  }

  # Prune old local backups - but ALWAYS keep the $KeepMinimum newest, whatever
  # their age. Without this floor, a stretch of failures + old dumps aging past the
  # cutoff could leave zero recoverable backups. The newest N are exempt from the
  # age rule so there is always a fallback even if backups have been failing.
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  foreach ($pattern in @("dreamycafe_*.dump", "uploads_*.zip")) {
    Get-ChildItem -Path $BackupDir -Filter $pattern | Sort-Object LastWriteTime -Descending |
      Select-Object -Skip $KeepMinimum |
      Where-Object { $_.LastWriteTime -lt $cutoff } |
      ForEach-Object {
        Remove-Item $_.FullName -Force
        Log "Pruned old backup -> $($_.Name)"
      }
  }

  # --- Mirror to Google Drive ----------------------------------------------
  # Resolve the Drive root: explicit setting, else auto-detect a "My Drive" mount.
  # A missing/failed mirror is a WARNING, not a failure: the local backup is safe,
  # but we still ping /fail so the off-site copy going stale doesn't stay silent.
  $mirrorOk = $false
  if (-not $GDriveRoot) {
    $GDriveRoot = (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.Root "My Drive" } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1)
  }

  # Google Drive for Desktop uploads in the background - the local filesystem can't
  # confirm the cloud actually received the file. What we CAN verify: Drive is
  # running (else files pile up locally forever) and the copy landed at full size.
  $driveRunning = [bool](Get-Process -Name "GoogleDriveFS" -ErrorAction SilentlyContinue)

  if ($GDriveRoot -and (Test-Path $GDriveRoot)) {
    if (-not $driveRunning) {
      Log "WARNING: 'My Drive' is mounted but GoogleDriveFS isn't running - copies won't upload until Drive is started."
    }
    $gdDir = Join-Path $GDriveRoot $GDriveSubfolder
    if (-not (Test-Path $gdDir)) { New-Item -ItemType Directory -Path $gdDir -Force | Out-Null }
    try {
      # Mirror the DB dump and (if made this run) the product-image archive, each
      # verified at full size so a partial copy is caught.
      $toMirror = @($outFile)
      if ($imgZip -and (Test-Path $imgZip)) { $toMirror += $imgZip }
      if (Test-Path $caCert) { $toMirror += $caCert }
      foreach ($src in $toMirror) {
        $dst = Join-Path $gdDir (Split-Path $src -Leaf)
        Copy-Item -Path $src -Destination $dst -Force
        $srcLen = (Get-Item $src).Length
        $dstLen = (Get-Item $dst).Length
        if ($dstLen -ne $srcLen) { throw "copied $(Split-Path $src -Leaf) is $dstLen bytes but source is $srcLen - copy did not complete" }
      }
      $mirrorOk = $driveRunning
      if ($driveRunning) { Log "Mirrored to Google Drive (copies verified, uploading) -> $gdDir" }
      else { Log "Copied to Google Drive folder (size verified) but Drive isn't running yet - NOT uploaded." }

      # Prune old cloud copies (same keep-newest-N floor as local)
      $gdCutoff = (Get-Date).AddDays(-$GDriveRetention)
      foreach ($pattern in @("dreamycafe_*.dump", "uploads_*.zip")) {
        Get-ChildItem -Path $gdDir -Filter $pattern | Sort-Object LastWriteTime -Descending |
          Select-Object -Skip $KeepMinimum |
          Where-Object { $_.LastWriteTime -lt $gdCutoff } |
          ForEach-Object {
            Remove-Item $_.FullName -Force
            Log "Pruned old cloud backup -> $($_.Name)"
          }
      }
    } catch {
      Log "WARNING: Google Drive mirror failed: $($_.Exception.Message)"
    }
  } else {
    Log "WARNING: Google Drive not detected (no 'My Drive' mount) - cloud mirror skipped. Local backup is OK."
  }

  # Freshness guard: report how old the newest VERIFIED-good local dump is, and
  # escalate if it's stale. This catches the slow failure - if new dumps keep
  # getting quarantined, this run's own file just made a good one, but if for any
  # reason the newest good backup is aging (e.g. this ran on an old file only),
  # you find out instead of silently relying on one increasingly-old backup.
  $newestGood = Get-ChildItem -Path $BackupDir -Filter "dreamycafe_*.dump" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $stale = $false
  if ($newestGood) {
    $ageHrs = [math]::Round(((Get-Date) - $newestGood.LastWriteTime).TotalHours, 1)
    Log "Newest good backup: $($newestGood.Name) (${ageHrs}h old); $((Get-ChildItem -Path $BackupDir -Filter 'dreamycafe_*.dump').Count) good dump(s) retained."
    if ($ageHrs -gt $MaxGoodAgeHrs) {
      $stale = $true
      Log "WARNING: newest good backup is ${ageHrs}h old (> ${MaxGoodAgeHrs}h) - backups may have been failing. Do not rely on this alone."
    }
  } else {
    $stale = $true
    Log "WARNING: no good backups present after this run - this should be impossible; investigate immediately."
  }

  # Disk-space guard: a full backup drive is the one failure that hard-stops the
  # shop - PostgreSQL refuses writes (no sales can be rung) and backups can't be
  # written either. Check the drive holding $BackupDir and escalate BEFORE it
  # fills, while there's still room to act. Off-site alerting for free: this rides
  # the same healthchecks.io ping the mirror/freshness checks already use.
  $lowDisk = $false
  try {
    $backupDrive = (Get-Item $BackupDir).PSDrive
    if ($backupDrive) {
      $freeGB = [math]::Round($backupDrive.Free / 1GB, 1)
      Log "Free space on $($backupDrive.Name): drive: ${freeGB} GB."
      if ($freeGB -lt $MinFreeGB) {
        $lowDisk = $true
        Log "WARNING: only ${freeGB} GB free on the backup drive (< ${MinFreeGB} GB) - a full disk stops sales AND backups. Free space now."
      }
    }
  } catch {
    Log "WARNING: could not check free disk space: $($_.Exception.Message)"
  }

  # The local backup is verified good. If the off-site mirror didn't complete, the
  # newest good backup is stale, or the disk is running low, surface it as a soft
  # failure to healthchecks - the local dump still protects against corruption/
  # bad-migration, but drive failure/theft, a decaying backup set, or a filling
  # disk all need attention before they turn into lost sales.
  if ($mirrorOk -and -not $stale -and -not $lowDisk) {
    Send-Ping "" ($log -join "`n")
  } else {
    $why = @()
    if (-not $mirrorOk) { $why += "OFF-SITE (Google Drive) mirror did NOT complete" }
    if ($stale) { $why += "newest good backup is stale (> ${MaxGoodAgeHrs}h)" }
    if ($lowDisk) { $why += "backup drive is low on space (< ${MinFreeGB} GB free)" }
    Send-Ping "/fail" (($log -join "`n") + "`n`nLocal backup OK but: " + ($why -join "; ") + " - see log above.")
  }
} catch {
  $err = $_.Exception.Message
  Write-Error $err
  Send-Ping "/fail" (($log -join "`n") + "`n`nBACKUP FAILED: $err")
  exit 1
}
