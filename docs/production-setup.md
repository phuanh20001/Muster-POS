# Production Setup — The Master Path

**Zero to open-for-business, in order.** Every individual step already has a detailed doc; this
one is the **map** that sequences them and says what depends on what. Follow it top to bottom.

> **How this differs from the other docs**
> - **This doc** = the ordered end-to-end path (rebrand → hardware → app → payments → public zone → marketing → resilience → backups → go live). Start here.
> - [go-live-checklist.md](go-live-checklist.md) = the detailed tick-box checklist for the config / rehearsal / opening-day phases. This doc hands off to it at Phase 9.
> - [RUNBOOK.md](../RUNBOOK.md) = after you're live: daily operation and "something is broken" playbooks.
> - [migrate-to-new-pc.md](migrate-to-new-pc.md) = moving an **already-live** shop to new hardware. Different job — use that instead if data already exists.

---

## For an AI agent working this doc

**Read [AGENTS.md](../AGENTS.md) first** — it is the canonical rulebook (JS-only, money via
`src/lib/money.js`, no new deps, no native browser dialogs). This doc is the *procedure*;
AGENTS.md is the *law*. Work the phases in order and do not skip ahead — the ordering below is
load-bearing in several places (flagged **⚠ ORDER**).

| An agent MAY do | A HUMAN must do |
|---|---|
| Install prerequisites, `git clone`, `npm install`, `npm run build` | **Create/copy `.env`.** Never fabricate secrets or invent values. Put the real file on disk; don't paste secrets into agent chat |
| `createdb` + `npx prisma migrate deploy` + `npm run db:seed` | **Live card charges** (real money) and reader pairing |
| Run the `scripts\*.ps1` installers (services, backup, maintenance, TLS) | **DNS / tunnel cutover** and the Cloudflare Transform Rule (dashboard work) |
| Edit rebrand env vars, `manifest.json`, `offline.html`, `marketing/` copy | **Legal wording** — privacy policy `[REVIEW]` placeholders, ABN, GST, card surcharge (ACCC) |
| Run verification commands and report results | **Change the seed PINs** and hand out staff credentials |
| Update `CHANGELOG.md` | Approve any commit/push (**never commit unless explicitly asked**) |

**Never touch during setup:** `src/lib/money.js`, `src/lib/zone.js`, `src/proxy.js`,
`src/lib/paymentProvider.js`, `src/app/api/{orders,terminal,webhooks}/**`. There is nothing to
edit in those files to deploy a shop — if a change there seems necessary, stop and ask.

**Resuming mid-way?** Run this to work out which phase you're in:

```powershell
Get-Service DreamyCafeApp, DreamyCafeCaddy, DreamyCafeTunnel -ErrorAction SilentlyContinue
Get-ScheduledTaskInfo -TaskName "DreamyCafe DB Backup" -ErrorAction SilentlyContinue
Test-Path .env, .next, backups
Invoke-WebRequest http://localhost:3000/api/health -UseBasicParsing | Select-Object StatusCode
```

---

## Phase 0 — Decide and gather (human)

Nothing is installed yet. Settle these first; several later phases hard-depend on them.

- [ ] **Shop name + domain** (drives Phase 1 and every URL afterwards).
- [ ] **Payment providers** — chosen *per channel*, they're independent: in-store (`provider`) and online (`onlineProvider`). Stripe, Square, or one of each.
- [ ] **Hardware** — the 24/7 host (mini-PC), two ESC/POS network printers, and till tablets. (**No UPS** — deliberately decided against; a power cut closes the shop anyway.)
- [ ] **Accounts** — Cloudflare (domain + Tunnel + Pages), Stripe and/or Square, Google (backup mirror), [healthchecks.io](https://healthchecks.io) (backup alerts), [UptimeRobot](https://uptimerobot.com) (uptime alerts).
- [ ] **Accountant/bookkeeper** briefed for the GST/ABN items in Phase 6.

**Done when:** you know the domain, the two providers, and have logins for all accounts above.

---

## Phase 1 — Rebrand

Change "DreamyCafe" to the real shop name. Mostly **env vars, not code**.

**Do:** [rebrand-checklist.md](rebrand-checklist.md) — set `NEXT_PUBLIC_BUSINESS_NAME`,
`NEXT_PUBLIC_BUSINESS_TAGLINE`, `DOCKET_BRAND_NAME`, `NEXT_PUBLIC_PRIVACY_EMAIL`; then hand-edit
the static files that can't read env (`public/manifest.json`, `public/offline.html`,
`marketing/index.html`, `marketing/config.js`), and replace `public/icon.svg` if the logo changed.

> ⚠ **Do NOT rename project identity** — repo folder, `package.json` name, `AGENTS.md`/`CLAUDE.md`,
> all `scripts/*.ps1`, `*.bat`, and the Windows service names. Renaming those breaks tooling for
> zero customer benefit. The checklist has the full leave-alone list.

**Done when:** `/`, `/order`, `/privacy`, the browser tab, the PWA name, and a printed receipt all
show the real name.

---

## Phase 2 — Host machine (the 24/7 box)

**Do:** [DEPLOY.md §1](../DEPLOY.md) plus [migrate-to-new-pc.md §1–§2](migrate-to-new-pc.md) (its
hardware/prereq sections apply to a fresh build too).

- [ ] Ethernet + **static IP / DHCP reservation** (e.g. `192.168.1.10`).
- [ ] **Machine timezone = shop's local timezone.** Reports key off the server clock; a box left on UTC reports the wrong trading day. Confirm sync: `w32tm /query /status`.
- [ ] Install **Node.js LTS**, **PostgreSQL 18 → `C:\PostgreSQL`**, **Git**, **cloudflared**, **Google Drive for Desktop** (shop account, `My Drive` mounted as `G:`).
- [ ] ⚠️ **Set a strong PostgreSQL superuser password** at the installer prompt, and put it in `DATABASE_URL` in `.env` — that's the *only* place it is ever recorded. Don't reuse an earlier one, and never write it into a doc or script: every ops script resolves it from `DATABASE_URL` via `Get-DbPassword`, so nothing else needs a copy.
- [ ] **Headless access** — Tailscale + RDP (needs **Windows 11 Pro** to host RDP), HDMI dummy plug. Full walkthrough: [migrate-to-new-pc.md §1a](migrate-to-new-pc.md). ⚠ Never port-forward RDP to the internet.
- [ ] **Write-cache flushing stays ON** — Device Manager → Disk drives → system drive → Properties → Policies → leave **"Turn off Windows write-cache buffer flushing"** **unticked**. This is the free stand-in for the UPS that was deliberately dropped ([why](database-backup.md#decision-no-ups-deliberate--dont-re-raise-it)).
- [ ] **Windows Update** — set active hours to cover trading, then `scripts\configure-windows-updates.ps1` and `scripts\register-feature-update-reminder-task.ps1`.

> **PostgreSQL must go to `C:\PostgreSQL`** — the backup/restore scripts hardcode
> `C:\PostgreSQL\bin`. Install elsewhere only if you'll edit those scripts.

**Done when:** the box has a fixed IP, correct clock, all prerequisites installed, and you can RDP
in from off-site.

---

## Phase 3 — App and database

**Do:** [DEPLOY.md §1](../DEPLOY.md) steps 3–4.

```powershell
git clone <repo-url> C:\Users\<user>\Desktop\DreamyCafe
cd C:\Users\<user>\Desktop\DreamyCafe
git checkout <live-branch>
npm install
# put the real .env in the project root (HUMAN — see below)
& "C:\PostgreSQL\bin\createdb.exe" -U postgres dreamycafe
npx prisma migrate deploy
npm run db:seed
npm run build
npm run start          # smoke test only
```

> **Keep the same project path** you intend to keep forever. The `scripts\*.ps1` files find the
> project from their own location, so nothing to edit — but the scheduled tasks and NSSM services
> store the path they were *registered* with. Moving the folder later means re-running the
> `register-*.ps1` scripts and `install-windows-services.ps1`.

**The `.env` is human-supplied.** It is gitignored by design and in **no** backup. Required keys are
listed in [migrate-to-new-pc.md §4](migrate-to-new-pc.md) and [README](../README.md#setup); the app
**refuses to start without `JWT_SECRET`**. Keep a copy in a password manager — losing it is the one
unrecoverable failure.

**Done when:** `http://localhost:3000/pos` returns 200 and `npm run build` is clean. Stop the server
again; do **not** start the tunnel yet.

---

## Phase 4 — Payments

**Do:** [DEPLOY.md §5–§6](../DEPLOY.md), plus [terminal-setup.md](terminal-setup.md) (Stripe) or
[square-terminal-setup.md](square-terminal-setup.md) (Square).

- [ ] Set **in-store** (`provider`) and **online** (`onlineProvider`) in **Admin → Payments** — separately.
- [ ] Keys in `.env` for whichever provider(s) are active.
- [ ] **Pair the reader** — Stripe `tmr_…` saved as **COUNTER**, or Square device id.
- [ ] **Webhooks** (these need the public hostname, so the endpoint is registered now but only *fires* after Phase 7): Stripe `…/api/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`; Square `…/api/webhooks/square` → `SQUARE_WEBHOOK_SIGNATURE_KEY`.
- [ ] Card surcharge + blocked brands (brand blocking is **Stripe-only**).
- [ ] **Square:** sandbox scripts pass → switch to production → `node --env-file=.env scripts/verify-square-production-ready.js` passes.
- [ ] **Test charge $1.00 on the real reader** (human — live mode is real money).

**Done when:** a $1 charge succeeds on the physical reader and the order records.

---

## Phase 5 — Printers and floor

**Do:** [DEPLOY.md §2](../DEPLOY.md).

- [ ] Both printers on **ethernet with static IPs** matching `PRINTER_FRONT_IP` / `PRINTER_KITCHEN_IP`.
- [ ] They must speak **ESC/POS over raw TCP 9100** (Star printers may need switching into ESC/POS mode).
- [ ] **Admin → Printers** — set printer type + paper width per station; **test print both**.
- [ ] Table layout matches the real floor (or switch to typed table numbers in **Admin → Settings**).

**Done when:** FRONT and KITCHEN both test-print, and a POS order routes dockets correctly.

---

## Phase 6 — Menu, staff, legal

**Do:** [go-live-checklist.md](go-live-checklist.md) Phase 1 (Menu / Staff / Legal sections).

- [ ] Real menu in **Manager → Menu**; loyalty-eligible products flagged.
- [ ] Real staff accounts; **change the seed PINs** (`admin` = `0000`, `manager` = `1234`); ≥1 ACTIVE MANAGER and ADMIN.
- [ ] `GST_RATE` / `GST_INCLUSIVE`, and receipt details (`RECEIPT_ADDRESS`, `RECEIPT_PHONE`, `RECEIPT_EMAIL`).
- [ ] **`RECEIPT_ABN` must be set** — without it receipts print "RECEIPT", not "TAX INVOICE", which is not a valid tax invoice.
- [ ] **Privacy policy** — fill in *every* `[REVIEW]` placeholder at `/privacy` and have the wording reviewed.
- [ ] **Card surcharge must not exceed your cost of acceptance** (ACCC) — the app does not cap it. Confirm current rules before enabling.

**Done when:** a test order shows correct prices and prints a compliant tax invoice.

---

## Phase 7 — Public zone (Transform Rule → Tunnel)

⚠ **ORDER MATTERS.** Do the **Transform Rule first**. The app treats a request as trusted-LAN when
the `x-dreamy-zone` header is absent — so if you set `PUBLIC_ZONE_SECRET` and start the tunnel
*without* the rule, **internet traffic would be treated as LAN** and the staff zone would be exposed.

**Do:** [DEPLOY.md §3 then §4](../DEPLOY.md).

1. Cloudflare → **Rules → Transform Rules → Modify Request Header**: when `Hostname equals <domain>`, **Set** `x-dreamy-zone` = your `PUBLIC_ZONE_SECRET`. Use **Set**, never *Add*, so a client can't forge or strip it.
2. Then `cloudflared tunnel login` / `create` / `route dns` / `run`, with ingress `hostname: <domain>` → `service: http://localhost:3000`. **Hostname is the domain only — never include a path.**

**Done when:** from **mobile data** (not shop Wi-Fi): `/order` and `/loyalty` load;
`/pos`, `/admin`, `/manager` redirect away; `/api/health` returns `{"ok":true,"db":true}`;
`/api/orders` returns 404.

---

## Phase 8 — Marketing site

**Do:** [marketing-pages.md](marketing-pages.md).

⚠ **`www` on Pages, apex on the Tunnel.** Do **not** point the apex at Cloudflare Pages — the apex
must keep hitting the tunnel or `/order` breaks. Build output directory is `marketing`, build
command empty. Keep `marketing/config.js` → `window.DREAMYCAFE_ORDER_ORIGIN = 'https://<domain>'`
and redeploy Pages after changing it.

**Done when:** `https://www.<domain>/` loads **with the tunnel stopped**, and its Order Online button
opens `https://<domain>/order`.

---

## Phase 9 — LAN TLS (recommended)

Encrypts the Wi-Fi tills so a LAN foothold can't sniff cookies/PINs. **Do:** [lan-tls.md](lan-tls.md).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1   # Administrator
```

Then trust the exported root CA on each iPad and move tablets to `https://<lan-ip>`.

⚠ **ORDER:** set `SESSION_COOKIE_SECURE=1` in `.env` **only after every tablet is on HTTPS** — a
`Secure` cookie is dropped on a still-plaintext tablet and login silently fails there.

**Done when:** tablets load `https://<lan-ip>/pos` with a padlock, plaintext `:3000` is refused from
the LAN, and the till kiosk still works.

---

## Phase 10 — Survive reboots

**Do:** [windows-services.md](windows-services.md).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1   # Administrator
```

Registers `DreamyCafeApp` (waits for PostgreSQL, restarts on crash) and `DreamyCafeTunnel`.

> ⚠ Use **NSSM services OR `start-pos.bat`, never both** — two servers would fight over port 3000
> and two tunnels would fight over the hostname. With services running, open the till with
> **`open-pos.bat`** (Electron kiosk only).

- [ ] **Power-loss test:** pull the power, boot cold, confirm the POS serves within ~2 min with **no manual step**.
- [ ] `powershell -ExecutionPolicy Bypass -File scripts\verify-resilience.ps1` — all green.

**Done when:** a cold boot fully self-recovers and `verify-resilience.ps1` passes.

---

## Phase 11 — Backups and monitoring

⚠ Do this **before** opening, not after — the first day of real sales is exactly what you can't afford to lose.

**Do:** [database-backup.md](database-backup.md) and [uptime-monitoring.md](uptime-monitoring.md).

- [ ] Google Drive for Desktop signed into the **shop** account, `G:\My Drive` mounted (`Test-Path "G:\My Drive"` → True). **Skip** folder-sync of Desktop/Documents (that would upload `.env`).
- [ ] Nightly task **`DreamyCafe DB Backup`** registered: `scripts\register-backup-task.ps1` (9:30 PM, `-StartWhenAvailable`, **no Admin needed** — it must run in the user session to see `G:`).
- [ ] **Dead-man's switch:** healthchecks.io check → `BACKUP_HEALTHCHECK_URL` in `.env`. This is what catches *"backups quietly stopped"* and *"the PC was off"* — the two failures an in-script alert can't. Also powers the low-disk (<5 GB) alarm.
- [ ] Monthly maintenance: `scripts\register-maintenance-task.ps1` (Admin).
- [ ] Quarterly restore drill: `scripts\register-restore-drill-task.ps1` (Admin). Optionally give it a **second** healthchecks.io check with a ~90-day period → `RESTORE_DRILL_HEALTHCHECK_URL` in `.env`; without it the drill falls back to the shared backup check (failures still alert, but nothing notices if the drill stops running).
- [ ] **Run one restore drill now** — `scripts\restore-drill.ps1`. A backup you've never restored is a guess.
- [ ] UptimeRobot HTTP(s) monitor on `https://<domain>/api/health`, 5-min interval, email alert.

**Done when:** a manual backup lands locally **and** in `G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\`, the
healthcheck flips green, and a restore drill passes.

---

## Phase 12 — Full rehearsal

**Do:** [go-live-checklist.md](go-live-checklist.md) Phase 3 — walk every path on a quiet day.

In-store (clock in, cash session, cash + card orders, split bill, table order, discount/tip/loyalty),
online (order → pay → webhook → kitchen print → stamp → prep → ready → collected), manager/owner
(cash + card refunds, sales history, reports CSV, payroll).

**And rehearse the failures before they happen:** internet down (cash still works, card hidden),
reader unplugged, printer offline (order still saves, reprint later), host reboot mid-service.

**Done when:** every path above has been exercised end-to-end at least once.

---

## Phase 13 — Opening day and beyond

**Do:** [go-live-checklist.md](go-live-checklist.md) Phases 4–5, then hand over to
[RUNBOOK.md](../RUNBOOK.md) for daily operation and incident playbooks. Print
[staff-quick-reference.md](staff-quick-reference.md) for the till.

Recurring rhythm once live: **daily** cash session open/close + confirm backup ran · **weekly**
spot-check Drive has recent dumps, review cash variance · **monthly** accounting CSV to the
bookkeeper · **quarterly** restore drill + confirm `PUBLIC_ZONE_SECRET` still matches the Transform
Rule.

**Every code update after go-live:** back up first → `npm run build` → `Restart-Service DreamyCafeApp`
→ hard-refresh the PWA on each tablet. Never hand-edit `public/sw.js` (generated + gitignored — edit
`scripts/sw.template.js`).

---

## Ordering constraints (the ones that bite)

| Must happen before | …this | Why |
|---|---|---|
| Cloudflare **Transform Rule** | starting the **tunnel** | Otherwise internet traffic is treated as LAN and the staff zone is exposed |
| **All tablets on HTTPS** | `SESSION_COOKIE_SECURE=1` | A `Secure` cookie is dropped over plaintext → silent login failure |
| **PostgreSQL** service | `DreamyCafeApp` | `prisma migrate deploy` runs at boot and would lose the race (`DependOnService` handles it) |
| `DreamyCafeApp` | `DreamyCafeTunnel` / `DreamyCafeCaddy` | Both proxy to `localhost:3000`; starting first yields 502s |
| **Backups working** | opening day | Day-one sales are the data you can least afford to lose |
| A **manual backup** | any migration or risky change | The documented rollback |
| **`www` on Pages** | — never point **apex** at Pages | The apex must stay on the tunnel or `/order` breaks |

---

## Full doc index

| Doc | Covers |
|---|---|
| [AGENTS.md](../AGENTS.md) | **Canonical rules** — architecture, money, zones, conventions |
| [DEPLOY.md](../DEPLOY.md) | Host PC, printers, Transform Rule, tunnel, webhooks, terminal |
| [go-live-checklist.md](go-live-checklist.md) | Config / rehearsal / opening-day tick-boxes |
| [RUNBOOK.md](../RUNBOOK.md) | Daily operation + incident playbooks (post-go-live) |
| [rebrand-checklist.md](rebrand-checklist.md) | Renaming to the real shop + domain |
| [marketing-pages.md](marketing-pages.md) | Cloudflare Pages marketing site (`www`) |
| [lan-tls.md](lan-tls.md) | HTTPS for the Wi-Fi tills (Caddy + internal CA) |
| [windows-services.md](windows-services.md) | NSSM auto-start after reboot |
| [database-backup.md](database-backup.md) | Nightly dumps, off-site mirror, restore, maintenance |
| [uptime-monitoring.md](uptime-monitoring.md) | External downtime alerts |
| [terminal-setup.md](terminal-setup.md) · [square-terminal-setup.md](square-terminal-setup.md) | Card reader pairing |
| [staff-quick-reference.md](staff-quick-reference.md) | One-page till guide (printable) |
| [migrate-to-new-pc.md](migrate-to-new-pc.md) | Moving an already-live shop to new hardware |
| [demo-deploy.md](demo-deploy.md) | Seeded public demo instance |
