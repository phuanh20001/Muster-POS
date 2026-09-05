# Muster POS

[![Tests](https://github.com/phuanh20001/Muster-POS/actions/workflows/tests.yml/badge.svg)](https://github.com/phuanh20001/Muster-POS/actions/workflows/tests.yml)

A production point-of-sale and online-ordering system for a coffee shop, built to
actually run a real till, print real dockets, and take real card payments over the
counter and online.

### ▶ [Try the live demo](https://dreamy-cafe.vercel.app) (no signup)

| Role | PIN | What you can see |
| --- | --- | --- |
| **Staff** | `1111` | The till: ring orders, modifiers, combos, split payments |
| **Manager** | `1234` | Menu, cash sessions, sales, timesheets, stock |
| **Owner** | `0000` | Everything above, plus reports, payroll, users, payment settings |

_Seeded demo data, wiped and reseeded nightly. The demo runs the same code as the shop, minus the printers, card terminal and LAN zone lock. It is pinned to an earlier build and still carries the project's former name, DreamyCafe POS._

![Ringing up an order on the staff till](docs/screenshots/pos-order-entry.png)

Not a tutorial clone. This is a full-stack app that a working café uses: staff ring orders on a tablet, kitchen dockets print on thermal printers, customers order online for pickup, and every cent is reconciled at end of day. It runs self-hosted on the shop's own PC, with only the customer-facing routes exposed to the internet.

- **Stack:** Next.js 16 (App Router) · JavaScript · PostgreSQL + Prisma · Tailwind · Stripe & Square · ESC/POS thermal printers · Electron kiosk shell
- **Scale:** 45+ Prisma migrations · role-based back office · dual payment processors · offline-tolerant PWA · self-hosted behind a Cloudflare Tunnel
- **Tested:** 65 unit tests, zero framework dependencies, ~0.4 s — covering the money, pricing, loyalty, voucher and zone-boundary paths

---

## Why this project is worth a look

Most POS side-projects stop at "add item to cart, fake a checkout." The interesting engineering here is in the parts that are easy to get *subtly* wrong and expensive to get wrong in production. Four decisions do most of the heavy lifting:

### 1. Money is never a floating-point number

Every monetary value flows through `decimal.js` via a single [`src/lib/money.js`](src/lib/money.js) module — **there is no raw `+ - * /` or `> <` on money anywhere in the payment, cash, or accounting paths.** Floats silently drift cents (`0.1 + 0.2 !== 0.3`), and a stringified API amount compared with `>` lies without throwing. So the codebase enforces:

- Compute with `add/sub/mul/sum/roundCents`; compare with `cmp/gt/lt/eq` — never native operators.
- Money is stored as Postgres `Decimal(10,2)`, crosses the API as a **string**, and the client re-wraps it with `D(...)` before any math.
- Payment processors only ever receive integer minor units via `toCents(x)`.

This is enforced by a **65-test suite** (`money`, `orderTotals`, `loyalty`, `voucher`, plus the zone and reprice guards) that runs in ~0.4 s on `node:test` with zero framework dependencies — no Jest, no Vitest, no config. It's the kind of discipline that separates "it looked right in the demo" from "the Z-report balances every night."

### 2. A hard trust boundary between the shop LAN and the public internet

The deployment model is deliberately split into two zones:

- **Trusted zone (shop LAN):** the full POS, admin panels, cash drawer, terminal, and reports. Never exposed to the internet.
- **Public zone (internet):** only the customer storefront, online ordering, order tracking, and loyalty lookup — reached through a Cloudflare Tunnel.

The tunnel edge stamps a secret header (`x-dreamy-zone`) that the app validates in [`src/lib/zone.js`](src/lib/zone.js); a request-proxy ([`src/proxy.js`](src/proxy.js)) then enforces a **strict allowlist** — any staff/admin path from the public hostname is redirected away. The rule that makes this safe:

> **Never trust client-supplied prices, discounts, or loyalty counts on a public path — always recompute server-side.**

The online checkout sends only product **ids, quantities, and sizes** — never prices. The server re-resolves every unit price from the live database ([`resolveOnlineOrderItems`](src/lib/onlineCheckout.js)) before charging, so a tampered client payload is discarded, not honored. This boundary has its own tests proving a forged `unitPrice` is ignored and a forged zone header can't unlock staff routes.

### 3. Pluggable payment providers, with real webhooks

Card charging supports **both Stripe and Square**, independently switchable for the in-store terminal vs. the online channel. Each order is stamped with the processor that took it, so refunds always route back correctly. Fulfillment of online orders is driven by **signed webhooks** (`/api/webhooks/stripe`, `/api/webhooks/square`) — the order status flips, loyalty stamps accrue, and dockets print only on *confirmed* payment, idempotently, so a webhook retry can't double-fulfill.

In-person card payments use a **server-driven smart reader** (Stripe Terminal S700 / Square Terminal): card data never touches the app, brand-blocking is enforced via manual capture/void, and split payments charge each card leg independently.

### 4. It degrades gracefully when the internet dies

A café can't stop trading because the ISP dropped. The staff POS is an installable PWA with tiered offline behavior: browse the menu and build a cart with no server at all, and — crucially — **when the local server is up but the WAN is down, cash payments still work** (card is hidden until connectivity returns). The service worker is hand-written (no dependencies) and auto-versioned on every build so tablets never get stuck on stale JavaScript.

---

## How the rules stay enforced

This was built with AI assistance, which is exactly why the guardrails are the interesting part. The failure mode of a fast coding assistant is a plausible-looking diff that quietly breaks an invariant nobody wrote down — a float creeping into a total, a public handler trusting a price off the wire. So the invariants are written down, machine-readable, and tested.

[AGENTS.md](AGENTS.md) is the single canonical spec that both people and coding agents read before touching anything. `CLAUDE.md` and `.cursor/rules/` are **generated from it** (`npm run claude:sync`, with `npm run claude:check` to assert they're current), so the rules cannot drift apart per tool — there is one source of truth, not three copies that disagree by March. It states the things that are expensive to get wrong:

- Money never touches a native operator — everything goes through `src/lib/money.js`.
- Public-zone handlers recompute prices server-side; a client-supplied price is discarded, not honoured.
- JavaScript only. No native browser dialogs. No new dependency without a reason.

Prose alone doesn't hold, so the load-bearing rules have tests behind them: the suite fails if a forged `unitPrice` is ever honoured, or if a forged zone header unlocks a staff route. `skills/` holds per-provider payment playbooks, because Stripe and Square each have enough sharp edges to be worth writing down once instead of rediscovering per feature.

None of this is AI-specific. It's the same reason you'd write these rules down for a team of humans — an assistant just makes the cost of *not* having them show up sooner.

---

## What it does (feature surface)

- **POS** — cart, modifiers/add-ons, sizes, combos, tables & floor plan, split-by-price or split-by-product, surcharges, discounts; staff PIN login
- **Online ordering** — customer pickup at `/order` with live order tracking (unguessable tokens, never sequential ids); checkout via Stripe or Square
- **Card payments** — Stripe Terminal or Square smart reader; flat card surcharge; brand blocking (Stripe channels)
- **Printing** — auto kitchen/front dockets (items only, to save paper) + on-demand full receipts; per-product printer routing; a print-job retry queue
- **Loyalty & vouchers** — buy-9-get-10th-free stamp cards; percent / fixed / free-item vouchers, applied server-side
- **Stock** — raw-ingredient tracking with atomic inventory mutations and low-stock alerts
- **Cash management** — sessions, float, variance, cash movements; refunds adjust the drawer
- **Staff** — clock in/out, timesheets (overnight-shift-safe), payroll hours report, role-based access
- **Reservations** — one-off and recurring (DST-safe recurrence) bookings
- **Back office** — separate **Manager** (`/manager/*`) and **Owner** (`/admin/*`) panels with independent sessions
- **PWA + desktop** — installable staff POS on LAN tablets; Electron kiosk shell for the shop PC

## Roles

Three roles, two back-office panels with **separate login cookies** (a deliberate decoupling — the Owner PIN alone grants `/admin/*` without a prior Manager login):

| Role | Access |
| --- | --- |
| **STAFF** | Clock in/out; POS after staff PIN |
| **MANAGER** | Manager panel — menu, cash, sales, timesheets, stock quantities, staff requests |
| **ADMIN** (owner) | Manager panel **plus** Owner panel — stock add/remove, users, payroll, reports, printers, payment settings, feature toggles |

The Manager session (`manager_session`, 1 h) and Owner session (`admin_session`, ~5 min, short-lived) are independent JWTs, both `httpOnly` and signed with `JWT_SECRET`.

## Architecture at a glance

```
                          Internet
                             │
                 Cloudflare Tunnel  ──sets x-dreamy-zone header──┐
                             │                                    │
   ┌─────────────────────────┼────────────────────────────────── │ ──┐
   │  Shop LAN (trusted)      │  Public zone (allowlisted)         ▼   │
   │                          │                                        │
   │  ┌──────────┐   ┌────────▼─────────┐   ┌───────────────────────┐  │
   │  │  POS /   │   │  Next.js 16 app  │   │  src/proxy.js          │  │
   │  │  Admin   │──▶│  (App Router)    │◀──│  zone allowlist        │  │
   │  │  tablets │   │                  │   │  + server-side reprice │  │
   │  └──────────┘   └───┬────────┬─────┘   └───────────────────────┘  │
   │                     │        │                                    │
   │   ESC/POS printers  │        │  PostgreSQL (Prisma) — local        │
   │   Stripe/Square ◀───┘        └──▶  Decimal money, orders, cash     │
   │   smart reader                                                     │
   └────────────────────────────────────────────────────────────────── ┘
```

---

## Screenshots

**Order entry** — the staff till. Category rail, live search, and a cart that reprices server-side on every change.

![Staff POS order entry screen](docs/screenshots/pos-order-entry.png)

**Combos and modifiers** — one product, a tree of choices. Size, milk, syrups, sauces and free-text instructions all fold into a single line item, and the price recomputes as options are picked.

![Combo builder with size, add-on and sauce options](docs/screenshots/combo-modifiers.png)

**Accounting report** — the end-of-day view that has to balance. Net revenue after refunds, split by payment method, channel and card processor, with GST broken out from the `GST_RATE` / `GST_INCLUSIVE` config. Every figure comes off `Decimal(10,2)` columns, never a float.

![Accounting summary report with GST and payment breakdowns](docs/screenshots/reports-accounting.png)

_Still to capture: split payment, online order + live tracking, and a real docket coming out of the thermal printer — the last one sells the "this is real hardware" story better than any paragraph._

> **Screenshots are PII surface.** Anything captured from a live instance can carry a real customer name, phone, or order. Reseed or use fake records before capturing, and check the image itself — the sanitise grep only reads text.

<!-- ![POS checkout](docs/screenshots/pos.png) -->

---

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Language:** JavaScript only (no TypeScript, by design — see `AGENTS.md`)
- **Database:** PostgreSQL via Prisma ORM
- **Styling:** Tailwind CSS
- **State:** React hooks (no Redux/Zustand)
- **Money:** `decimal.js` (never floats)
- **Payments:** Stripe and/or Square — in-person terminal + online checkout, configurable per channel
- **Printing:** ESC/POS network thermal printers
- **Desktop:** Electron kiosk shell (`desktop/`) for the shop PC
- **Auth:** `jose` (JWT, `httpOnly` cookies), `bcryptjs` PIN hashing

---

## Running it locally

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (default DB `dreamycafe` on port 5432)

### Setup

```bash
npm install
```

Create a `.env` in the project root:

```env
# Database
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/dreamycafe"

# Auth — REQUIRED. The app refuses to start without it. Use a long random value.
JWT_SECRET="<run: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\">"

# Stripe (online and/or in-store — configure active provider in Admin → Payments)
STRIPE_SECRET_KEY="sk_test_..."        # sk_live_... in production
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_CURRENCY="aud"

# Square (optional — if using Square Terminal or Square online checkout)
# SQUARE_ENV="sandbox"                  # or production
# SQUARE_ACCESS_TOKEN="..."
# SQUARE_LOCATION_ID="..."
# SQUARE_CURRENCY="AUD"
# SQUARE_WEBHOOK_SIGNATURE_KEY="..."    # required for Square online orders

# Public zone (internet exposure lockdown) — must match the Cloudflare Transform Rule
PUBLIC_ZONE_SECRET="<random>"

# Thermal printers (network, port 9100)
PRINTER_FRONT_IP="192.168.1.100"
PRINTER_KITCHEN_IP="192.168.1.101"
PRINTER_PORT="9100"
```

Set up the database:

```bash
npx prisma migrate deploy   # apply migrations
npm run db:seed             # seed initial data
```

### Run

```bash
npm run dev      # development server (hot reload) — http://localhost:3000
npm run build    # production build (runs prisma generate)
npm run start    # production server (runs prisma migrate deploy first)
npm test         # node:test unit suite — money, pricing, loyalty, voucher, zone, reprice guard
```

On Windows, launchers wrap the server and Cloudflare tunnel:

| Script | Purpose |
| --- | --- |
| **`start-pos.bat`** | Production: hidden `build` + `start` + tunnel; opens Electron kiosk. Use for the live shop without NSSM. |
| **`open-pos.bat`** | Electron shell only when the app is already running as a Windows service (NSSM) |
| **`stop-pos.bat`** | Force-stop Electron, port 3000, and tunnel orphans |

Run only one server launcher at a time (they share port 3000).

### npm scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | `prisma migrate deploy && next start` |
| `npm test` | Unit suite (money/pricing/loyalty/voucher/zone/reprice) |
| `npm run db:migrate` | Create a dev migration (`prisma migrate dev`) |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run desktop:dist` | Package the Electron POS shell |

### Dev/test scripts

Live-server / sandbox smoke tests — run with `node --env-file=.env scripts/<file>`:

| Script | Purpose |
| --- | --- |
| `fake-printer.js` | Fake ESC/POS printer on TCP 9100 — test printing with no hardware (no `.env` needed) |
| `create-simulated-reader.js` | Stripe Terminal sandbox location + simulated reader |
| `test-amex-block.js` | Stripe in-person brand blocking (test mode) |
| `test-square-sandbox.js` | Direct Square API smoke test (sandbox) |
| `test-square-app-stack.js` | Square Terminal charge via `/api/terminal/*` |
| `test-square-online.js` | Square online checkout (`POST /api/orders/online`) |

---

## Deployment

Self-hosted on the shop PC: the app + local PostgreSQL run on the trusted LAN, and only customer routes (`/`, `/order`, `/onlineorder`, `/loyalty`) are exposed to the internet via a Cloudflare Tunnel. A Cloudflare Transform Rule sets the `x-dreamy-zone` header on the public hostname, which activates the strict allowlist in [`src/proxy.js`](src/proxy.js) so staff/admin routes are LAN-only. See [AGENTS.md](AGENTS.md) for the full deployment model.

Product images uploaded in Menu Management are stored under `public/uploads/products/` on disk (gitignored); production serves them via `/api/uploads/products/[filename]`.

## Documentation

- [AGENTS.md](AGENTS.md) — **the canonical technical reference**: architecture, conventions, money rules, zones, payments, deployment
- [Production Setup](docs/production-setup.md) — **start here to deploy**: the ordered zero-to-open path that sequences every doc below
- [Go-Live Checklist](docs/go-live-checklist.md) — configuration, rehearsal, and opening-day steps
- [Staff Quick Reference](docs/staff-quick-reference.md) — one-page till guide (printable)
- [iPad Till Setup](docs/ipad-till-setup.md) — the shop-side steps to put a tablet on HTTPS (the mini-PC side is already done)
- [Windows Services](docs/windows-services.md) — auto-start the app and tunnel after reboot (NSSM)
- [Uptime Monitoring](docs/uptime-monitoring.md) — external alerts when online ordering is down
- [Database & Backup](docs/database-backup.md) — nightly `pg_dump`, off-machine mirror, restore
- [Resilience Reference](docs/resilience-reference.md) — what looks after itself and what needs you: alert triage, schedules, and the changes that silently break a protection
- [Connecting a Stripe Terminal](docs/terminal-setup.md) · [Connecting a Square Terminal](docs/square-terminal-setup.md)
- [Migrating to a new PC](docs/migrate-to-new-pc.md) — moving a live shop to fresh hardware
- [CHANGELOG.md](CHANGELOG.md) — version history · [earlier entries](docs/changelog-archive.md)

## Who built this

**Ngoc Phu Anh (John) Nguyen** — full-stack developer, ACT, Australia. I build and ship production web apps end to end; this one runs a real café.

Currently looking for a graduate or junior full-stack role, with a particular interest in payments and systems integration.

- **Portfolio:** [johnnguyen-portfolio.vercel.app](https://johnnguyen-portfolio.vercel.app)
- **Email:** [phuanh20001@gmail.com](mailto:phuanh20001@gmail.com)
- **GitHub:** [@phuanh20001](https://github.com/phuanh20001)

## License

This application's own source code is proprietary — all rights reserved. See [LICENSE](LICENSE).

It is built on open-source dependencies, all under permissive licenses (MIT / Apache-2.0 / BSD / ISC). The only non-permissive runtime component is `sharp`/libvips (LGPL-3.0-or-later), which is dynamically linked and replaceable. The full license text of every production dependency is bundled in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) — ship it alongside the app if you distribute a packaged build. Regenerate it after dependency changes:

```bash
node scripts/generate-notices.js
```

Running the app privately (e.g. in your own shop) imposes no obligations; the attribution requirements apply only when redistributing the software to others.
