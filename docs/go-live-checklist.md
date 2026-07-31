# Go-Live Checklist

Everything needed to move DreamyCafe from "installed on the shop PC" to "open for
real customers."

> **Not installed yet?** Start at [production-setup.md](production-setup.md) — the ordered
> zero-to-open path (rebrand → hardware → app → payments → public zone → marketing → resilience →
> backups). It hands off to this checklist once the shop PC is built.

Use this alongside:

- [RUNBOOK.md](../RUNBOOK.md) — day-to-day operation + "something is broken, what do I do" playbooks
- [DEPLOY.md](../DEPLOY.md) — tunnel, printers, Stripe webhook, zone lockdown
- [database-backup.md](database-backup.md) — nightly backups + restore
- [terminal-setup.md](terminal-setup.md) — Stripe in-person reader (S700 / WisePOS E)
- [square-terminal-setup.md](square-terminal-setup.md) — Square Terminal / Handheld pairing
- [windows-services.md](windows-services.md) — auto-start after reboot
- [uptime-monitoring.md](uptime-monitoring.md) — external downtime alerts
- [staff-quick-reference.md](staff-quick-reference.md) — print for the till

---

## Phase 1 — Production configuration

Do these once before opening day.

### Environment & secrets

- [ ] `.env` has a strong `JWT_SECRET` (app refuses to start without it)
- [ ] `DATABASE_URL` points at the live `dreamycafe` database on this PC
- [ ] `PUBLIC_ZONE_SECRET` matches the Cloudflare Transform Rule on **`dreamy-cafe.com`**
- [ ] **Marketing** on Cloudflare Pages at **`www.dreamy-cafe.com`** — see [marketing-pages.md](marketing-pages.md)
- [ ] **In-store** provider set in Admin → Payments (`provider`)
- [ ] **Online** provider set separately (`onlineProvider`)
- [ ] If **Stripe** is active for either channel: keys + webhook for that channel
- [ ] If **Square** is active for either channel: token, location, device (in-store), and `SQUARE_WEBHOOK_SIGNATURE_KEY` (online)
- [ ] `GST_RATE` and `GST_INCLUSIVE` set for your accountant (defaults: `0.1` / `true`)
- [ ] Receipt business details in `.env`: `DOCKET_BRAND_NAME`, `RECEIPT_ADDRESS`, `RECEIPT_PHONE`, `RECEIPT_EMAIL`, `RECEIPT_ABN`
- [ ] **Admin → Printers** — set **Printer type** and **Paper width** for each station (Generic ESC/POS for Epson/Bixolon/Citizen; Star Micronics for Star)
- [ ] Printer IPs in `.env` match static reservations on the LAN (`PRINTER_FRONT_IP`,
  `PRINTER_KITCHEN_IP`)

### Menu & products

- [ ] Real menu entered in **Manager → Menu** (categories, products, prices, modifiers)
- [ ] Loyalty stamp products flagged (`loyaltyEnabled`) where appropriate
- [ ] Test order on POS confirms correct prices, modifiers, and docket routing
- [ ] Online menu at `https://dreamy-cafe.com/order` shows the same items and prices
- [ ] `https://dreamy-cafe.com/` loads from Pages **without** the tunnel running

### Staff & access

- [ ] Real staff accounts created (**Admin → Users** or **Manager** create + Admin approve)
- [ ] Default seed PINs changed (`admin` / `manager` seed users use `0000` / `1234`)
- [ ] Each staff member knows their clock-in PIN and cashier PIN
- [ ] At least one MANAGER and one ADMIN account are ACTIVE

### Payments

- [ ] **In-store** and **online** providers set in Admin → Payments (`provider` / `onlineProvider`)
- [ ] If **Stripe** in-store: reader registered in Stripe Dashboard, `tmr_…` saved as **COUNTER** ([terminal-setup.md](terminal-setup.md))
- [ ] If **Square** in-store: `SQUARE_ENV=production`, production token + location in `.env`; **Pair Square Terminal** in Admin → Payments → save device id ([square-terminal-setup.md](square-terminal-setup.md))
- [ ] Card surcharge configured; blocked brands only apply where **Stripe** is the provider for that channel
- [ ] **Test charge $1.00** succeeds on the real reader (live mode = real money)
- [ ] If using Square: sandbox scripts PASS; then `verify-square-production-ready.js` PASS after switching to production
- [ ] If Square online: `SQUARE_WEBHOOK_SIGNATURE_KEY` set; webhook URL `https://dreamy-cafe.com/api/webhooks/square`

### Printers & floor

- [ ] Test print from **Admin → Printers** (FRONT and KITCHEN)
- [ ] Docket prints on order; tax receipt auto-prints when enabled in **Admin → Printers** (cash and card)
- [ ] Table layout matches the real floor (**Tables** tab); layout locked before service

### Backups & resilience

- [ ] Nightly backup task `DreamyCafe DB Backup` exists and `LastTaskResult = 0`
- [ ] Google Drive mirror working (`G:\My Drive\DreamyCafe-Backups\<COMPUTERNAME>\`)
- [ ] Restore drill: `powershell -ExecutionPolicy Bypass -File scripts\restore-drill.ps1` (quarterly task via `scripts\register-restore-drill-task.ps1`)
- [ ] Windows services: `powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1` (Administrator) — app + tunnel survive reboot; the App service now waits for PostgreSQL and restarts on crash ([windows-services.md](windows-services.md))
- [ ] **Power-loss test (mini PC):** pull power, boot cold, and confirm the POS is serving within ~2 min with **no manual step** — proves the Postgres-dependency + auto-restart ordering works
- [ ] **Write-cache check (replaces the old UPS item):** Device Manager → Disk drives → system drive → Properties → Policies → leave **"Turn off Windows write-cache buffer flushing"** **unticked**. **No UPS** — decided against, since a power cut closes the shop anyway; see [database-backup.md](database-backup.md#decision-no-ups-deliberate--dont-re-raise-it)
- [ ] Uptime alerts: UptimeRobot on `https://dreamy-cafe.com/api/health` ([uptime-monitoring.md](uptime-monitoring.md))
- [ ] Run `scripts\verify-resilience.ps1` — all checks green before opening day

### Legal & compliance (Australia)

> **Not legal advice** — these are the app-touching obligations to confirm. Have a bookkeeper/accountant sign off on tax items and a qualified person review the privacy wording. Much of café compliance (food licence, employment/awards, food-safety supervisor) lives in the **business**, not this app.

- [ ] **ABN set** — `RECEIPT_ABN` in `.env` **must** be set. The receipt only prints the words "TAX INVOICE" when an ABN is present (otherwise it prints plain "RECEIPT"); a tax invoice without an ABN is not valid.
- [ ] **GST config** — `GST_RATE` (default `0.1`) and `GST_INCLUSIVE` (default `true`) match your registration; displayed menu prices are GST-inclusive.
- [ ] **Card surcharge (ACCC)** — if you enable a surcharge in Admin → Payments, it must **not exceed your actual cost of acceptance**, and you must **confirm the current 2026 rules** (surcharging on debit cards has been under reform — check the RBA/ACCC position *before* enabling). The app does not cap the rate for you.
- [ ] **Privacy policy** — the public site collects customer **name + phone** for loyalty/online orders. A `/privacy` page ships at `https://dreamy-cafe.com/privacy`; **fill in every `[REVIEW]` placeholder** (legal entity name + address, contact email, retention period, exact third parties: Stripe/Square, Cloudflare) and have the wording reviewed. Add a link to it from the marketing site footer.
- [ ] **Record keeping** — sales/tax records must be kept for **5 years** (the DB backups cover this; keep the off-site copies).

---

## Phase 2 — Infrastructure verification

From [DEPLOY.md](../DEPLOY.md) §7 — confirm from a phone **off the shop Wi‑Fi**
(mobile data):

- [ ] `https://dreamy-cafe.com/` loads (Cloudflare Pages — marketing)
- [ ] `https://dreamy-cafe.com/order` loads
- [ ] `https://dreamy-cafe.com/loyalty` loads
- [ ] `https://dreamy-cafe.com/admin`, `/pos`, `/manager` blocked or redirected
  (staff zone hidden from internet)
- [ ] `https://dreamy-cafe.com/api/health` returns `{"ok":true,"db":true}`
- [ ] `https://dreamy-cafe.com/api/orders` returns 404 from the internet

On the **shop LAN**:

- [ ] `http://<shop-pc-ip>:3000/pos` loads
- [ ] PWA installed on the till tablet (Add to Home Screen / Install app)
- [ ] Only **one** `/pos` window open per device (second window shows lock screen)

---

## Phase 3 — End-to-end rehearsal

Run through every path on a quiet day. Use small real amounts if on live Stripe.

### In-store POS

- [ ] Clock in → select cashier on POS
- [ ] **Manager → Cash**: open session with opening float
- [ ] Cash order → docket prints → optional receipt from order history
- [ ] Card order → reader tap → order created only after success
- [ ] Split bill (by price and by product) on the actual tablet
- [ ] Table order: seat table → **New Order** → POS pre-selects table
- [ ] Manual discount / tip / loyalty stamp redemption (if used)

### Online

- [ ] Place order on `https://dreamy-cafe.com/order` → pay on active provider → webhook → kitchen print → loyalty stamp
- [ ] Set prep time → status moves to PREPARING
- [ ] Mark Ready → Collected
- [ ] Loyalty stamp accrues for matching phone + eligible items

### Manager / owner

- [ ] Refund a cash order → drawer OUT movement logged
- [ ] Refund a card order → processor refund issued (Stripe or Square per order)
- [ ] **Manager → Sales → History** shows item names and totals
- [ ] **Admin → Reports**: accounting summary + Export CSV for date range
- [ ] **Admin → Payroll** (if paying staff from the system)

### Failure paths (know what happens before it happens)

- [ ] Internet down: POS still works on localhost for **cash and cash split**; banner shows internet down; **no card or online**
- [ ] Card reader unplugged / error: fall back to cash; fix reader before next card sale
- [ ] Printer offline: order still saves; reprint docket/receipt from order detail later
- [ ] Host PC reboot: services auto-start; verify online ordering within 5 minutes

---

## Phase 4 — Opening day

### Before doors open

1. Host PC on; confirm POS loads
2. Staff clock in
3. Manager opens cash session (float counted)
4. Quick test print
5. Glance at **Online** tab — alert chime enabled

### During service

- Staff quick reference at the till: [staff-quick-reference.md](staff-quick-reference.md)
- Manager handles refunds, cash movements, and 86'd items
- Owner checks low-stock badge on **Admin → Stock** when convenient

### End of day

1. Manager closes cash session — count drawer, note variance
2. Owner exports accounting CSV if needed (**Admin → Reports**)
3. Confirm backup ran (`Get-ScheduledTaskInfo -TaskName "DreamyCafe DB Backup"`)

---

## Phase 5 — After go-live

### Weekly

- [ ] Spot-check Google Drive has recent `.dump` files
- [ ] Review cash session history for unexplained variance

### Monthly

- [ ] Send accounting CSV export to bookkeeper
- [ ] Review payroll if using timesheet data

### Quarterly

- [ ] Restore drill: `powershell -ExecutionPolicy Bypass -File scripts\restore-drill.ps1` (or quarterly Task Scheduler via `scripts\register-restore-drill-task.ps1`)
- [ ] Rotate Stripe keys if any exposure suspected
- [ ] Confirm `PUBLIC_ZONE_SECRET` and Transform Rule still match

### Every deploy (code update)

1. Run backup manually before migrating
2. `npm run build` then restart the app
3. `CACHE_VERSION` is generated into `public/sw.js` from `scripts/sw.template.js` (keyed on the git commit id) on `npm run build` **and** `npm run start` — never hand-edit or commit `public/sw.js` (it's gitignored); edit `scripts/sw.template.js` if the worker itself needs changing
4. Hard-refresh or re-open the PWA on each till tablet

---

## Quick reference — who does what

| Task | Role |
|------|------|
| Ring orders, clock in/out | STAFF |
| Cash session, refunds, menu edits, stock qty | MANAGER |
| Users, payments, printers, stock add/remove, payroll, reports | ADMIN (Owner) |

| Panel | URL | Login |
|-------|-----|-------|
| POS | `/pos` | Cashier PIN at checkout |
| Manager | `/manager/menu` | Manager PIN (navbar) |
| Admin | `/admin` | Admin PIN (navbar, ~5 min session) |
