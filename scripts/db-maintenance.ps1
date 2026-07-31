# DreamyCafe - monthly database & disk maintenance
# Five cheap jobs that keep the mini-PC fast and its disk from creeping up over
# YEARS of 24/7 operation:
#   1. Prune old PrintJob rows        - print-failure records nobody needs after 90 days
#   2. VACUUM ANALYZE                 - reclaim dead tuples & refresh planner stats so
#                                       indexed queries stay fast (autovacuum's safety net)
#   3. Trim desktop.log               - the one log NSSM doesn't rotate; cap it so it
#                                       can't grow unbounded on disk
#   4. Drive health (SMART)           - wear % and uncorrected errors, so a dying SSD
#                                       shows up months early instead of on the day.
#                                       TEMPERATURE is tracked too, and on this box it is
#                                       the metric that actually matters - see below.
#   5. Prune Windows temp folders      - 1.8 GB of orphaned temp/installer files had piled
#                                       up by day two; nothing in Windows clears them
# Safe to run from Task Scheduler. None of this touches live sales data beyond
# deleting stale print-failure rows.
#
# Manual run:  powershell -ExecutionPolicy Bypass -File scripts\db-maintenance.ps1
#
# Failure alerting: MAINTENANCE_HEALTHCHECK_URL if set, else the shared
# BACKUP_HEALTHCHECK_URL (in .env or the environment). Pings <url> on success and
# <url>/fail on any error. Leave both unset to disable.
#
# Prefer a DEDICATED check. Sharing the backup's check still emails you when this
# job FAILS, but it gives no dead-man's cover: the backup pings that same check
# every night, so if this monthly task silently STOPS running (disabled, renamed,
# lost in a PC migration) the check stays green and nothing ever tells you. A
# dedicated check with a ~35-day period alarms on that silence instead.

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

# --- Config -----------------------------------------------------------------
$Psql              = if ($env:PG_BIN) { Join-Path $env:PG_BIN "psql.exe" } else { "C:\PostgreSQL\bin\psql.exe" }
$DbHost            = "localhost"
$DbPort            = "5432"
$DbName            = "dreamycafe"
$DbUser            = "postgres"
$DbPassword        = Get-DbPassword             # from PGPASSWORD or parsed from DATABASE_URL in .env; never hardcoded
$PrintJobKeepDays  = 90                         # delete PrintJob rows older than this
$DesktopLogMaxMB   = 5                          # trim desktop.log once it passes this size
$DiskTempWarnC     = 60                         # log a "check the vents" warning at/above this
$DiskTempAlarmC    = 70                         # raise a real alert: these drives throttle here
$TempFileAgeDays   = 7                          # only delete temp files older than this, so a
                                                # running installer's scratch files are never pulled
                                                # out from under it
# ---------------------------------------------------------------------------

if (-not $DbPassword) { throw "No DB password: set PGPASSWORD in the environment or add it to .env" }

# --- Failure alerting -------------------------------------------------------
# Dedicated check wins; falls back to the backup's so alerting still works when
# only that one is configured (header explains why dedicated is better).
$HealthcheckUrl = Get-EnvValue "MAINTENANCE_HEALTHCHECK_URL"
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
# logs\db-maintenance.log — same convention as restore-drill.ps1. The file matters most
# for the SMART wear figure: that number is only useful as a TREND, and the scheduled run
# is hidden and monthly, so without a durable record every reading is discarded moments
# after it is taken. The file write is best-effort so a locked log can never cost the alert.
$logsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
$logFile = Join-Path $logsDir "db-maintenance.log"

$log = New-Object System.Collections.Generic.List[string]
function Log($msg) {
  $line = "$(Get-Date -Format s)  $msg"
  Write-Output $line
  $log.Add($line)
  Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

# Run one SQL statement, return psql's stdout (trimmed). Throws on non-zero exit
# with psql's own error text so a failure is diagnosable, not just "maintenance failed".
# The SQL is written to a temp .sql file and run with -f: PostgreSQL identifiers
# like "PrintJob" are case-sensitive and MUST keep their double-quotes, but passing
# them via -c lets PowerShell's native-arg quoting strip the quotes (psql then
# lowercases to printjob -> "relation does not exist"). A file sidesteps all shell
# quoting so the SQL reaches psql byte-for-byte.
function Invoke-Sql($Sql) {
  $tmp = Join-Path $env:TEMP ("dc-maint-" + [Guid]::NewGuid().ToString("n") + ".sql")
  Set-Content -Path $tmp -Value $Sql -Encoding UTF8
  try {
    $out = ((& $Psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -At -f $tmp 2>&1) |
      ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" } }) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "psql failed on: $Sql`npsql said:`n$($out.Trim())" }
    return $out.Trim()
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

try {
  if (-not (Test-Path $Psql)) { throw "psql not found at $Psql" }

  $env:PGPASSWORD = $DbPassword
  try {
    # 1. Prune stale PrintJob rows. This table gains a row per failed/attempted
    #    print and nothing else ever deletes them - pure operational noise after
    #    a few months. Report how many went so the log shows it's working.
    # DELETE ... RETURNING wrapped in a CTE so the row count comes back on stdout
    # (-At swallows the "DELETE <n>" command tag), giving a reliable number to log.
    $delCount = Invoke-Sql "WITH d AS (DELETE FROM ""PrintJob"" WHERE ""createdAt"" < now() - interval '$PrintJobKeepDays days' RETURNING 1) SELECT count(*) FROM d;"
    Log "PrintJob prune: removed $delCount row(s) older than $PrintJobKeepDays days."

    # 2. VACUUM ANALYZE the whole DB. Every UPDATE/DELETE (order edits, stock
    #    decrements, loyalty increments, cash sessions) leaves dead tuples;
    #    autovacuum normally reclaims them, but running it explicitly monthly is
    #    the safety net that stops table bloat + stale stats from silently
    #    degrading query speed over a year of trading. Cannot run inside a
    #    transaction block, so it's its own statement.
    Invoke-Sql "VACUUM (ANALYZE);" | Out-Null
    Log "VACUUM ANALYZE completed - dead tuples reclaimed, planner stats refreshed."
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }

  # 3. Trim desktop.log if it's grown past the cap. NSSM rotates app-*/tunnel-*
  #    logs, but desktop.log is written outside NSSM and nothing else bounds it.
  #    Keep the tail (recent lines are the useful ones) and drop the rest.
  $desktopLog = Join-Path (Split-Path $PSScriptRoot -Parent) "logs\desktop.log"
  if (Test-Path $desktopLog) {
    $sizeMB = [math]::Round((Get-Item $desktopLog).Length / 1MB, 2)
    if ($sizeMB -gt $DesktopLogMaxMB) {
      $keep = Get-Content $desktopLog -Tail 2000 -ErrorAction SilentlyContinue
      Set-Content -Path $desktopLog -Value $keep -Encoding UTF8
      $newMB = [math]::Round((Get-Item $desktopLog).Length / 1MB, 2)
      Log "Trimmed desktop.log: ${sizeMB}MB -> ${newMB}MB (kept last 2000 lines)."
    } else {
      Log "desktop.log is ${sizeMB}MB (<= ${DesktopLogMaxMB}MB) - no trim needed."
    }
  }

  # 4. Drive health (SMART). backup-db.ps1 already alarms on FREE SPACE; this
  #    covers the other way a disk kills a 24/7 box - the drive wearing out or
  #    developing uncorrectable errors. Two tiers so the alert stays meaningful:
  #    a worn-but-working drive is a "plan a replacement" note in the monthly
  #    email, while a failing one raises the same alarm as a broken backup.
  #    Best-effort by design: plenty of consumer/OEM SSDs report no Wear value
  #    through the Windows storage stack, and a missing counter must never fail
  #    the run or invent an alarm.
  $diskAlarm = @()
  try {
    foreach ($disk in @(Get-PhysicalDisk -ErrorAction Stop)) {
      $name    = $disk.FriendlyName
      $health  = $disk.HealthStatus
      $wear    = $null
      $badRead = $null
      $badWrite = $null
      $hours   = $null
      $temp    = $null
      try {
        $rc = $disk | Get-StorageReliabilityCounter -ErrorAction Stop
        $wear = $rc.Wear; $badRead = $rc.ReadErrorsUncorrected; $badWrite = $rc.WriteErrorsUncorrected; $hours = $rc.PowerOnHours
        $temp = $rc.Temperature
      } catch {
        # Counters unavailable (drive/controller doesn't expose them, or the task
        # isn't running elevated). Logged, not warned: HealthStatus still applies,
        # and this line is what tells you WHY wear reads n/a.
        Log "Disk '$name': reliability counters unavailable ($($_.Exception.Message.Trim()))"
      }

      $detail = "health=$health"
      if ($null -ne $wear)  { $detail += ", wear=${wear}%" } else { $detail += ", wear=n/a" }
      if ($null -ne $hours) { $detail += ", powerOnHours=$hours" }
      if ($null -ne $temp)  { $detail += ", temp=${temp}C" }
      if ($badRead -or $badWrite) { $detail += ", uncorrectedErrors=read:$badRead/write:$badWrite" }
      Log "Disk '$name': $detail"

      # Critical - act now.
      if ($health -eq 'Unhealthy')            { $diskAlarm += "'$name' reports HealthStatus=Unhealthy" }
      if ($null -ne $wear -and $wear -ge 90)  { $diskAlarm += "'$name' is at ${wear}% of rated write life" }
      if ($badRead -gt 0 -or $badWrite -gt 0) { $diskAlarm += "'$name' has uncorrected read/write errors (read:$badRead write:$badWrite)" }
      # Wearing out - plan ahead, don't cry wolf.
      if ($health -eq 'Warning')                              { Log "WARNING: disk '$name' HealthStatus=Warning - plan a replacement." }
      if ($null -ne $wear -and $wear -ge 80 -and $wear -lt 90) { Log "WARNING: disk '$name' is at ${wear}% of rated write life - plan a replacement in the next few months." }

      # TEMPERATURE is the one that actually matters on this hardware, and it is the
      # reverse of what the wear check implies. Measured 2026-07-30: the POS writes
      # ~3 MB/h, which is ~0.03 TB/year against a ~100 TBW rating - the drive will not
      # wear out this century. But this is a Mini/DM chassis with one small blower fan,
      # destined for a cafe: grease and flour clog the intake, and heat is what kills
      # NVMe controllers and nearby capacitors. So a rising temperature trend is the
      # early warning here, not the wear percentage.
      #
      # 60C is the "check the vent" line, not a failure - these drives throttle around
      # 70-80C. The absolute number matters less than the direction: the reading is
      # logged every run so a slow climb over a year is visible, which is the whole
      # reason this writes to a file instead of only alerting.
      if ($null -ne $temp -and $temp -ge $DiskTempWarnC) {
        Log "WARNING: disk '$name' is at ${temp}C (>= ${DiskTempWarnC}C). Check the fan and vents for dust - a Mini chassis in a cafe clogs. Heat, not wear, is this box's real disk risk."
      }
      if ($null -ne $temp -and $temp -ge $DiskTempAlarmC) { $diskAlarm += "'$name' is running at ${temp}C - cooling is failing or the intake is blocked" }
    }
  } catch {
    Log "WARNING: could not read disk health: $($_.Exception.Message)"
  }

  # 5. Prune Windows temp folders. Nothing in Windows clears these on a schedule -
  #    Storage Sense is off by default on Pro, and this box has no human noticing a
  #    shrinking C: drive. Measured 2026-07-30 (day two of the build): 933 MB in
  #    C:\Windows\Temp plus 911 MB in the user's Temp. That is disk creep, and disk
  #    creep is what eventually trips backup-db.ps1's 5 GB free-space alarm - the one
  #    failure that stops PostgreSQL writing and therefore stops sales.
  #
  #    Deliberately conservative: only files older than $TempFileAgeDays, so a running
  #    installer's scratch files are never deleted out from under it, and every error
  #    is swallowed per-file. A locked temp file is completely normal and must not fail
  #    the run or raise an alarm.
  #    ELEVATION MATTERS HERE, and it fails silently without this note. Most of
  #    C:\Windows\Temp is owned by SYSTEM: unelevated, Get-ChildItem cannot even
  #    ENUMERATE it, so the pass reports "removed 0, 0 in use" against a folder holding
  #    hundreds of MB and looks broken rather than blocked. The scheduled task runs
  #    RunLevel=Highest so the real monthly run does clear it; a manual run from a normal
  #    PowerShell window will only do the user's own Temp. Say which one happened.
  $tempDirs = @("$env:WinDir\Temp", $env:TEMP)
  $cutoff = (Get-Date).AddDays(-$TempFileAgeDays)
  $elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $elevated) {
    Log "NOTE: not elevated - C:\Windows\Temp will report 0 files because its contents cannot be listed, not because it is clean. The scheduled task runs elevated and does clear it."
  }
  foreach ($dir in ($tempDirs | Select-Object -Unique)) {
    if (-not (Test-Path $dir)) { continue }
    $freedMB = 0; $removed = 0; $locked = 0
    foreach ($f in @(Get-ChildItem -Path $dir -Recurse -File -Force -ErrorAction SilentlyContinue)) {
      if ($f.LastWriteTime -ge $cutoff) { continue }
      $mb = $f.Length / 1MB
      try { Remove-Item $f.FullName -Force -ErrorAction Stop; $freedMB += $mb; $removed++ }
      catch { $locked++ }
    }
    # Empty directories left behind by the pass, best-effort and non-recursive-safe.
    foreach ($d in @(Get-ChildItem -Path $dir -Recurse -Directory -Force -ErrorAction SilentlyContinue | Sort-Object { $_.FullName.Length } -Descending)) {
      if (-not @(Get-ChildItem -Path $d.FullName -Force -ErrorAction SilentlyContinue).Count) {
        Remove-Item $d.FullName -Force -ErrorAction SilentlyContinue
      }
    }
    Log ("Temp prune '{0}': removed {1} file(s), freed {2} MB, {3} in use (normal)." -f $dir, $removed, [math]::Round($freedMB, 1), $locked)
  }

  if ($diskAlarm.Count -gt 0) {
    # Everything above this line succeeded; the throw exists purely to raise the
    # /fail alert through the same channel as a real maintenance failure.
    throw "DISK HEALTH ALARM (the maintenance jobs themselves completed OK): $($diskAlarm -join '; '). Order a replacement drive and restore from backup onto it - see docs/migrate-to-new-pc.md."
  }

  Log "Maintenance completed OK."
  Send-Ping "" ($log -join "`n")
} catch {
  $err = $_.Exception.Message
  Write-Error $err
  Send-Ping "/fail" (($log -join "`n") + "`n`nMAINTENANCE FAILED: $err")
  exit 1
}
