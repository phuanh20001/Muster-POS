# Database & Backup Guide

How the DreamyCafe POS database is stored, backed up, and restored. Written for the shop owner — every command can be copy-pasted into **PowerShell** on the shop PC.

---

## 1. The database at a glance

| Thing | Value |
|---|---|
| Engine | PostgreSQL 18 (Windows service `postgresql-x64-18`) |
| Install path | `C:\PostgreSQL` (tools live in `C:\PostgreSQL\bin`) |
| Database name | `dreamycafe` |
| Host / port | `localhost` : `5432` |
| User | `postgres` |
| Password | **Not recorded here.** It lives in one place only: `DATABASE_URL` inside `.env` — which is gitignored and in no backup (see [§1a](#1a-whats-in-the-backup-and-what-isnt)). Every ops script resolves it from there via `Get-DbPassword`, so nothing else needs a copy |
| Data location | On this PC only — **there are no managed/cloud backups except the ones below** |

The app connects via `DATABASE_URL` in `.env`. Prisma is the ORM; schema changes are made with `npx prisma migrate dev` and the live DB is updated on deploy by `prisma migrate deploy` (part of `npm run start`).

> ⚠️ **All shop data — orders, customers, cash sessions, timesheets — lives only on this machine.** If the drive fails or the PC is lost/stolen, the backups described here are the only way to recover. Take them seriously.

---

## 1a. What's in the backup (and what isn't)

Each nightly run produces up to **three** files in `backups\` (all mirrored to Google Drive):

| File | Contains |
|---|---|
| `dreamycafe_<stamp>.dump` | The **entire PostgreSQL database** — full schema **and** data: every order, order item, customer, voucher, cash session & movement, timesheet (clock record), the full menu (products, sizes, modifiers, categories, combos), inventory/purchasing, reservations, and all app settings (payment/feature/printer/reader config). ~30+ tables. This is a `pg_dump -Fc` snapshot, restorable onto an empty PostgreSQL from scratch. |
| `uploads_<stamp>.zip` | **Product image files** from `public/uploads/products/`. The DB stores only the image *path* (`Product.imageUrl`), not the bytes — so the files are captured separately here. Only created when at least one image exists. |
| `caddy-root-ca.crt` | The **public** LAN-TLS root certificate that every till tablet trusts ([lan-tls.md](lan-tls.md)) — the file you hand to a new iPad. Not timestamped: it rarely changes, so each run just overwrites it. Only copied if LAN TLS is installed. Contains no secret. |

### ⚠️ What the backup does NOT contain — you must protect these separately

| Not backed up | Why it matters | How to protect it |
|---|---|---|
| **`.env`** (secrets) | Holds `DATABASE_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `SQUARE_ACCESS_TOKEN`, `PUBLIC_ZONE_SECRET`, printer IPs, etc. **A DB restore won't start the app without it.** It's gitignored on purpose, so it's in *no* backup and *no* git. | Keep a copy somewhere secure and off-machine (a password manager, or an encrypted note). Update the copy whenever you change a secret. |
| **App code / `node_modules` / `.next`** | The running application itself. | Comes from git (`git clone`) + `npm install` + `npm run build`. |
| **The actual card charges** | Money lives in Stripe/Square, not here — the DB only records *your* order/payment rows. | Managed by Stripe/Square; nothing to do. |
| **The Caddy CA *private key*** (LAN TLS) | Deliberately excluded. This folder is mirrored to Google Drive, and anyone holding that key could mint certificates your till tablets trust. Only the public `.crt` above is copied. | Nothing — and that's the right call. If the key is ever lost, Caddy mints a new root and you re-trust the 2–3 tablets (~10 min, [lan-tls.md](lan-tls.md#if-caddys-data-dir-is-lost)). Cheaper and safer than storing it in the cloud. |
| **Cloudflare tunnel credentials** (`.cloudflared\cert.pem` + `<uuid>.json`) | Without them the public site can't be re-established on a new machine without re-creating the tunnel. | Keep a copy with your off-machine `.env` copy — see [RUNBOOK §7A](../RUNBOOK.md#7a-annual--calendar-upkeep-the-walk-away-list). |

**To fully rebuild the shop on a new PC you need three things — only the first two are in these backups:**
1. the latest `.dump` + `uploads_*.zip` (data + images) — automated nightly ✅
2. a copy of **`.env`** (secrets) — **you must keep this yourself** ⚠️
3. the app code from git + `npm install` + `npm run build` ✅

> Moving a **live** shop to a new mini PC (carry the data across, cut the tunnel over,
> decommission the old box)? Follow [migrate-to-new-pc.md](migrate-to-new-pc.md) for the ordered procedure.

---

## 2. How backups work

A single script does everything: [`scripts/backup-db.ps1`](../scripts/backup-db.ps1).

Each run:

1. Runs `pg_dump` to create a **compressed, restorable** dump (`-Fc` custom format).
2. **Verifies the dump** — asserts it's at least 1 KB and that `pg_restore -l` can read the archive back. A dump that fails this (e.g. truncated by a full disk or a client/server version mismatch) is deleted and the run fails, so a corrupt file can never masquerade as a good backup.
3. Saves it locally as `backups/dreamycafe_<timestamp>.dump`.
4. **Archives product images** (if any) from `public/uploads/products/` to `backups/uploads_<timestamp>.zip` — same timestamp as the dump, so image files and their DB references restore together. Best-effort: a failure here warns but never fails the DB backup.
5. **Copies both to Google Drive** at `G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\` (Google Drive for Desktop syncs them to the cloud automatically), each verified at full size. The machine-name subfolder matters: if two POS boxes ever share one Google account, a single shared folder would interleave their dumps under identical names, and each machine's prune would delete the other's history.
6. **Prunes old copies** (dumps and image zips): local kept **30 days**, cloud kept **90 days** — but the **7 newest are always kept** regardless of age, so a run of failed backups can never prune the folder empty.

If Google Drive isn't mounted, the cloud copy is skipped with a warning and the **local backup still succeeds** — the script never fails just because Drive is offline. When Drive *is* mounted, the script verifies the copy landed at the exact source size and checks that **Google Drive for Desktop (`GoogleDriveFS`) is actually running** — if the file was copied into the folder but Drive isn't running (so nothing will upload), that's flagged as a soft failure (see §3.1). Note: Google uploads in the background and the local filesystem can't confirm the cloud *received* the file — that's what the off-site check + occasional restore drill are for.

**When a dump fails its integrity check** (§2 step 2), it is **not** silently deleted — it's moved to `backups\quarantine\<name>.dump.corrupt` so you can inspect it, and the real `pg_restore` error (e.g. *"input file does not appear to be a valid tar archive"*, or a disk-full / permission message) is included in the `/fail` alert. Quarantined files are ignored by every "newest good backup" scan, so a corrupt dump can never be restored by mistake. You can safely delete the `quarantine\` folder once you've diagnosed the cause.

**Freshness guard:** every run reports how old the newest verified-good backup is and how many good dumps are retained (e.g. *"Newest good backup: … (0h old); 36 good dump(s) retained"*). If that newest good backup is older than **48 hours** (`$MaxGoodAgeHrs`) — meaning backups have quietly been failing and you'd otherwise be leaning on one aging copy — the run pings `/fail` so you're told **before** the good set decays, not after.

```
pg_dump  ->  backups\dreamycafe_<stamp>.dump   (local, 30-day retention)
                       |
                       v  (copied by the script)
         G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\   (synced to Google Drive cloud, 90-day retention)
```

### What's where

| Location | Path | Purpose |
|---|---|---|
| Local backups | `C:\path\to\DreamyCafe\backups\` | Fast on-machine restore (gitignored — never committed) |
| Cloud backups | `G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\` | Off-machine safety (drive failure / theft / fire) — one subfolder per machine |

---

## 3. The automatic schedule

A Windows **Task Scheduler** job runs the script every night.

| Setting | Value |
|---|---|
| Task name | `DreamyCafe DB Backup` |
| Runs | Daily at **9:30 PM** |
| Catch-up | `-StartWhenAvailable` — if the PC was off at 9:30 PM, it runs the next time the PC is on |

You don't need to do anything day to day. To check or manage it:

```powershell
# See the task and when it last ran (LastTaskResult 0 = success)
Get-ScheduledTaskInfo -TaskName "DreamyCafe DB Backup"

# Run a backup right now (without waiting for 9:30 PM)
Start-ScheduledTask -TaskName "DreamyCafe DB Backup"
```

### Re-creating the schedule (only if it's ever deleted)

Run the registration script — **no Administrator shell needed**, and no paths to edit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
# optional: -At 10:00PM to change the time
```

> **Why this task is *not* elevated and *not* "run whether user is logged on or not".**
> Google Drive mounts `G:\My Drive` inside the **logged-on user session**. A task running in
> session 0 (S4U), or elevated with a different token, may not see that drive letter at all —
> the local dump would keep succeeding while the off-site mirror silently never ran. That is
> the precise half-failure the autologon setup exists to prevent, so the task runs as the
> interactive user at normal privilege. `pg_dump` needs nothing more.

---

## 3.1 Get alerted if a backup fails (recommended)

A backup that quietly stops working is invisible until the day you need it. Set up a **dead-man's switch** so you get an email if a nightly backup fails *or never runs at all* (PC off, task deleted) — the two failure modes an in-script alert can't catch on its own.

The script uses [healthchecks.io](https://healthchecks.io) (free): each successful run "pings" a secret URL; if a ping doesn't arrive on schedule, healthchecks.io emails you.

1. Sign up at <https://healthchecks.io> and create a check named `DreamyCafe DB Backup`.
2. Set its **period** to `1 day` and **grace** to a few hours (so a late run after the PC was off doesn't false-alarm).
3. Add your email under **Integrations** (this is where the alert goes).
4. Copy the check's **ping URL** (looks like `https://hc-ping.com/<uuid>`).
5. Open `.env` and set it:
   ```
   BACKUP_HEALTHCHECK_URL=https://hc-ping.com/<uuid>
   ```
6. Run a backup once (`Start-ScheduledTask -TaskName "DreamyCafe DB Backup"`) and confirm the check flips to **up** on healthchecks.io.

From then on: a good nightly backup keeps the check green; a failed dump, a corrupt archive, or an off-site mirror that didn't complete pings `/fail` (immediate email); and if the PC is off or the task was deleted so *no* ping arrives within the grace window, healthchecks.io emails you anyway. Leave `BACKUP_HEALTHCHECK_URL` unset to disable alerting entirely (the backup still runs).

> The alert is off-site by design — it lives on healthchecks.io, so it still fires even if the shop PC is the thing that's down.

---

## 3.2 Monthly maintenance (keeps the POS fast over years)

Backups protect your data; **maintenance keeps a 24/7 mini-PC from slowly getting slower.** `scripts/db-maintenance.ps1` runs four cheap jobs and is registered to run **monthly (Sundays at 3:00 AM)** — well clear of the 9:30 PM backup and all trading hours.

What it does each run:

1. **Prunes `PrintJob` rows older than 90 days.** Every failed/attempted print writes a row and nothing else ever deletes them — pure operational noise you never need after a few months.
2. **`VACUUM ANALYZE`.** Reclaims dead tuples left by every `UPDATE`/`DELETE` (order edits, stock decrements, loyalty, cash sessions) and refreshes the planner's stats so your indexed reports stay fast. This is the classic reason a Postgres POS "feels slower after a year" if it's never run — autovacuum usually handles it, this is the guaranteed safety net.
3. **Trims `logs/desktop.log`.** The app/tunnel logs rotate automatically at 10 MB, but `desktop.log` is written outside that and would otherwise grow forever. Capped at 5 MB (keeps the most recent 2000 lines).
4. **Checks drive health (SMART).** The disk-space alarm below catches a *full* disk; this catches a *dying* one — SSD wear percentage and uncorrected read/write errors, which matter on a box that writes 24/7 (and doubly so on a used ex-corporate mini-PC that arrived with hours already on it). Two tiers, so the alert stays worth reading:
   - **80–89% wear**, or `HealthStatus = Warning` → a `WARNING` line in the normal monthly success email. *Plan a replacement in the next few months.*
   - **90%+ wear**, `HealthStatus = Unhealthy`, or **any uncorrected errors** → pings `/fail`. *Order a drive now* and restore onto it via [migrate-to-new-pc.md](migrate-to-new-pc.md).

   Best-effort by design: many consumer/OEM SSDs don't expose a wear value through the Windows storage stack. When that happens the log shows `wear=n/a` plus the reason, and the run continues normally — a missing counter never fails maintenance and never invents an alarm. Check the first run's log to see whether *your* drive reports wear; if it reads `n/a` every month, that's the drive, not a fault.

Alerting uses `MAINTENANCE_HEALTHCHECK_URL` if set, otherwise it falls back to the backup's `BACKUP_HEALTHCHECK_URL` — pings on success, `/fail` with the real error if any job breaks. Unset both = no alerting, jobs still run.

```
MAINTENANCE_HEALTHCHECK_URL=https://hc-ping.com/<uuid>   # optional; falls back to BACKUP_HEALTHCHECK_URL
```

> **Give it its own check if you can** — same reasoning as the restore drill below. Sharing the
> backup's check still emails you when a job **fails**, but it gives no dead-man's cover: the backup
> pings that check every night, so if this monthly task quietly **stops running** the check stays
> green and nothing ever tells you. A dedicated check with a **~35-day period** alarms on that
> silence instead.

Register it once in an **Administrator** PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-maintenance-task.ps1
```

Run it any time by hand (safe — only deletes stale print-failure rows):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\db-maintenance.ps1
```

### Disk-space alarm (built into the backup)

A **full disk is the one failure that stops the shop dead** — PostgreSQL refuses to write (no sales can be rung) *and* backups can't be saved. Every backup run now checks free space on the backup drive and pings `/fail` (off-site email) once it drops below **5 GB**, so you get warned while there's still room to clear space rather than after sales have already stopped. No setup needed beyond the healthcheck URL above.

### Hardware / OS items for go-live (not code)

These can't be fixed in the app — they belong on the go-live checklist for the mini-PC:

| Item | Why it matters for 24/7 | What to do |
| --- | --- | --- |
| **Write-cache flushing** (the free substitute for a UPS — see below) | This is what turns a survivable power cut into a corrupt database. PostgreSQL is crash-safe *provided* the drive actually flushes when told to | Device Manager → **Disk drives** → the system drive → Properties → **Policies**. Leave **"Turn off Windows write-cache buffer flushing on the device"** **unticked** (the default). Ticking it is what makes a hard power cut dangerous |
| **Windows Update reboots** | An unattended 2 AM reboot can leave the POS down until someone notices | Set **active hours** so updates never reboot during trade; the services auto-start on boot, so a reboot outside trade self-recovers |
| **Time sync** | Reports and the day-boundary key off local time; clock drift skews the trading day | Confirm Windows time sync is on (`w32tm /query /status`) |

#### Decision: no UPS (deliberate — don't re-raise it)

Earlier drafts of these docs recommended a UPS. **That has been decided against.** In a power
cut the espresso machine, grinder, fridge, lights and Wi-Fi are all down, so the shop closes
regardless — keeping the POS alive buys nothing.

Worth being precise about what that accepts, because the UPS was serving *two* purposes and only
one of them is answered by "we'd close anyway":

- **Availability during an outage** — correctly dismissed. No value.
- **Clean shutdown to protect Postgres** — a real but modest residual risk, knowingly accepted.
  PostgreSQL is *designed* to survive a hard power cut (write-ahead log + crash recovery); it goes
  wrong mainly when the storage layer lies about flushing to disk, which is why the write-cache
  row above is the mitigation that actually matters and costs nothing. The blast radius is bounded
  by the nightly verified backup: worst case you restore last night's dump and lose up to one
  trading day.

Take that free write-cache check and the risk is small enough that the UPS isn't worth the
cupboard space.

---

## 4. Running a backup manually

Any time you want an immediate backup (e.g. before a risky change or a migration):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\DreamyCafe\scripts\backup-db.ps1"
```

Expected output:

```
2026-06-15T13:29:56  Backup OK -> C:\...\backups\dreamycafe_2026-06-15_132956.dump (0.06 MB)
2026-06-15T13:29:56  Mirrored to Google Drive -> G:\My Drive\DreamyCafe-Backups
```

If you see `Google Drive not detected ... cloud mirror skipped`, the local backup still worked — just make sure Google Drive for Desktop is running (see §7).

---

## 5. Restoring from a backup

### First: find the newest *restorable* backup

Before restoring, run this to find the newest dump that actually passes an integrity check — if the most recent one is corrupt, it automatically **falls back to the newest good one** and prints the exact restore command. It's **read-only** and never touches the live database:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\find-good-backup.ps1
```

It scans both the local `backups\` folder and the Google Drive copy, newest-first, so even if the whole local folder is lost you'll be pointed at a good off-site copy. (Note: a bad backup is normally deleted the moment it's created — see §2 step 2 — so this is a safety net for on-disk rot, not something you should routinely hit.)

### Option A — Restore over the live database (real recovery)

Use this when the live data is lost or corrupted. `--clean` drops existing objects first, so it **overwrites current data** with the backup. Use the file that `find-good-backup.ps1` reported as newest-good.

```powershell
$env:PGPASSWORD = "<your-db-password>"   # from DATABASE_URL in .env
& "C:\PostgreSQL\bin\pg_restore.exe" -h localhost -U postgres -d dreamycafe --clean --if-exists "<path-to-.dump>"
$env:PGPASSWORD = ""
```

`<path-to-.dump>` can be a file from `backups\`, from `G:\My Drive\DreamyCafe-Backups\`, or one downloaded from drive.google.com onto another machine.

**Also restore the product images.** The DB only holds image paths; the files come from the matching `uploads_<stamp>.zip`. Extract it back into place (use the zip with the **same timestamp** as the dump you restored):

```powershell
Expand-Archive -Path "backups\uploads_<stamp>.zip" -DestinationPath "public\uploads\products" -Force
```

If you skip this, the app runs fine but product photos show broken until re-uploaded.

> Stop the POS app before restoring over the live DB, then restart it afterward. And remember: a DB restore on a **fresh machine** also needs your **`.env`** file put back (it's not in any backup — see §1a).

### Option B — Test a backup safely (no risk to live data)

Restores into a throwaway database to prove a backup is good, then deletes it. **Do this occasionally** — a backup you've never restored is only a guess.

**Automated:** run `scripts\restore-drill.ps1` (same steps as below). A quarterly Task Scheduler job can be registered with `scripts\register-restore-drill-task.ps1` (Administrator).

The drill restores the newest dump into `restore_test`, runs `pg_restore --exit-on-error` (so a
dump that restores with *per-object* errors fails rather than falsely passing), sanity-checks that
`SELECT COUNT(*) FROM "Order"` returns a real integer, then drops the scratch DB. It never touches
the live database.

**It reports where you'll see it.** The scheduled task runs hidden, so every run appends to
`logs\restore-drill.log` **and** pings a healthcheck — a pass on success, `/fail` with the error on
failure. Without that, a failing quarterly drill would sit undetected for a year, which defeats the
one job whose entire purpose is proving the backups are recoverable.

```
RESTORE_DRILL_HEALTHCHECK_URL=https://hc-ping.com/<uuid>   # optional; falls back to BACKUP_HEALTHCHECK_URL
```

> **Give it its own check if you can.** Sharing `BACKUP_HEALTHCHECK_URL` works and you'll still get
> failure emails, but a dedicated check with a **90-day period and a 7-day grace** also tells you when
> the drill stops running *at all* — the quarterly equivalent of the dead-man's switch the nightly
> backup already has. Leave both unset and the drill still runs, just silently.

**Set the grace deliberately — the default is too tight here.** The task trigger is
`-Weekly -WeeksInterval 13`, i.e. **exactly 91 days** between runs, and healthchecks.io only alarms
after `period + grace`. With a 2-day grace that's a 92-day window against a 91-day interval — a
**one-day margin**, which a PC that was switched off on the scheduled Monday will blow. The result is
a false "down" email on a healthy system, and false alarms are what train you to ignore the real one.
A 7-day grace gives 97 days against 91 — six days of slack, still surfacing a genuinely dead drill
inside a week.

| Check | Task trigger | Real interval | Period | Grace | Margin |
|---|---|---|---|---|---|
| DB Backup | daily 21:30 | 1 day | 1 day | 5 min – 1 h | tight by design; a missed night matters |
| DB Maintenance | `-WeeksInterval 4` | 28 days | 5 weeks | 2 days | 9 days |
| Restore Drill | `-WeeksInterval 13` | 91 days | 90 days | **7 days** | 6 days |
| Feature Update Reminder | `-WeeksInterval 26` | 182 days | see below — **not** a dead-man's switch | | |

Note that maintenance is **4-weekly, not calendar-monthly** — it drifts earlier through the year, so
don't set its period from the word "monthly."

### The feature-update reminder is the one check that works backwards

```
FEATURE_UPDATE_HEALTHCHECK_URL=https://hc-ping.com/<uuid>   # optional; NO fallback, by design
```

Every other check here is a **dead-man's switch**: the script pings on success and healthchecks.io
alarms when the pings *stop*. [feature-update-reminder.ps1](../scripts/feature-update-reminder.ps1)
is the opposite — it exists to **tell a human to do something**, so it pings **`/fail`** on every run.
A plain ping means "up" and sends no notification at all; `/fail` raises one immediately and carries
the message body, which includes the currently pinned Windows version read live from the registry.

It also makes the dashboard read correctly: the check stays **DOWN for as long as the feature update
is still outstanding**. Clear it by pinging the plain URL, or resolving it in the dashboard, once the
update is installed and re-pinned with `configure-windows-updates.ps1`.

> **Why this needs an off-box channel at all.** The script also writes
> `logs\feature-update-reminder.log` and pops an `msg.exe` box, and on a normal desktop that would be
> enough. This box is not a normal desktop: it runs 24/7 headless behind autologon + immediate lock,
> so on the day the reminder actually fires there is **nobody signed in**. The popup lands on a locked
> screen and the log is never read. Without the ping the reminder reaches no one — and what it is
> guarding is real: the Windows feature version is pinned so the semi-annual upgrade can't install
> itself mid-trade, and a pin left alone eventually **falls out of servicing and stops receiving
> security patches**.

⚠ **Give it a dedicated check — there is deliberately no fallback to `BACKUP_HEALTHCHECK_URL`**,
unlike `db-maintenance.ps1`. Because this script pings `/fail`, a shared check would announce a
**backup failure that never happened**, on the one check that has to stay trustworthy. If the key is
unset the reminder still runs and says so in its log (`NO ALERT SENT`), rather than failing quietly.

**Use a `Simple` schedule — `Period 26 weeks`, `Grace 14 days`.** Not `Cron`, and specifically not
`OnCalendar`. The task trigger is `-Weekly -WeeksInterval 26`, which is a **182-day rolling interval,
not a calendar half-year** — 182 days is shorter than six months, so the reminder creeps earlier
through the year (the same drift already called out above for the 4-weekly maintenance task). Encoding
calendar dates like `*-01,07-01` would make healthchecks.io expect pings on dates the Windows task
does not actually follow, and the two would diverge a little each cycle until a healthy system starts
producing false "late" alerts. Simple's rolling period mirrors the trigger exactly.

⚠ **Do not leave the dashboard defaults** (`Period 1 day`, `Grace 1 hour`): they would fire a false
alarm about a day after every time the check is cleared.

Setting the period properly earns a second, independent signal rather than just noise: the **`/fail`
ping** says *the reminder fired*, while the **period expiring** says *the reminder never fired at
all* — the case where the scheduled task was lost in a rebuild or the box sat switched off for
months. 196 days (26 weeks + 14) against a real 182-day interval leaves 14 days of slack, chosen the
same way as the restore drill's grace above.

| Check | Task trigger | Real interval | Period | Grace | Margin |
|---|---|---|---|---|---|
| Feature Update Reminder | `-WeeksInterval 26` | 182 days | 26 weeks | **14 days** | 14 days |

```powershell
$env:PGPASSWORD = "<your-db-password>"   # from DATABASE_URL in .env
$bin = "C:\PostgreSQL\bin"

# 1. Fresh scratch DB
& "$bin\dropdb.exe" -U postgres --if-exists restore_test
& "$bin\createdb.exe" -U postgres restore_test

# 2. Restore the latest backup into it
$latest = (Get-ChildItem "C:\path\to\DreamyCafe\backups\*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
& "$bin\pg_restore.exe" -U postgres -d restore_test "$latest"

# 3. Sanity-check (should match your live order count)
& "$bin\psql.exe" -U postgres -d restore_test -c 'SELECT COUNT(*) FROM "Order";'

# 4. Clean up
& "$bin\dropdb.exe" -U postgres restore_test
$env:PGPASSWORD = ""
```

> In PowerShell, table names like `"Order"` must keep their double quotes. The commands above put the SQL in `-c '...'` single quotes so the quotes survive — if you split the query out, the unquoted word `Order` is a reserved word and errors.

---

## 6. Manual one-off dump (without the script)

```powershell
$env:PGPASSWORD = "<your-db-password>"   # from DATABASE_URL in .env
& "C:\PostgreSQL\bin\pg_dump.exe" -h localhost -U postgres -d dreamycafe -Fc -f "C:\path\to\dreamycafe_manual.dump"
$env:PGPASSWORD = ""
```

---

## 7. Google Drive setup (one-time)

The cloud mirror needs **Google Drive for Desktop** signed in on the shop PC:

1. Install from <https://www.google.com/drive/download/>.
2. Sign in with the **shop's** Google account (not a personal one). A free personal Gmail (15 GB) is plenty — compressed dumps are tiny.
3. On the "Choose folders to sync from your computer" screen, **Skip** — do *not* sync Desktop/Documents (that would upload the whole project, including `.env`).
4. Make sure **"See Drive files in File Explorer"** is enabled — this mounts `My Drive` as drive **`G:`**.

Verify it's mounted:

```powershell
Test-Path "G:\My Drive"   # should print True
```

The script auto-detects `G:\My Drive`. If Google ever assigns a different letter, open [`scripts/backup-db.ps1`](../scripts/backup-db.ps1) and set `$GDriveRoot = "<letter>:\My Drive"`.

**Protect the account:** turn on 2-Step Verification and store the recovery codes offline — it holds customer-data backups.

---

## 8. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `pg_dump not found at C:\PostgreSQL\bin\pg_dump.exe` | PostgreSQL install path changed. Find it: `(Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-18'").PathName`, then update `$PgDump` in the script. |
| `Google Drive not detected ... skipped` | Google Drive for Desktop isn't running or `G:` isn't mounted. Start the app; check `Test-Path "G:\My Drive"`. Local backup still succeeded. |
| `password authentication failed` | DB password changed. Update `DATABASE_URL` in `.env` — that is the **only** place it lives; the script reads it from there. |
| Scheduled task didn't run | `Get-ScheduledTaskInfo -TaskName "DreamyCafe DB Backup"` — check `LastTaskResult` (0 = ok). PC may have been off; `-StartWhenAvailable` runs it next boot. |
| healthchecks.io says "down" but backups look fine | The success ping isn't reaching it. Check the shop PC has internet, and that `BACKUP_HEALTHCHECK_URL` in `.env` matches the check's ping URL exactly. Run `Start-ScheduledTask -TaskName "DreamyCafe DB Backup"` and watch the check. |
| Alert: "off-site mirror did not complete" | Local backup is fine, but Google Drive didn't upload — usually `GoogleDriveFS` isn't running or `G:` isn't mounted. Start Google Drive for Desktop; check `Test-Path "G:\My Drive"`. |
| Alert includes a `pg_restore` error / a file appears in `backups\quarantine\` | A dump failed its integrity check and was quarantined for inspection. Read the `pg_restore said:` line in the alert — *"valid tar archive"* usually means the dump was truncated (disk full, or PG was mid-write); a version message means the `C:\PostgreSQL\bin` tools don't match the running server. Fix the cause and re-run; delete the `quarantine\` folder once diagnosed. |
| Alert: "newest good backup is stale (> 48h)" | Backups have been failing for 2+ days and you're leaning on an aging copy. Run a manual backup and watch the output; if it quarantines, read the captured error. Run `scripts\find-good-backup.ps1` to confirm what your newest restorable copy actually is. |
| `syntax error at or near "Order"` when counting rows | The `"Order"` table name lost its quotes in PowerShell. Keep the SQL inside `-c '...'`. |

---

## 9. Security & retention notes

- The DB password is **never** in `scripts/backup-db.ps1`. The script reads `PGPASSWORD`, or parses it out of `DATABASE_URL` in `.env`, so the gitignored `.env` stays the single source of truth and rotating the password is a one-file change. **Do not "simplify" this by putting the password back in the script** — that script is committed to git, and an earlier version of this project leaked a DB password into a public repo exactly that way.
- Dumps contain **live customer and order data** — `.gitignore` excludes `/backups/`, and the Google Drive account holding them should be locked down (2FA).
- Retention is set in the script: `$RetentionDays = 30` (local), `$GDriveRetention = 90` (cloud). Adjust if you want longer history — storage is not a concern (a dump is well under 1 MB). Independently, `$KeepMinimum = 7` guarantees the 7 newest dumps survive any prune even if they're past the age cutoff.
- A backup on the same disk only protects against corruption or a bad migration. The Google Drive mirror is what protects against drive failure, theft, or fire — **keep it working**.

---

*Related: [`docs/terminal-setup.md`](terminal-setup.md) (Stripe), [`docs/square-terminal-setup.md`](square-terminal-setup.md) (Square); [`docs/go-live-checklist.md`](go-live-checklist.md) for the full opening checklist.*
