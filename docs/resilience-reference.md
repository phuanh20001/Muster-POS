# Resilience Reference

**What looks after itself, and what needs you.**

The till runs on one mini PC in the back (`DREAMY-CAFE`, HP ProDesk 600 G4 Mini, on 24/7). It backs itself
up, patches itself, and restarts itself after a power cut. This page is for the moments it emails you
instead — what the message means, and what to do about it.

Written to be handed to someone else. If you want the full engineering detail instead, read
[SETUP-HANDOFF.md](../SETUP-HANDOFF.md) and [Database & Backup](database-backup.md); those two win if
they disagree with this page.

---

## You got an email. What now?

Alerts come from healthchecks.io. Find the name in the subject line — **the first word matters more
than it looks.**

| Email says | What actually happened | What to do |
|---|---|---|
| 🔴 **`Dreamy Cafe Restore Drill` is down** | The quarterly test could not rebuild the shop from a backup. This is the serious one — it means the backups may not be usable. | Stop and investigate before trusting any backup. Do not wait for it to clear on its own. |
| 🔴 **`Dreamy Cafe DB Backup` is down** | Either last night's backup failed outright, **or** it saved locally but something else went wrong: Google Drive did not receive it, the disk is nearly full, or the newest good backup is over 48 hours old. | Open `logs\` for the reason. Check `backups\quarantine\` — a file there means a corrupt backup was set aside deliberately, for you to inspect. A full disk stops **sales** as well as backups, so clear space first if that's the cause. |
| 🟠 **`Dreamy Cafe — Windows feature update` is down** | **Nothing is broken.** This one works backwards from the others: it goes red on purpose, twice a year, to tell you it's time to move Windows to a newer version. | Do the version bump, **then** clear the check. Clearing it without bumping is the one action that quietly turns this into a decoration. |
| 🔵 **`Dreamy Cafe DB Maintenance` is down** | The monthly housekeeping pass didn't run — tidying old print records, keeping the database quick, checking the drive's health. | Low urgency. Nothing about today's trading depends on it. Run it by hand when convenient. |
| 🟢 **Name starts `DreamyCafe`, not `Dreamy Cafe`** | That is the **old shop PC**, not this one. Its checks kept the old name. Expect all three to go red the day the old machine is switched off for good. | Confirm the check belongs to the old machine, then delete it. Nothing on this box is affected. |

> **No email is also information.** Every job reports in on a schedule, so a job that stops running
> entirely — task deleted, machine left off for a month — turns its check red on silence alone.
> That's the half most monitoring misses.

---

## What runs, and when

All of it happens outside trading hours. Nothing here needs anyone present.

| Job | Runs | When | Goes red after |
|---|---|---|---|
| Database backup | Every night | `21:30` | 1 hour late |
| Windows security patches | Nightly, installs and restarts | `04:00` | — |
| Screen lock after restart | Every restart, within a minute | on boot | — |
| Database maintenance | Every 4 weeks | `03:00` | 4 days late |
| Restore drill | Every 13 weeks | `09:00` | 1 week late |
| Windows version reminder | Every 26 weeks | `08:00` | 2 weeks late |

> **Expect a red "Windows feature update" email on 2 August 2026.** That is the first *real* reminder,
> not a leftover from testing — a twice-yearly job starts at its next matching Sunday and only then
> settles into its six-month rhythm. The restore drill fires 3 August for the same reason, but it
> reports success quietly and sends nothing.

---

## The five things keeping the till alive

Each one is paired with something that tells you when it stops working. **That pairing is the point** —
a backup that fails silently is worse than none, because you plan around it.

### The till service — stays running

The POS runs as a Windows service, so it starts without anyone signing in and restarts itself if it
crashes.

- Waits for the database before starting, so it never comes up half-connected after a restart
- Crash restarts are throttled, so a repeating fault can't hammer the machine
- Writes to `logs\app-stdout.log` and `logs\app-stderr.log`

### Power cuts — comes back alone

There's no battery backup, deliberately, since the shop closes in a blackout anyway. Instead the
machine is set to power itself on when the electricity returns.

- Never sleeps while plugged in
- Signs itself in so the backup drive mounts, then locks the screen within a minute
- **Tested for real:** the cord was pulled, and the till was serving again about 30 seconds after boot

### Backups — two copies, verified

A backup that can't be opened isn't a backup, so **every one is read back before it's trusted.**

- Kept on the machine for 30 days, and in Google Drive for 90
- Always keeps the 7 newest however old, so a bad run can never leave you with nothing
- A corrupt backup is moved to `backups\quarantine\`, **not deleted**, so the cause can be found
- Also saves product photos and the tablet security certificate, which the database copy doesn't include

### The restore drill — proof, not hope

Four times a year the newest backup is rebuilt into a scratch copy of the shop, checked, and thrown
away. This is the job that catches a whole year of backups that were never usable.

- Never touches the live shop database
- Writes every run to `logs\restore-drill.log`

### Windows updates — patched, not surprised

Security fixes install on their own. Big yearly version jumps are blocked, so Windows can't reinvent
itself mid-service.

- Installs and restarts at `04:00`, held four days so any bad patch is withdrawn first
- No restarts between `05:00` and `19:00`
- Because versions are frozen, the twice-yearly reminder is what stops the machine drifting out of
  security support

### Monthly housekeeping — stays quick for years

Five cheap jobs sized for a machine that never gets switched off: clears print-failure records older
than 90 days · keeps the database's indexes and statistics fresh · caps the one log file nothing else
trims · clears out Windows' temp folders, which nothing in Windows does · reads the drive's health and
**temperature**, so a failing or overheating disk shows up months early instead of on the day.

---

## The one job that isn't automatic: keep it clean

**Every six months, blow the dust out of the vents and fan.** That's the whole task, and it is the most
useful physical thing anyone can do for this machine.

The reason is worth knowing, because it's the opposite of what you'd expect. **The drive will not wear
out** — it was measured, and at the rate this shop writes data it would take centuries. What actually
kills a machine this size is **heat**, and what causes heat is dust. This is a very small box with one
small fan, sitting in a café: grease, flour and dust get pulled straight through it. A clogged intake
raises the temperature of everything inside, and heat is what finishes off drives, fans and power
components.

So the practical rules are:

- **Six-monthly:** compressed air through the vents and fan grille. Power off first.
- **Give it air.** Not sealed in a cupboard, not stacked under anything, not tucked behind the espresso
  machine, and **not on the floor** — floor level is where it inhales the most dust.
- **Listen to it.** A fan that has become audible or is cycling up and down is usually dust, not age.

The monthly health check now records the drive's temperature every time it runs, so you don't have to
guess. Anything from the high 20s to the 40s is normal. It warns you at 60 °C and raises a real alarm
at 70 °C — but the useful signal is the **direction over months**, which is why every reading is kept
in `logs\db-maintenance.log`.

---

## One setting holds up four others

### Changing the Windows password breaks the backups

The machine signs itself in automatically after every restart. That isn't convenience — **Google Drive
only runs inside a signed-in session, and so do all four scheduled jobs.** Without that automatic
sign-in, the off-site backup copy stops and every scheduled job stops with it.

**So if you ever change the Windows password on the `User` account, you must set automatic sign-in up
again afterwards.** Nothing will appear wrong at the time. You'd find out that night, when the backup
check goes red.

Two things soften it: the password is held in Windows' protected store rather than sitting readable in
the registry, and the failure *does* raise an alarm within about an hour rather than passing unnoticed.

---

## Six things that quietly break something

Each of these looks harmless or even tidy. Each one disables a protection **without any visible sign.**

1. **Don't turn hibernation or Fast Startup back on.** "Shut down" would then only half-shut-down, and
   the machine would stop locking its screen after an unattended restart — leaving the back-office
   desktop open.
2. **Don't change the `User` Windows password without re-doing automatic sign-in.** Stops the off-site
   backup and all four scheduled jobs at once. See above.
3. **Don't clear the Windows version reminder without actually updating Windows.** The reminder is the
   only thing standing between "deliberately frozen" and "quietly unsupported".
4. **Don't delete the old shop PC's checks while that machine is still running.** Its backups would
   carry on reporting to nothing, leaving a live machine unmonitored and nothing announcing it.
5. **Don't start the till by double-clicking `start-pos.bat` while the service is running.** Both try
   to claim the same port and the second one fails confusingly.
6. **Don't restore an old backup over the live shop database.** This machine was set up fresh on
   purpose. Restoring the old shop's data over it would drag back its orders, staff and settings.
7. **Don't follow "make Windows last longer on an SSD" guides.** Everything they recommend was
   measured on this box and rejected — turning off the page file, System Restore, disk optimisation
   and search indexing would together save about **0.7%** of what the machine writes, while removing
   crash diagnostics, update rollback, and the TRIM pass the drive actually wants. See the appendix.

---

## Where things are

### If you change any code

| | |
|---|---|
| **Build, then restart** | Run `npm run build`, then restart the `DreamyCafeApp` service. Editing files alone changes nothing on the running till. |
| **Check everything at once** | `scripts\verify-resilience.ps1` — confirms the till came up on its own, the database is reachable, and the scheduled jobs are all present. |

### Names and places

| | |
|---|---|
| **Services** | `DreamyCafeApp` (the till) and `postgresql-x64-18` (the database). Both start automatically. |
| **Backups** | `backups\` on the machine, and `My Drive\DreamyCafe-Backups\DREAMY-CAFE\` in Google Drive. The folder is per-machine on purpose, so two shops can never mix up whose data is whose. |
| **Logs** | `logs\` — one file per job. |

---

## Tested, and not yet tested

Worth keeping straight, because the untested parts are where surprises live.

**Proven on this machine**

- ✅ Power cut, unplugged at the wall — back up and serving on its own
- ✅ Backup runs nightly and completes
- ✅ Restore drill rebuilt the shop from a backup twice
- ✅ Screen locks after an unattended restart, and correctly leaves a real person's session alone
- ✅ A reminder email actually arrived — not just logged
- ✅ Card reader took a real payment
- ✅ **The whole LAN TLS stack survives a reboot unattended** (30 Jul 2026). From power-on:
  Postgres at +13 s, the app at +15 s, Caddy at +25 s — the `DependOnService` ordering held
  without anyone logging in. Static IP still `192.168.0.10/24 Manual`; both
  `https://dreamy-cafe.local` and `https://192.168.0.10` returned **200 with the chain
  verified**; all three firewall rules intact, including the 3000 block. Caddy logged
  `root certificate is already trusted by system`, confirming the imported root persists
  across restarts rather than needing a re-run.
- ✅ **Autologon is real, not assumed** — `explorer.exe` started as `User` **14 seconds after
  boot**, before any remote login was possible, and `G:\My Drive` was visible in that
  session. This is the keystone: without it the four `LogonType Interactive` tasks cannot
  see Google Drive and the backups quietly stop. The lock guard fired the same boot
  (`console session locked after autologon (booted 0.4 min ago)`) and its log shows it
  correctly **skipping** human logons minutes later — the uptime guard discriminating as
  designed, which a `SESSIONNAME` check would not.

**Still untested**

- ⬜ A restore drill against a database with **real sales in it** — so far it has only rebuilt an empty shop
- ⬜ The first genuine Windows version bump, due 2 August 2026
- ⬜ Both receipt printers answering at the shop — the addresses came from the old machine's records, and nothing responds from home
- ⬜ A full day of trading

---

## Appendix — plain English to what it actually is

For whoever has to go and change one of these.

| On this page | Actually | Where |
|---|---|---|
| "runs as a Windows service" | NSSM wrapping `npm run start`, `DependOnService = postgresql-x64-18`, restart on exit with a 10 s throttle | [install-windows-services.ps1](../scripts/install-windows-services.ps1) |
| "backs itself up" | `pg_dump -Fc`, verified with `pg_restore -l`, 30-day local / 90-day Drive retention with a keep-newest-7 floor | [backup-db.ps1](../scripts/backup-db.ps1) |
| "rebuilt into a scratch copy" | restore into a throwaway `restore_test` database, row-count, drop | [restore-drill.ps1](../scripts/restore-drill.ps1) |
| "monthly housekeeping" | `PrintJob` prune, `VACUUM ANALYZE`, `desktop.log` trim at 5 MB, SMART read | [db-maintenance.ps1](../scripts/db-maintenance.ps1) |
| "signs itself in … then locks" | autologon via Sysinternals Autologon (password as an LSA secret, **not** a registry `DefaultPassword`), plus an **uptime-based** lock guard — deliberately not `SESSIONNAME`-based, which is backwards under autologon | [lock-on-logon.ps1](../scripts/lock-on-logon.ps1) |
| "big version jumps are blocked" | `TargetReleaseVersionInfo = 25H2`, `AUOptions = 4`, `ScheduledInstallTime = 4`, `AlwaysAutoRebootAtScheduledTime = 1` (+15 min), active hours `05:00–19:00`, quality updates deferred 4 days | [configure-windows-updates.ps1](../scripts/configure-windows-updates.ps1) |
| "goes red on purpose" | pings `<url>/fail` rather than the plain URL, and has **no** fallback to `BACKUP_HEALTHCHECK_URL` — sharing would announce a backup failure that never happened | [feature-update-reminder.ps1](../scripts/feature-update-reminder.ps1) |
| "all four scheduled jobs" | Task Scheduler, `LogonType Interactive` (**not** S4U — a session-0 task cannot see `G:\My Drive` at all) | `scripts\register-*-task.ps1` |

⚠ Ping URLs live in `.env` and are deliberately not written down here — anyone holding one can mark
your checks failed. Same rule as every other secret in this project: never in git, never in chat.

---

## Appendix — why the SSD tweaks were rejected

Measured on this machine, 30 July 2026, before changing anything.

| Measurement | Value |
|---|---|
| Drive | Toshiba KXG6AZNV256G, 256 GB NVMe |
| Wear | **0%**, HealthStatus `Healthy`, 27 °C |
| **Production** write rate (`node` + `postgres` + Drive + NSSM) | **3.11 MB/h** = 0.073 GB/day = **0.026 TB/year** |
| Endurance headroom at a conservative 100 TBW | **~3,800 years** |

Method: `Win32_Process.WriteTransferCount ÷ process age`, via CIM rather than `Get-Process` — CIM needs
no process handle, so it reads SYSTEM-owned processes without elevation (the same reason
[verify-resilience.ps1](../scripts/verify-resilience.ps1) uses it).

⚠ **The first measurement was misleading, and the trap is easy to repeat.** Whole-machine writes came
to **1,319 MB/h ≈ 11 TB/year**, which reads as a crisis until you look at the ranking: `Code.exe`
837 MB/h, `chrome.exe` 51, `claude.exe` 13. The top writers were the *workstation session*, none of
which will exist on a headless POS. The POS's own Next.js and PostgreSQL processes were not in the
top 18 at all.

**What the usual advice would actually have saved**

| Commonly recommended | Measured | Verdict |
|---|---|---|
| Disable Windows Search | 1.97 MB/h | noise |
| Disable SysMain / Superfetch | 2.65 MB/h | noise |
| Disable telemetry (`DiagTrack`) | 1.60 MB/h | noise (disable for privacy if you like, not for the drive) |
| Disable push notifications | 2.59 MB/h | noise |
| **Combined** | **~9 MB/h of ~1,300** | **≈0.7%** |

**Rejected for a specific reason, not out of caution**

| Tweak | Why not |
|---|---|
| Remove the page file | Peak use was `0.04 GB` of `2.88 GB` — it is already writing nothing, and removing it breaks crash dumps |
| Disable System Restore | Capped at 4.73 GB, and it is cheap rollback insurance for the **unattended** 04:00 patch reboot — *more* valuable here, not less |
| Disable `ScheduledDefrag` | On an SSD this issues **TRIM/retrim**, which the drive wants. The guides saying otherwise are wrong for SSDs; `DisableDeleteNotify = 0` confirms TRIM already reaches it |
| `DisableLastAccess` | Windows already throttles it to once per hour per file |
| PostgreSQL `synchronous_commit = off` | 🔴 **Never.** Benchmarks far faster; loses the last committed transactions on power loss. No UPS by design, and card payments are taken |
| PostgreSQL `full_page_writes = off` | 🔴 **Never.** Risks a torn page — i.e. a corrupt table — on power loss |

**What was worth changing**

| Change | Why |
|---|---|
| `DODownloadMode = 0` + 40% background cap | Delivery Optimization was the largest writer at **133 MB/h** and, by default, **uploaded update content to strangers** over the shop's uplink — the link that also carries card authorisations. Bandwidth was the reason, not wear |
| SSD temperature in the monthly check | Heat, not writes, is this chassis's real failure mode — and it was the one SMART field not being recorded |
| Prune `%WinDir%\Temp` and user Temp | 1.8 GB of creep by day two; nothing in Windows clears it, and creep is what eventually trips the 5 GB free-space alarm that stops sales |
| `random_page_cost` 4 → 1.1 | `4` encodes a disk head seeking. There is no head. Matters as the orders table grows |
