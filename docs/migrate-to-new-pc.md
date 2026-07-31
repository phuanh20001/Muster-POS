# Migrating DreamyCafe to a New Mini PC

How to move a **live** shop from the current PC to a fresh mini PC that runs 24/7.
This is different from a first install: you are carrying over **real data** (orders,
customers, cash history, settings) and an **existing domain/tunnel**, and you must
cut over cleanly so customers and staff never hit two machines at once.

If you are setting up the very first time (no live data yet), use [DEPLOY.md](../DEPLOY.md)
and [go-live-checklist.md](go-live-checklist.md) instead — this doc assumes those were
already done once and now you're relocating.

---

## The three things you must carry over

A DB restore alone will **not** boot the shop. You need all three (from
[database-backup.md](database-backup.md) §1a):

1. **Data** — the latest `dreamycafe_<stamp>.dump` **and** the matching `uploads_<stamp>.zip` (product images).
2. **Secrets** — the **`.env`** file. It is in *no* backup and *no* git by design. Copy it off the old PC yourself.
3. **Code** — from `git clone` + `npm install` + `npm run build`.

> ⚠️ If you don't have the old `.env`, you can rebuild most of it, but you will **lose
> `PUBLIC_ZONE_SECRET`** (must then be re-matched with the Cloudflare Transform Rule) and
> `JWT_SECRET` (rotating it logs everyone out — acceptable, just re-PIN). Payment keys come
> from the Stripe/Square dashboards. Grab the real `.env` if you possibly can.

---

## Using an AI agent to help set up the mini PC

You can run an AI coding agent (Claude Code, etc.) **on the mini PC** to do most of this
migration for you — it's good at the repetitive command-running and at reading these docs.
A few things make it work well, and a few it must **not** touch.

**Give it the context first.** Point it at this repo — [AGENTS.md](../AGENTS.md) is the
canonical rulebook (JS-only, money via `src/lib/money.js`, no new deps), and this doc plus
[DEPLOY.md](../DEPLOY.md), [database-backup.md](database-backup.md), and
[windows-services.md](windows-services.md) are the migration procedure. Tell it to **follow
these docs step by step** rather than improvise — the ordering (prep → cutover → survive
reboots) is deliberate and skipping ahead is how you double-run the tunnel.

**Let it do:** install prerequisites (step 2), `git clone` + `npm install` + `npm run build`
(step 3), create the empty DB + `prisma migrate deploy` (step 5), the smoke test (step 6),
`pg_restore` + unzip uploads (step 7), register the NSSM services and scheduled tasks (step 10),
and run the verification checks. These are exactly the mechanical steps an agent handles well.

**Do NOT let it do (you do these by hand):**
- **The `.env`.** It's not in git and not in any backup — the agent has no way to fetch it and
  must never generate a fake one. You copy the real file across (step 4). Don't paste secret
  values into the agent chat either; put the file on disk and let the app read it.
- **The tunnel cutover (step 8) while the old PC is still live.** Only one machine may run the
  tunnel for the domain. Have the agent stage everything, but *you* confirm the old PC's
  `cloudflared` is stopped before it starts the new one — an agent can't see the other machine.
- **Payment / zone / money code.** There's nothing to edit here for a migration; if the agent
  proposes changing `src/lib/money.js`, `src/lib/zone.js`, `PUBLIC_ZONE_SECRET`, or anything
  under `src/app/api/{orders,terminal,webhooks}`, stop it — that's out of scope for moving a box.

**Remote-agent setup:** on a headless box, RDP in over Tailscale (§1a) and run the agent in that
session. Keep it read-the-docs-and-run, not free-refactor.

### Carry over the agent's memory (optional but recommended)

The section above runs an agent **on the mini PC**; this step gives that agent the *same memory*
this project built up on the laptop — the shop facts, your feedback, and past decisions — so it
doesn't start cold. It is **not** needed to boot the shop (the app never reads it), so treat it as
a convenience, not a cutover step.

Claude Code stores this **outside the repo**, under the user profile at `C:\Users\<user>\.claude\`:

```
C:\Users\<user>\.claude\
├─ projects\<encoded-project-path>\
│  ├─ memory\        # durable shop facts, feedback, decisions — the important part
│  └─ *.jsonl        # past conversation transcripts — copy only if you want chat history
├─ CLAUDE.md         # your user-wide agent rules
└─ settings.json     # (+ keybindings.json, plans\) — your setup
```

On the laptop the project folder is named `c--Users-John-Desktop-DreamyCafe` — **that name is the
project's full path with `:` / `\` turned into dashes**, and Claude only finds the memory if the
name matches where the project lives on the mini PC.

- [ ] **Same path + same Windows username** (e.g. both `C:\Users\John\Desktop\DreamyCafe`): the
  encoded name is identical — copy `C:\Users\<user>\.claude\` straight across. Simplest, and the
  same-path choice in step 3 already points this way.
- [ ] **Different username or path** (e.g. a dedicated `cafe` login → `c--Users-cafe-Desktop-DreamyCafe`):
  the folder must match the new path's encoding. Foolproof way to avoid computing it by hand — open
  the project in Claude Code on the mini PC **once** (it creates the correctly-named empty
  `projects\…\` folder), then drop the old `memory\` files (and `.jsonl` transcripts, if you want
  history) into that folder.

> The memory files store **facts, not machine paths**, so they copy safely wherever the box lives.
> Project **skills** are already in the repo (`/skills`), so they arrive with the `git clone` —
> nothing extra to copy.
>
> ⚠️ Same rule as the `.env`: **don't paste secrets into the agent chat** to move them. The memory
> folder is shop knowledge, not credentials — keep `.env`, DB dumps, and tunnel creds on disk
> (steps 4, 7, 8), never through the agent.

---

## Do this while the OLD PC is still the live shop

Prep the new PC fully **before** cutover so the switch is a few minutes of downtime, ideally after close.

### 1. Prepare the new mini PC (hardware + OS)

- [ ] Wire it to the router by **ethernet**; give it a **static IP / DHCP reservation** (can reuse the old PC's IP *after* the old one is off, or pick a new one — if new, update tablets in step 9).
- [ ] Set the **machine timezone to the shop's local timezone** (e.g. `Australia/Sydney`) — reports key off the server clock ([DEPLOY.md](../DEPLOY.md) §1).
- [ ] Confirm Windows time sync is on: `w32tm /query /status`.
- [ ] Set Windows Update **active hours** to cover trading hours so it never reboots mid-service.
- [ ] **No UPS** (decided against — a power cut closes the shop anyway). Instead do the free equivalent: Device Manager → Disk drives → system drive → Properties → Policies → leave **"Turn off Windows write-cache buffer flushing"** **unticked**, so a hard power cut stays survivable for Postgres. Reasoning: [database-backup.md](database-backup.md#decision-no-ups-deliberate--dont-re-raise-it).
- [ ] **It runs headless** (server + tunnel only, no POS window) — set up remote access per the next section so you can manage it with no monitor.

### 1a. Headless mini PC — remote access (manage it with no screen, from anywhere)

The mini PC has **no monitor** and only runs the server + tunnel as background services.
You still need a way in to check logs, run migrations, and fix problems — including **from
outside the shop**. This section covers that.

**First install needs a screen once.** You can't set up a blind box: borrow any **TV/monitor
via HDMI + a keyboard** for the initial Windows / Node / PostgreSQL install and to turn on
remote access below. Unplug it once the services and remote access are working.

**Buy an HDMI dummy plug (~$5).** Many mini PCs show a black screen, drop to a low resolution,
or make RDP misbehave with **no** display attached. A dummy plug makes Windows think a monitor
is connected. Cheap insurance for a permanently headless box.

**The services keep it alive, not the remote tool.** Because the server + tunnel run as
**NSSM Windows services** (step 10 / [windows-services.md](windows-services.md)), they start on
boot and run with **nobody logged in**. Remote access is only for *you* to check on and fix the
box — connecting or disconnecting never stops the shop.

> ⚠️ **Never port-forward RDP to the internet.** Exposing Windows Remote Desktop directly to the
> public internet is one of the most-attacked things online (ransomware scanners hunt for it).
> The Tailscale setup below reaches the PC from anywhere **without** exposing anything publicly.

**Remote access = Tailscale + Windows Remote Desktop (RDP).** Tailscale builds a private,
encrypted network between *your devices only*, so the laptop and the mini PC behave as if on the
same LAN — from home, mobile data, anywhere — with nothing exposed to the public internet. You
then RDP over that private link to get the full Windows desktop of the mini PC.

> **Requirement — the mini PC must be Windows 11 Pro** to *host* RDP. Home cannot (it can only
> connect out, not accept a session). Confirm the edition before setup: `winver` or
> Settings → System → About. If it's Home, upgrade to Pro (or fall back to RustDesk unattended,
> which doesn't need Pro).

Set it up during the first install, while the borrowed screen is still attached:

1. **Enable Remote Desktop on the mini PC** — Settings → System → **Remote Desktop** → On.
   (This is the part that needs Pro.)
2. **Create a dedicated login with a strong password** for RDP — a headless box you reach from
   anywhere should not sign in on a blank/weak password. Note it in your password manager.
3. **Install Tailscale on the mini PC** — <https://tailscale.com/download> — sign in with your account.
   - [ ] Set the mini PC as a Tailscale device and **disable key expiry** for it (Tailscale admin
     console → the machine → *Disable key expiry*), so a headless box never silently drops off the
     network months later when its key would have expired.
   - [ ] Confirm Tailscale is running as a **service** (default on Windows) so it reconnects on boot
     with nobody logged in.
4. **Install Tailscale on the laptop** — sign into the **same** account. The two devices now see each other.
5. **Find the mini PC's Tailscale IP** (`100.x.x.x`) — Tailscale admin console, or `tailscale ip` on the mini PC.
6. **From the laptop, connect:** open **Remote Desktop Connection** (`mstsc`), enter the mini PC's
   `100.x.x.x` address, log in with the account from step 2. Works from anywhere the laptop has internet.

- [ ] Verify from **off the shop LAN** (laptop on mobile hotspot): RDP to the `100.x.x.x` address succeeds.
- [ ] After confirming, unplug the borrowed monitor — the dummy plug and RDP take over.

Notes:
- **Free** for personal use (well within Tailscale's free tier for a couple of devices).
- You also still have `http://<lan-ip>:3000/pos` on the shop Wi-Fi for the **app**; Tailscale+RDP is
  for the **Windows box** itself — logs, services, DB, migrations, `cloudflared`.
- (Optional, later) Tailscale **subnet routing** on the mini PC can expose the whole shop LAN
  (e.g. the printers' `192.168.x.x` IPs) to your laptop from home — not needed for normal admin,
  handy for deep troubleshooting.

### 2. Install the prerequisites (match the old PC's versions)

- [ ] **Node.js LTS**.
- [ ] **PostgreSQL 18** to `C:\PostgreSQL` (the backup/restore scripts hardcode `C:\PostgreSQL\bin` — install there or edit the scripts). Same major version as the old PC so `pg_restore` matches.
  - [ ] ⚠️ **Set a strong superuser password at the installer prompt — do NOT reuse the old machine's.** "Match the old PC" applies to *versions*, not this. The old password was published in a public repo before being scrubbed, so it must not carry over; this migration is the natural moment to retire it. The password is a **server** setting and is not inside the dump, so a new one restores fine.
  - [ ] ⚠️ Then **edit `DATABASE_URL` in the copied `.env`** to the new password (step 4 copies `.env` verbatim from the old PC — leave it untouched and the app simply won't connect). Update your off-machine `.env` copy too.
- [ ] **cloudflared** (tunnel).
- [ ] **Google Drive for Desktop**, signed into the **shop** account, `My Drive` mounted as `G:` ([database-backup.md](database-backup.md) §7).
- [ ] **Git**.

### 3. Get the code onto the new PC

The code lives on GitHub at `https://github.com/phuanh20001/DreamyCafe.git`. **Before you
clone, make sure the laptop has pushed everything** — on the laptop run `git status` (clean tree)
and `git push`, so the mini PC pulls the latest. Then on the new PC:

```powershell
git clone https://github.com/phuanh20001/DreamyCafe.git C:\Users\<user>\Desktop\DreamyCafe
cd C:\Users\<user>\Desktop\DreamyCafe
git checkout Test          # or whichever branch is live in the shop
npm install
```

> **The `.env` is NOT on GitHub** (gitignored on purpose) and NOT in any backup — so the clone
> gives you code but no secrets. It is the one file that exists **only on the laptop**. Copy it
> across by hand in step 4. Losing the laptop before you've copied `.env` elsewhere means
> rebuilding secrets from scratch — grab a copy now, off the laptop, into a password manager.

> The `scripts\*.ps1` files locate the project from their own location (`$PSScriptRoot`), so
> installing to a **different path** needs no edits to them — just re-run the `register-*.ps1`
> scripts on the new PC so the scheduled tasks point at the new location.
> Same for `install-windows-services.ps1`: it derives the path too, but NSSM *stores* the
> resolved path when the service is installed — so if you ever move the project folder
> afterwards, re-run it or the services will point at the old location.

### 4. Put the secrets in place

- [ ] Copy the old **`.env`** to the project root on the new PC (USB or password manager — **not** email/cloud in plaintext).
- [ ] If the DB password will differ on the new PC, update it in `DATABASE_URL` only — the backup/restore scripts read it from there, so `.env` is the single place it lives.
- [ ] Leave `PUBLIC_ZONE_SECRET` **unchanged** — it must keep matching the Cloudflare Transform Rule, or the public zone breaks.

The env keys currently in use (for reference — copy the real values, don't retype):

```
DATABASE_URL  JWT_SECRET  PUBLIC_ZONE_SECRET
STRIPE_SECRET_KEY  STRIPE_WEBHOOK_SECRET  STRIPE_CURRENCY
SQUARE_ACCESS_TOKEN  SQUARE_WEBHOOK_SIGNATURE_KEY  SQUARE_LOCATION_ID  SQUARE_ENV  SQUARE_CURRENCY
PRINTER_FRONT_IP  PRINTER_KITCHEN_IP  PRINTER_PORT
DOCKET_BRAND_NAME  RECEIPT_ADDRESS  RECEIPT_PHONE  RECEIPT_EMAIL  RECEIPT_ABN
BACKUP_HEALTHCHECK_URL
```

### 5. Create an empty database + apply the schema

```powershell
$env:PGPASSWORD = "<db-password>"
& "C:\PostgreSQL\bin\createdb.exe" -U postgres dreamycafe
$env:PGPASSWORD = ""

npx prisma migrate deploy   # builds the schema; the real data comes in step 7 (cutover)
```

### 6. Smoke-test the new PC in isolation (do NOT start the tunnel yet)

```powershell
npm run build
npm run start        # http://localhost:3000
```

- [ ] `http://localhost:3000/pos` loads on the new PC.
- [ ] `npm run build` completed clean.
- [ ] **Do not run `cloudflared` yet** — two tunnels for the same hostname would fight. The old PC is still serving customers.

Stop `npm run start` again once this passes. The new PC is now staged and waiting for the data + cutover.

---

## Cutover (short downtime — do it after close)

Everything above was zero-downtime prep. This part swaps the live shop over. Budget ~15 minutes.

### 7. Move the real data across

1. On the **OLD PC**, take a fresh backup so you carry the very latest sales:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
   ```
2. **Stop the old app** (so no new orders are written after the snapshot): Quit from the desktop-app tray, or `stop-pos.bat`, or stop the NSSM services. From here the shop is briefly offline.
3. Copy the newest `dreamycafe_<stamp>.dump` **and the matching** `uploads_<stamp>.zip` to the new PC (they share a timestamp — take the pair). You can also pull them from `G:\My Drive\DreamyCafe-Backups\<OLD-PC-NAME>\` — check you're in the **old** machine's subfolder, since each machine mirrors into its own.
4. On the **NEW PC**, restore data + images over the empty DB from step 5:
   ```powershell
   $env:PGPASSWORD = "<db-password>"
   & "C:\PostgreSQL\bin\pg_restore.exe" -h localhost -U postgres -d dreamycafe --clean --if-exists "<path-to-.dump>"
   $env:PGPASSWORD = ""

   Expand-Archive -Path "<path-to>\uploads_<stamp>.zip" -DestinationPath "public\uploads\products" -Force
   ```
5. Verify the data landed (order count should match the old shop):
   ```powershell
   $env:PGPASSWORD = "<db-password>"
   & "C:\PostgreSQL\bin\psql.exe" -U postgres -d dreamycafe -c 'SELECT COUNT(*) FROM "Order";'
   $env:PGPASSWORD = ""
   ```

### 8. Move the tunnel to the new PC

> ⚠️ **Only one machine may run the tunnel for `dreamy-cafe.com` — and "two machines" fails
> quietly, not loudly.** `cloudflared` treats a second host running the *same named* tunnel as a
> **replica**, and Cloudflare load-balances customer traffic across replicas. The site stays up, so
> nothing alerts — but an unpredictable share of real online orders lands on the wrong PC and is
> written to its database. Those orders are invisible to the shop and absent from the day's takings.
> Confirm the old PC's `cloudflared` is fully stopped **and** cannot restart (see
> [Decommission](#decommission-the-old-pc-after-the-new-one-is-proven)) before starting it here.

Two options:

- **Reuse the same tunnel (simplest):** copy `C:\Users\<olduser>\.cloudflared\` (the `config.yml` **and** the `<TUNNEL-ID>.json` credentials) to the same folder on the new PC. Fix the paths inside `config.yml` if the username changed. Make sure the old PC's `cloudflared` is **stopped** (step 7.2 covered the app; also stop its tunnel service). Then on the new PC:
  ```powershell
  cloudflared tunnel ingress validate
  cloudflared tunnel run dreamycafe
  ```
- **Create a fresh tunnel:** follow [DEPLOY.md](../DEPLOY.md) §4 (`login` → `create` → `route dns` → `run`). Cloudflare will repoint the DNS to the new tunnel.

Either way, DNS already points at `dreamy-cafe.com`; you're just changing which machine answers.

### 9. Point the tablets at the new PC (only if the LAN IP changed)

- If the new PC **took the old PC's IP**, tablets need nothing.
- If it has a **new IP**, on each till tablet open the POS at the new address and re-install the PWA (Add to Home Screen). Remove the old shortcut.

> **With LAN TLS ([lan-tls.md](lan-tls.md)) the tablet URL is `https://<new-ip>` — no `:3000`.**
> The IP is baked into the Caddy service as `POS_LAN_HOST`, so a changed IP means re-running
> `scripts\install-caddy-service.ps1 -LanHost <new-ip>`; Caddy then issues a fresh leaf cert for the
> new IP off the **same root CA**, so the iPads' one-time root trust still applies — no re-trust
> needed. Without Caddy it's the plaintext `http://<new-ip>:3000/pos`.

### 10. Make it survive reboots (critical for a 24/7 box)

Set up auto-start so a power blip fully self-recovers — use **one** of these, never both ([windows-services.md](windows-services.md)):

```powershell
# Recommended: NSSM services (app waits for PostgreSQL, restarts on crash)
powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1   # Administrator
```

Then re-create the scheduled jobs on the new PC:

- [ ] **Nightly backup** — `powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1` (no Admin needed).
- [ ] **Monthly maintenance** — `powershell -ExecutionPolicy Bypass -File scripts\register-maintenance-task.ps1` (Admin).
- [ ] **Quarterly restore drill** — `scripts\register-restore-drill-task.ps1` (Admin).

---

## Verify the new PC is fully live

Run [DEPLOY.md](../DEPLOY.md) §7 and the go-live Phase 2 checks. Minimum set:

- [ ] `http://<new-ip>:3000/pos` and `/admin` work on the LAN.
- [ ] From a phone on **mobile data**: `https://dreamy-cafe.com/order` loads; `/admin` and `/pos` redirect away; `https://dreamy-cafe.com/api/health` returns `{"ok":true,"db":true}`.
- [ ] Test **print** from Admin → Printers (FRONT + KITCHEN) — printer IPs in `.env` still match the LAN.
- [ ] Test **card charge $1.00** on the real reader (Stripe Terminal or Square).
- [ ] Place a real **online order** end-to-end → pays → webhook → kitchen docket → loyalty stamp. (Webhook URLs are domain-based, so they don't change — but confirm they fire from the new host.)
- [ ] **Power-loss test:** pull power on the mini PC, boot cold, confirm the POS is serving within ~2 min with **no manual step** (proves the Postgres-dependency + auto-restart from step 10).
- [ ] Confirm a manual backup runs and mirrors to Google Drive: `Start-ScheduledTask -TaskName "DreamyCafe DB Backup"`.
- [ ] Point `BACKUP_HEALTHCHECK_URL`'s healthchecks.io check at the new PC's runs (it flips green on the first success).

---

## Decommission the old PC (after the new one is proven)

Do this only once the new PC has traded successfully for at least a day.

- [ ] **Keep the old PC's `cloudflared` stopped/disabled** and its NSSM services disabled, so it can never wake up and contend for the tunnel or write to a stale DB.
- [ ] **Take one final backup off the old PC** and keep it labelled "pre-migration final" until you're confident (a week+).
- [ ] Once confident, wipe the old `.env` and DB from the old PC (they hold live customer data and secrets). If repurposing or selling the PC, do a full disk wipe.
- [ ] Update the **healthcheck** and any uptime monitor so alerts reflect the new machine, not the retired one.

### Retire the launcher scripts (the habit that breaks a cutover)

The old PC ran in **launcher mode**: `start-pos.bat` → Electron → which spawns *both* `npm run start`
**and** `cloudflared tunnel run dreamycafe` ([desktop/main.js](../desktop/main.js) `spawnServer` /
`spawnTunnel`). The new mini PC runs in **services mode** — NSSM starts everything at boot and the
iPad is the till, so nothing is ever launched by hand.

That makes the old launchers not merely unused but *hazardous*: one double-click out of habit on the
retired PC starts a second tunnel replica (see the warning in step 8). Close that off deliberately —
disabling the services isn't enough, because these scripts bypass services entirely.

**On the OLD PC, once the new one is proven:**

- [ ] Delete (or rename with a `.RETIRED` suffix) **`start-pos.bat`** and **`start-pos-hidden.vbs`**.
      Both start a server *and* the `dreamycafe` tunnel. (`start-pos-dev.bat` did the same and has
      already been removed — use `npm run dev` for development, with no tunnel.)
- [ ] **`stop-pos.bat`** is worth keeping until the machine is wiped — it's the tool that kills any
      stray Electron / node / `cloudflared` the old box still has running.
- [ ] **`enable-`/`disable-windows-services.bat`** exist only to toggle between launcher mode and
      services mode. With launcher mode gone they have no destination, and they predate Caddy — they
      only know about `DreamyCafeApp` and `DreamyCafeTunnel`, so on a TLS box they'd leave
      `DreamyCafeCaddy` behind. Retire them with the launchers.

**On the NEW PC, if you install LAN TLS ([lan-tls.md](lan-tls.md)):**

- [ ] **`scripts/allow-lan-pos.ps1`** and **`scripts/test-lan-pos.ps1`** are from the plaintext era —
      both assume `http://<ip>:3000`. `install-caddy-service.ps1` adds a firewall rule that **blocks**
      inbound 3000, and Windows Firewall block rules override allow rules. So on a healthy TLS setup
      `test-lan-pos.ps1` reports failure and points you at `allow-lan-pos.ps1`, which appears to
      succeed and changes nothing. Either update both to `https://<ip>` (port 443) or delete them and
      treat [lan-tls.md](lan-tls.md) as the authority — but don't leave them as-is, because
      [staff-quick-reference.md](staff-quick-reference.md) sends staff here for "iPad can't open POS",
      the most likely support call once the iPad is the till.

---

## Common migration mistakes

| Symptom | Cause |
|---|---|
| Public site down / staff pages exposed to the internet after cutover | `PUBLIC_ZONE_SECRET` on the new PC doesn't match the Cloudflare Transform Rule — copy the old value verbatim (step 4). |
| `502`/nothing at `dreamy-cafe.com` | Tunnel not running on the new PC, or **both** PCs' tunnels running and fighting — ensure the old one is stopped (step 8). |
| Product photos broken but menu works | Forgot the `uploads_<stamp>.zip` — restore the images (step 7.4). |
| App won't start on the new PC despite a good DB restore | `.env` missing or `JWT_SECRET` unset — it's in no backup; copy it from the old PC (step 4). |
| Reports show the wrong trading day | New PC timezone left on UTC — set it to the shop's local zone (step 1). |
| `pg_restore` version error | New PC's PostgreSQL major version differs from the old dump — install the matching major version (step 2). |
| Everyone logged out / PINs rejected | `JWT_SECRET` changed between machines — expected only if you didn't carry the old `.env`; staff just re-authenticate. |

---

*Related: [DEPLOY.md](../DEPLOY.md) · [go-live-checklist.md](go-live-checklist.md) · [database-backup.md](database-backup.md) · [windows-services.md](windows-services.md) · [RUNBOOK.md](../RUNBOOK.md)*
