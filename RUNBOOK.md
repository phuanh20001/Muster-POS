# DreamyCafe — Operations Runbook

> **This is the "something is wrong, what do I do" page.** It is written so someone
> who did **not** build DreamyCafe can keep it running, recover it, and diagnose it.
> If you are that person: start at [§0 Orientation](#0-orientation-read-once), then
> jump to the symptom in [§4 Incident playbooks](#4-incident-playbooks).
>
> This runbook is the **index**; the deep guides in `docs/` hold the detail. It never
> duplicates them — it tells you which one to open and in what order.

---

## 0. Orientation (read once)

**What DreamyCafe is:** a self-hosted café point-of-sale. It runs entirely on **one
mini-PC in the shop**. The staff till, the manager screens, and the public online-ordering
site are all served by that one machine.

**The four moving parts** (if you understand these, you can debug almost anything):

| Part | What it is | How it runs | If it dies |
| --- | --- | --- | --- |
| **PostgreSQL** | The database — every order, customer, cash record | Windows service `postgresql-x64-18` | Nothing works. App can't start. Highest priority. |
| **The app** | The Next.js POS server on port **3000** | Windows service **`DreamyCafeApp`** (via NSSM) | No till, no online orders. |
| **The tunnel** | Cloudflare tunnel exposing the **public** site to the internet | Windows service **`DreamyCafeTunnel`** | Online ordering down. **In-shop till still works.** |
| **The kiosk** | The full-screen till window on the shop PC | `open-pos.bat` (Electron) | Just re-open it. Server keeps running without it. |

**Payments are NOT ours.** Card charges go through **Stripe or Square** terminals. If a
card won't process, the problem is almost always the reader or the provider — not this app.
The app only records an order **after** the provider confirms the charge.

**The golden rule of a POS emergency:** *cash sales must keep working.* The in-shop till
runs on `localhost` and does **not** need the internet, the tunnel, or the card reader for a
**cash** sale. If everything else is on fire, the shop can still take cash. Stay calm.

**Key locations** (adjust if this PC differs):

| Thing | Path |
| --- | --- |
| Project folder | `C:\path\to\DreamyCafe` |
| Logs | `…\DreamyCafe\logs\` (`app-stderr.log` is the one you'll read most) |
| Backups | `…\DreamyCafe\backups\` + `G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\` (one subfolder per machine — take dumps from **this** machine's folder) |
| Secrets | `…\DreamyCafe\.env` — **never committed, never in a backup. See [§6](#6-the-env-file-the-one-irreplaceable-thing).** |
| Scripts | `…\DreamyCafe\scripts\` |

---

## 1. Daily operation (the normal path)

**Opening:** the services auto-start with the PC. Just open the till:

1. Turn on the shop PC (services start themselves — no login step needed).
2. Double-click **`open-pos.bat`** → the full-screen till appears.
3. Staff clock in; manager opens the cash session with the opening float.

**Closing:** manager closes the cash session (count drawer, note variance). That's it —
leave the PC on. Backups run automatically at **9:30 PM**.

> Full opening/closing detail: [docs/go-live-checklist.md](docs/go-live-checklist.md) Phase 4.
> Staff-facing card for the till: [docs/staff-quick-reference.md](docs/staff-quick-reference.md).

**Do NOT run `start-pos.bat` when the services are installed** — it starts a *second*
server and tunnel and causes port conflicts. Use **`open-pos.bat`** (kiosk only).

---

## 2. Is the system healthy? (60-second check)

Run these in PowerShell on the shop PC. All three green = healthy.

```powershell
# 1. Are all three services running?
Get-Service postgresql-x64-18, DreamyCafeApp, DreamyCafeTunnel

# 2. Does the till server answer? (expect StatusCode 200)
Invoke-WebRequest -Uri "http://localhost:3000/pos" -UseBasicParsing | Select-Object StatusCode

# 3. Is the database reachable through the app? (expect {"ok":true,"db":true})
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing | Select-Object -Expand Content
```

From a phone **on mobile data** (not shop Wi-Fi), confirm the public site:
`https://dreamy-cafe.com/order` should load. If it doesn't but the three checks above pass,
the problem is the **tunnel** (see [§4C](#4c-online-ordering-is-down-but-the-till-works)).

There is also a one-shot script that checks everything at once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-resilience.ps1
```

---

## 3. Start / stop / restart (the commands you'll actually use)

Run PowerShell **as Administrator** for service commands.

```powershell
# Restart just the app (after a code update, or if it's misbehaving)
Restart-Service DreamyCafeApp

# Restart the tunnel (online site down, till fine)
Restart-Service DreamyCafeTunnel

# Stop everything for maintenance (stop tunnel first, then app)
Stop-Service DreamyCafeTunnel; Stop-Service DreamyCafeApp

# Start everything back up (app first — the tunnel depends on it)
Start-Service DreamyCafeApp; Start-Service DreamyCafeTunnel

# See recent errors
Get-Content .\logs\app-stderr.log -Tail 30
```

GUI alternative: `Win+R` → `services.msc` → **DreamyCafe POS Server** / **DreamyCafe Cloudflare Tunnel**.

---

## 4. Incident playbooks

> Find your symptom. Each playbook is ordered: **most likely cause first.** Do them in order.

### 4A. Nothing works — the till won't load at all

1. **Check the three services** ([§2](#2-is-the-system-healthy-60-second-check), check #1). Whatever is **not Running**, that's your problem.
2. **If PostgreSQL is stopped:** start it first — nothing else can work without it.
   `Start-Service postgresql-x64-18`, then `Start-Service DreamyCafeApp`.
3. **If DreamyCafeApp keeps stopping:** read `logs\app-stderr.log` (last 30 lines). The
   usual causes: PostgreSQL not up yet, a missing/broken `.env`, or a bad migration. See
   the troubleshooting table in [docs/windows-services.md](docs/windows-services.md#troubleshooting).
4. **If a service is stuck / won't start:** reboot the PC. The services are set to auto-start
   and wait for PostgreSQL, so a clean reboot fixes most transient states.
5. **Meanwhile:** the shop can still take **cash** if the till *screen* is up on `localhost`.
   If the screen is up but cards/online fail, this is the wrong playbook — see [§4C](#4c-online-ordering-is-down-but-the-till-works).

### 4B. A card payment won't go through

1. **This is almost never the app.** The app only records an order *after* the provider
   confirms the charge, so a failed card = a reader/provider problem.
2. Check the **card reader** (Stripe S700 / WisePOS E, or Square Terminal): powered, on
   Wi-Fi, paired. Reboot the reader.
3. Check the provider's status page (Stripe / Square) for an outage.
4. **Fall back to cash** for now — the shop keeps trading. Fix the reader before the next card sale.
5. Reader setup detail: [docs/terminal-setup.md](docs/terminal-setup.md) (Stripe),
   [docs/square-terminal-setup.md](docs/square-terminal-setup.md) (Square).

### 4C. Online ordering is down, but the till works

This means the **app is fine** and the **tunnel** is the problem (the public site reaches the
app only through the tunnel).

1. `Restart-Service DreamyCafeTunnel`.
2. If it won't start or errors on `cert.pem`: run **`fix-tunnel-service.bat`** as admin.
   (The tunnel runs as SYSTEM and sometimes needs its cert permissions reset.)
3. Read `logs\tunnel-stderr.log` (last 20 lines) for the reason.
4. Confirm from mobile data that `https://dreamy-cafe.com/order` loads.
5. Detail + troubleshooting rows: [docs/windows-services.md](docs/windows-services.md#troubleshooting).

> The marketing site (`https://www.dreamy-cafe.com/`) is on Cloudflare Pages and loads
> **even when the tunnel is down** — so "the website is up but ordering is broken" is a
> normal, expected shape of this failure.

### 4D. A printer isn't printing

1. The **order still saved** — printing is best-effort, never blocks a sale. Reassure staff.
2. Reprint the docket/receipt from the order detail screen once the printer is back.
3. Check the printer: powered, on the LAN, correct static IP (matches `.env`
   `PRINTER_FRONT_IP` / `PRINTER_KITCHEN_IP`).
4. Test from **Admin → Printers**.

### 4E. The PC rebooted (Windows Update, power blip)

1. **Do nothing for 2 minutes.** The services auto-start and the app waits for PostgreSQL.
2. Run the [§2 health check](#2-is-the-system-healthy-60-second-check). If all green, re-open
   the till with `open-pos.bat`. Done.
3. If the app didn't come back, go to [§4A](#4a-nothing-works--the-till-wont-load-at-all).
4. **Prevent it happening mid-service:** set Windows Update **active hours** to your trading
   hours (see the go-live hardware table in [docs/database-backup.md](docs/database-backup.md#hardware--os-items-for-go-live-not-code)).

### 4F. The database is corrupt / data looks wrong / you need to restore

**Stop and think — a restore overwrites live data.** Only do this if the database is genuinely
broken. If you're unsure, take a manual backup first (below) so you can't lose the current state.

1. **Take a safety dump of the current state right now** (even if it looks broken):
   `powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1`
2. **Find the newest *restorable* backup** (this verifies each candidate, local + Google Drive,
   and prints the exact restore command — it does **not** restore anything itself):
   `powershell -ExecutionPolicy Bypass -File scripts\find-good-backup.ps1`
3. **Restore** using the command it prints. Full step-by-step (including restoring product
   images from the `uploads_*.zip`): [docs/database-backup.md §5](docs/database-backup.md#5-restoring-from-a-backup).
4. If the app won't start *because* of a bad migration, that's a code/deploy issue — see [§5](#5-deploying-a-code-update).

> Restore is deliberately a **human** step — no automation restores on its own, because a
> false "corrupt" signal auto-wiping good data would be worse than the problem. You are the
> safety check.

### 4G. You got a "backup failed", "maintenance failed", or "restore drill failed" email

These come from **healthchecks.io** (the off-site dead-man's switch). The email body contains
the actual error log.

1. Read the email — it says *why* (corrupt dump, Drive not running, **disk low on space**, etc.).
2. **If it's low disk space:** this is urgent — a full disk stops sales *and* backups. Clear
   space on the backup drive now (old files, downloads). The alarm fires at 5 GB free to give
   you room to act before it's critical.
3. **If it's the quarterly restore drill:** nothing is broken *right now* — the shop is trading
   normally. What it means is that your backups are **not proven recoverable**, so fix it before
   you actually need one. Full output is in `logs\restore-drill.log`; common causes are a corrupt
   newest dump (check `backups\quarantine\`) and a PostgreSQL version mismatch.
4. For any other cause, see the troubleshooting table in
   [docs/database-backup.md §8](docs/database-backup.md#8-troubleshooting).
5. If **no** success email arrives on a normal day either, the backup task may not be running
   at all — check `Get-ScheduledTaskInfo -TaskName "DreamyCafe DB Backup"` (`LastTaskResult 0` = success).

---

## 5. Deploying a code update

Services do **not** auto-rebuild. After new code lands:

```powershell
cd C:\path\to\DreamyCafe
powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1   # safety net before any migration
npm run build                                                    # also applies DB migrations on next start
Restart-Service DreamyCafeApp                                    # tunnel can keep running
```

Then hard-refresh / re-open the PWA on each till tablet. Full deploy notes:
[docs/windows-services.md](docs/windows-services.md#deploying-a-code-update) and
[docs/go-live-checklist.md](docs/go-live-checklist.md) "Every deploy".

---

## 6. The `.env` file (the one irreplaceable thing)

**`.env` is NOT in any backup and NOT in git.** It holds every secret: the database password,
`JWT_SECRET`, Stripe/Square keys, and `PUBLIC_ZONE_SECRET`. A database backup restores your
*data*; it does **not** restore `.env`.

**If you ever rebuild on a new PC, you need three things:** the code (from git), the newest
verified `.dump` **+** its `uploads_*.zip` (from `backups\` or Google Drive), **and a separately
kept copy of `.env`.** Without `.env` the app will not start and cannot process payments.

> **Keep a copy of `.env` somewhere safe and off this machine** (a password manager, a sealed
> note). This is the single most important thing not automated — because it *can't* safely be.
> Losing it means re-issuing every secret and re-pairing every payment integration.

---

## 7. Routine upkeep (mostly automatic)

| When | What | Automatic? |
| --- | --- | --- |
| Nightly 9:30 PM | Database backup + off-site mirror + integrity check | ✅ Task Scheduler |
| Monthly (Sun 3 AM) | `VACUUM ANALYZE`, prune old print logs, trim `desktop.log`, **check drive health (SMART)** | ✅ Task Scheduler ([db-maintenance](docs/database-backup.md#32-monthly-maintenance-keeps-the-pos-fast-over-years)) |
| Quarterly | Restore drill (proves a backup actually restores) | ✅ Task Scheduler — alerts via healthcheck, logs to `logs\restore-drill.log` |
| Weekly (manual) | Glance that Google Drive has recent `.dump` files; review cash variance | ⬜ You |
| Ongoing | Keep the off-site copy of `.env` current if secrets change | ⬜ You |

Everything auto-alerts through healthchecks.io if it **fails**, so "no news is good news" is safe —
**as long as you still get the occasional success email** (proof the alerting itself works).

> ⚠️ **One gap to know about: a job that stops running is only caught if it has its own check.**
> Failure alerting works no matter what. But the *dead-man's* half — noticing silence — depends on
> the check having a period matched to that job. If maintenance and the restore drill share the
> nightly backup's check, the backup's daily ping keeps it green forever, so a monthly or quarterly
> task that quietly stopped (disabled, renamed, lost in a PC migration) would never be noticed.
> Give each its own check: `MAINTENANCE_HEALTHCHECK_URL` (~35-day period) and
> `RESTORE_DRILL_HEALTHCHECK_URL` (~90-day). Both fall back to `BACKUP_HEALTHCHECK_URL`, so
> alerting still works before you do — you just don't have the silence detector yet.

---

## 7A. Annual / calendar upkeep (the "walk away" list)

> Everything in §7 is automated and self-alerting. **This list is the opposite:** things that
> expire on a *calendar*, throw **no error until the day they fail**, and no dead-man's switch
> watches. If you plan to stop touching this app, put these on a real calendar with reminders a
> **month** ahead — a lapse here takes the shop offline (or stops card payments) with no warning.

| When | What | Why it bites silently |
| --- | --- | --- |
| **Quarterly** | **Dependency security patches** — `npm audit` + patch/minor bumps (procedure below) | Nothing warns you about a published CVE. This matters here specifically because `src/proxy.js` is Next.js **middleware** enforcing the public/staff zone split, and the tunnel puts it on the internet — a Next security release can be patching your zone boundary. |
| **Annually** | **Domain `dreamy-cafe.com` renewal** — keep registrar auto-renew ON and the card on file valid | If registration lapses, the public site **and** the tunnel go dark. In-shop cash till still works. |
| **Annually** | **Card on file** at the registrar, Cloudflare, and the payment providers | An expired credit card is the #1 cause of a service quietly lapsing. Check when your cards expire. |
| **Annually** | **Payment credentials** — Stripe keys / **Square access token**. Neither expires on a timer (see "Credentials and logins" below); this is a *revocation and rotation* check, not an expiry one | A dead key kills card payments with a generic error, not an obvious "expired" message. |
| **Annually** | **Off-machine `.env` copy still current** (see §6) + a copy of `C:\path\to\.cloudflared\` (tunnel `cert.pem` + credentials `.json`) | Neither is in any backup or in git. Lose them and you re-issue every secret and re-create the tunnel. |
| **Annually** | **Account recovery, not just secrets** — 2FA recovery codes for the registrar, Cloudflare, Stripe, Square, Google (Drive backups) and healthchecks.io, stored with the `.env` copy; and one trusted second person who knows where that is | `.env` restores the *app*; it does nothing for a lost phone or a lost person. Locked out of the registrar or Cloudflare and the public site is unrecoverable by you. |
| **Annually** | **Caddy root CA** — keep `caddy-root-ca.crt` with the `.env` copy (the nightly backup now copies it too) | It's the LAN-TLS root every till tablet trusts, and it lives only on this machine. If Caddy's data dir is ever lost it mints a **new** root and every tablet shows a certificate error until re-trusted — see [docs/lan-tls.md](docs/lan-tls.md#if-caddys-data-dir-is-lost). |
| **Every ~1–2 yrs** | **Payment API versions** — Stripe and Square each *retire* old API versions on a rolling schedule | The versions are pinned in code (`src/lib/terminal.js`, `src/lib/square.js`) so this is now a **scheduled** event, not a surprise. When a provider announces a version sunset that covers ours, plan an SDK bump + re-test **before** the cutoff date. |
| **Yearly glance** | **Node.js / Windows support status** — both hit end-of-life (~every few years) | A frozen app on EOL Node/Windows keeps running but stops getting **security** patches, which matters because the tunnel exposes it to the internet. |
| **Yearly glance** | **Logins that can lapse** — the Google Drive sign-in, the Tailscale key, the Windows password (full list below) | Only three things on the mini-PC can stop working on a timer, and two are one-time toggles. The third (Google Drive) silently ends **off-site** backups while local ones keep succeeding. |

**Pinned payment API versions (for the sunset check above):**
Stripe `2026-05-27.dahlia` · Square `2026-05-20`. If a provider retires one of these, bump the
SDK and the pinned string together, then run the dev verification scripts (§ Stripe: `scripts/test-amex-block.js`;
Square: `scripts/test-square-app-stack.js`) before the cutoff.

### Credentials and logins that expire

Most of what runs on the mini-PC never needs re-authenticating. Only **three** things can stop
working on a clock — and two of them are one-time toggles you set once and forget.

**Do these once, during setup:**

| One-time | Why | How |
| --- | --- | --- |
| **Tailscale — disable key expiry** on the mini-PC | Device keys expire every **~180 days** by default. A headless box silently drops off the network about six months in, and you find out when you urgently need remote access | Tailscale admin console → the machine → *Disable key expiry* (also in [migrate-to-new-pc.md §1a](docs/migrate-to-new-pc.md)) |
| **Windows password — never expires** | Depending on how the account was created it can inherit a **42-day** maximum age. When it lapses, RDP stops and you must be physically at the shop | Check with `net accounts` — *"Maximum password age"* should read **Unlimited** |

**The one that stays live: the Google Drive sign-in.**

Drive for Desktop holds an OAuth token that persists indefinitely in normal use, but it is killed
by any of: **changing your Google account password**, revoking access in Google Account settings,
~6 months of total inactivity, or a Workspace admin policy forcing re-auth. It can also demand a
re-sign-in after a major Drive update.

The trap is structural, not just the timer. Drive runs in a **user session**, on a box that is
headless and reboots itself around 4 AM — so the "sign in again" prompt appears on a desktop nobody
looks at, and `G:\My Drive` simply stops being mounted. **Changing your Google password stops the
off-site backups**, and nothing about doing that feels connected to the POS.

> **You will be told.** `backup-db.ps1` checks that `GoogleDriveFS` is actually running and
> soft-fails the healthcheck when the mirror doesn't happen, so this arrives as an email rather
> than a discovery a year later. **Local backups keep succeeding throughout** — only the off-site
> copy stops. If you ever change your Google password, just log back into Drive on the mini-PC and
> confirm the next backup mirrors.

**What does *not* expire** — so nobody re-audits this every year:

| Credential | Status |
| --- | --- |
| `SQUARE_ACCESS_TOKEN` | **No timer.** It's a Developer Dashboard token for your *own* account ([square-terminal-setup.md](docs/square-terminal-setup.md)). The 30-day expiry people warn about applies to OAuth tokens issued on behalf of *another* merchant — not this setup. Dies only if rotated or revoked |
| Stripe keys | Permanent until you rotate them |
| Cloudflare Tunnel credentials | The tunnel secret in the credentials `.json` doesn't expire; a **running** named tunnel never needs re-login. `cloudflared login` is only for *creating or modifying* tunnels |
| `JWT_SECRET` | No expiry (changing it logs every staff member out) |
| healthchecks.io / UptimeRobot | Checks persist; free accounts only go dormant after long disuse, and they email first |
| Caddy LAN certs · Cloudflare edge certs | **Renew themselves**, no action ever. Caddy's internal CA is offline, so it doesn't even need internet |

Staff logins (`POS_TTL` / `MANAGER_TTL` / `ADMIN_TTL` in [src/lib/auth.js](src/lib/auth.js)) are a
different thing entirely — those are *meant* to expire, and re-entering a PIN is the intended
behaviour, not a fault.

### Quarterly dependency patch — the procedure

`package-lock.json` is committed, so builds stay reproducible and versions don't drift on their
own. The risk isn't drift — it's sitting on a version with a **known hole**. Fifteen minutes, four
times a year:

```powershell
npm audit                 # anything with a published advisory?
npm outdated              # what's available
npm install <pkg>@latest  # patch/minor WITHIN the current major only
npm test                  # must pass before it goes near the till
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
```

Then confirm on the shop PC: `/pos` loads, a test print works, one card sale on the reader.

> **Majors are projects, not chores.** Next `16→17`, Prisma `5→6`, React `18→19` are scheduled work
> with testing time set aside — never a quiet Tuesday bump, and never the week before Christmas
> trade. Patch/minor within the current major is the routine job; a major is a decision.

**Printing is the canary for a Node upgrade.** `escpos` / `escpos-network` are pinned at unmaintained
`3.0.0-alpha` releases with no upstream to ship a fix. They work — but after **any** Node major
upgrade, test a real docket print *before* a trading day, because that's the dependency most likely
to break and the one nobody else will fix for you.

---

## 8. Where everything is documented

| Topic | Guide |
| --- | --- |
| First-time deploy (tunnel, printers, webhooks, zone lockdown) | [DEPLOY.md](DEPLOY.md) |
| Go-live checklist (opening day, end-to-end rehearsal) | [docs/go-live-checklist.md](docs/go-live-checklist.md) |
| Backups, restore, maintenance, disk alarm | [docs/database-backup.md](docs/database-backup.md) |
| Windows services (auto-start, restart, troubleshooting) | [docs/windows-services.md](docs/windows-services.md) |
| Stripe reader setup | [docs/terminal-setup.md](docs/terminal-setup.md) |
| Square terminal setup | [docs/square-terminal-setup.md](docs/square-terminal-setup.md) |
| External uptime alerts | [docs/uptime-monitoring.md](docs/uptime-monitoring.md) |
| Staff till reference (print this) | [docs/staff-quick-reference.md](docs/staff-quick-reference.md) |
| Project rules / architecture (for a developer) | [AGENTS.md](AGENTS.md) |
