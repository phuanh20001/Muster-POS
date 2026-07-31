# DreamyCafe — Agent Rules

Canonical project guide for all AI coding agents (Cursor, Claude Code, Copilot, etc.).

- **Cursor** auto-loads via `.cursor/rules/dreamycafe.mdc` (`alwaysApply: true`).
- **Claude Code** loads `CLAUDE.md` by convention — that file points here.
- **Stripe payment work** — see `skills/stripe-best-practices/SKILL.md`.
- **Square payment work** — see `skills/square-best-practices/SKILL.md`.

## Agent Workflow

- **Investigate first** — read relevant code, run commands, and verify behavior before proposing or making changes. This is a real environment with shell access; do not tell the user to run steps you can run yourself.
- **Prefer the simplest solution that works** — apply YAGNI, reuse existing helpers/patterns first, then built-in platform/library features before writing new code.
- **Minimal scope** — change only what the task requires. Match existing naming, patterns, and file layout in the surrounding code.
- **No drive-by refactors** — do not rename, reformat, or "clean up" unrelated code.
- **Fix root causes, not just symptoms** — when touching shared code, check sibling call paths so one fix resolves the issue consistently.
- **No TypeScript** — JavaScript only; never add `.ts`/`.tsx` files, types, or JSDoc annotations.
- **No new dependencies** unless the task clearly needs them and the stack rules allow it.
- **No comments** unless the WHY is non-obvious.
- **Do not create markdown/docs files** unless explicitly asked (`AGENTS.md` / `CHANGELOG.md` updates are exceptions).
- **Do not commit or push** unless the user explicitly asks.
- **Record progress** — update `CHANGELOG.md` when completing meaningful work.
- **Windows host** — default shell is PowerShell; paths may use backslashes.
- **Secrets** — never commit `.env` or credentials; warn if asked to commit them.
- **Stripe changes** — consult `skills/stripe-best-practices/SKILL.md` when building or reviewing payment integrations.
- **Square changes** — consult `skills/square-best-practices/SKILL.md` when building or reviewing Square terminal, online checkout, or webhook integrations.

### Lazy senior dev

Lazy means efficient, not careless. The best code is the code never written. Before writing code, stop at the **first rung that holds** (after you understand the problem — read the task, trace the real flow end to end, then climb):

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern — don't rewrite it.
3. Does the standard library already do this?
4. Does a native platform feature cover it?
5. Does an already-installed dependency solve it?
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

- **No unrequested abstractions or boilerplate** — deletion over addition, boring over clever, fewest files possible.
- **Shortest working diff wins** only once you understand the problem; the smallest change in the wrong place is a second bug.
- **Question complex requests** — "Do you actually need X, or does Y cover it?"
- **Same-size stdlib choice** — pick the edge-case-correct option; lazy means less code, not flimsier logic.
- **Intentional shortcuts** with a known ceiling (global lock, O(n²) scan, naive heuristic) — note the ceiling and upgrade path only when non-obvious (same bar as comments above).

**Not lazy about:** understanding the problem, input validation at trust boundaries, error handling that prevents data loss, security, accessibility, real-hardware calibration (clocks drift, sensors read off), anything explicitly requested. Non-trivial logic leaves **one runnable check** — the smallest thing that fails if the logic breaks (a script/self-check; no test frameworks or fixtures). Trivial one-liners need no test.

## Project

Coffee shop POS system. Full-stack JavaScript web app, runs locally on a tablet/PC.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: JavaScript only — no TypeScript, no `.ts`/`.tsx` files
- **Database**: PostgreSQL via Prisma ORM (connection via `DATABASE_URL` in `.env`)
- **Styling**: Tailwind CSS only — no CSS modules, no styled-components
- **State**: React hooks only — no Redux, no Zustand
- **Package manager**: npm

## Code Rules

- All page/component files use `"use client"` directive (they use hooks)
- API routes (`src/app/api/**/route.js`) never use `"use client"`
- Always import Prisma from `src/lib/prisma.js` singleton — never `new PrismaClient()` inline
- All API routes wrap logic in try/catch and return `NextResponse.json()`
- No external chart libraries — use plain Tailwind div widths for bar charts
- No comments unless the WHY is non-obvious
- No TypeScript types, no JSDoc type annotations
- **No native browser dialogs** — never use `window.confirm`/`alert`/`prompt` (they render in the OS theme). All confirmations/notices must use the in-app `usePromptDialog` hook (`confirm`/`alert` + render `{dialog}`) backed by `ConfirmDialog`; any other modal/popup must be a styled in-app component (`Modal`, etc.)

## Money (Decimal — exact, never floats)

All monetary values use `decimal.js` via [src/lib/money.js](src/lib/money.js) — **never raw JS number math on money**. This is mandatory across the payment, cash, and accounting paths; floats silently drift cents and string-vs-number compares lie.

- **Compute** with `money.js` helpers (`D`, `add/sub/mul/div`, `sum`, `roundCents`, `min/max`, `neg`) — never `+ - * /`, `Math.round`, or `Math.min/max` on money.
- **Compare** with `cmp/gt/lt/gte/lte/eq` / `isZero` — never `> < >= <= === !==` on money (a stringified API value compared with an operator returns wrong results without throwing).
- **Store** in Postgres `Decimal @db.Decimal(10, 2)` and write with `toDb(x)` (Prisma accepts the numeric string). Never add a new `Float` money column. Genuinely non-money floats (e.g. `Table.x/y`) stay Float.
- **Serialize**: money crosses the API as a **string** (Decimal's JSON form). The **client must wrap incoming money with `D(...)`** before any math, comparison, or `.toFixed`.
- **Display** via `formatCurrency` (accepts Decimal | string | number). When formatting a raw API string directly, use `D(x).toFixed(2)` — never call `.toFixed`/arithmetic straight on an API money string.
- **Payment processors** (Stripe/Square) only ever receive integer minor units via `toCents(x)`.
- Non-trivial new money logic leaves a check in [test/money.test.js](test/money.test.js) (run `npm test`) — see below.

## Tests

- `npm test` runs the `node:test` unit suite in [test/](test/) (no framework dependency; the `@/` alias resolves via `test/register.mjs`). Covers the pure money/pricing/security logic: `money`, `orderTotals`, `loyalty`, `voucher`, `zone` (public-zone forgery defense), and `onlineOrderItems` (the server-side price-recompute boundary — proves a tampered client `unitPrice` is discarded).
- **Add a test here for any change to money, discount/loyalty/voucher math, the zone check, or the online price-recompute guard.** These are pure/injectable functions — no DB needed. `resolveOnlineOrderItems` takes an optional `{ loadProducts }` so it can be tested with an in-memory catalogue.
- The `scripts/test-*.js` files remain as manual, live-server/DB smoke tests (Square, reservations, public API) — run before deploy; not part of `npm test`.

## File Conventions

- Components: PascalCase filenames (e.g., `ProductCard.js`)
- Hooks: camelCase with `use` prefix (e.g., `useCart.js`)
- API routes: always named `route.js`
- Pages: always named `page.js`
- Layouts: always named `layout.js`

## Database

- Provider: PostgreSQL (local, default port 5432, database `dreamycafe`)
- Migration: `npx prisma migrate dev --name <name>`
- Seed: `npm run db:seed`
- Studio: `npm run db:studio`
- If `prisma generate` fails with EPERM on `query_engine-windows.dll.node`, a running app holds the engine DLL. On a services box that means `Stop-Service DreamyCafeApp` first (killing Node is not enough — NSSM restarts it); otherwise close the dev server / Electron shell, then re-run

## Next.js 16 Notes

- Route protection is in `src/proxy.js` (not `middleware.js` — renamed in Next.js 16)
- `cookies()` from `next/headers` is async — always `await cookies()` before calling `.get()`
- `params` in route handlers is async — always `const { id } = await params` before using it

## Offline / PWA (staff POS only)

- The staff POS is an installable PWA with **Level A offline = browse + build cart only**; there is **no offline card charging or order saving** when the shop server is unreachable (server/Stripe required — Stripe has no store-and-forward for custom integrations)
- **Level B (ISP down, local server up):** POS polls `GET /api/health` for `serverOk` + `internet`. When the shop PC and Postgres are healthy on localhost but WAN is down, **cash and cash-only split** still work; card is hidden until `internet` is true again (`usePosConnectivity`, `CheckoutModal`)
- Service worker (no deps): caches app shell + `_next/static` (cache-first w/ revalidate), **never `/api/*`**. **Source of truth is `scripts/sw.template.js`; `public/sw.js` is generated + gitignored — never hand-edit or commit it.** `scripts/bump-sw-cache.js` fills in `CACHE_VERSION` (`dc-pos-<version>-<git commit id>`, stable per commit so tablets only reload on a real deploy) and runs on `npm run dev`, `build`, **and `start`** (a `prestart` hook), so the file is present in every serve mode. Registered by `ServiceWorkerRegister` (mounted in `ConditionalNavBar`, so staff pages only, never `/`, `/loyalty`, `/order*`/`/onlineorder*`, `/privacy`)
- Offline menu data: `useMenu` caches last good `/api/categories`+`/api/products` to `localStorage` (`dc_menu_cache`) and serves it when offline (`fromCache` flag). `useCart` is already pure client-side
- `/pos` uses `usePosConnectivity` (polls `/api/health`): blocks all payment when the server is unreachable; when only WAN is down (Level B), cash and cash-only split still work and card is hidden
- `src/proxy.js` `matcher` excludes `sw.js|manifest.json|offline.html|icon.svg` so PWA files serve untouched
- **Single POS till window per device**: `usePosLock` (`src/hooks/usePosLock.js`, BroadcastChannel `dc-pos-lock`) blocks a 2nd `/pos` window in the same browser/device with a takeover lock screen. Scope is `/pos` only — Manager/Admin, Tables, Online, and other devices are never affected (it's same-device only by design)

## Windows desktop shell (shop PC)

- **Electron WebView** in `desktop/` — loads `http://127.0.0.1:3000/pos` in a locked-down window (no external navigation). With **NSSM services**: use [`open-pos.bat`](open-pos.bat) (shell-only — detects running server, no duplicate tunnel). Without services: [`start-pos.bat`](start-pos.bat) after `npm run build`.
- On start: waits for PostgreSQL; if port 3000 is not up yet, spawns `npm run start` + `cloudflared tunnel run dreamycafe`; else **shell-only mode** (NSSM). Opens POS in **frameless fullscreen (kiosk)**. Child logs → `logs/desktop.log`.
- **Close window (X)** minimizes to system tray. Tray **Close POS window** (shell-only) or **Quit DreamyCafe** (legacy) — the latter stops server + tunnel only when Electron started them. **`stop-pos.bat`** force-stops Electron, port 3000, and the dreamycafe tunnel if End Task left orphans.
- **LAN tablets** still use the installable PWA → shop PC IP — unchanged.
- Packaged `.exe` (`npm run desktop:dist` from repo root) is shell-only; set `DREAMYCAFE_ROOT` to the project folder if not dev layout. `ServiceWorkerRegister` skips registration in Electron (`window.__DREAMYCAFE_DESKTOP__` / Electron user agent).

## Role System

- Three roles: `STAFF` (clock in/out only) → `MANAGER` (manager panel, shift editing, stock quantity updates) → `ADMIN` (owner; stock add/remove, payroll report, all manager features)
- **Two separate panels, two separate URL trees** (URLs match the role — renamed from the old nested `/admin` + `/admin/owner` scheme):
  - **Manager panel = `/manager/*`** (Menu, Cash, Reservations, Loyalty, Sales, Timesheets) — the Manager panel never shows any Owner links.
  - **Admin (Owner) panel = `/admin/*`** (Payments `/admin/terminal`, Printers `/admin/printers`, Users `/admin/users`, Stock `/admin/stock`, **Payroll `/admin/payroll`**, **Reports `/admin/reports`**). Payroll and Reports are Owner pages — `GET /api/reports/payroll`, `GET /api/reports`, `GET /api/reports/accounting`, and `GET /api/reports/export` are gated by `admin_session` (or `manager_session` with ADMIN role). The Manager **Timesheets** page (`/manager/timesheets`) is Shifts-only (view/edit clock records); it no longer has a Payroll tab.
- Auth cookies (both JWT, **`httpOnly`**, signed with `JWT_SECRET` — `src/lib/auth.js` throws at startup if missing):
  - `manager_session` (1h) — the **Manager panel** session; valid for MANAGER and ADMIN. Read via `GET /api/auth/manager`, never `document.cookie`.
  - `admin_session` (**~5 min, short-lived**) — the **Admin (Owner) panel** token, minted only by an Admin PIN via `POST /api/auth/admin`, scoped+role-checked by `verifyAdminJwt`. Read via `GET /api/auth/admin`.
- **The two sessions are fully independent — neither implies the other, and `/admin/*` needs ONLY the `admin_session`** (an Admin PIN by itself grants entry, no prior Manager login required). This decoupling is what fixes the old "Admin PIN bounces back to the Manager panel" bug, which came from the Owner area being nested under the manager-gated `/admin` route.
- Route protection: `src/proxy.js` requires a valid `manager_session` (MANAGER or ADMIN) on `/manager/*` (else redirect `/pos?managerRequired=1`). It deliberately does **not** redirect `/admin/*` — the gate is client-side in `src/app/admin/layout.js`, which re-prompts the Admin PIN **in place** on a missing/expired token (cancel → `/pos`). Safe because the public zone is locked and every `/admin/*` data API is independently ADMIN-gated.
- **Navbar Manager/Admin buttons** (`src/components/shared/NavBar.js`): if a valid session cookie exists, go straight to `/manager/menu` or `/admin`; otherwise prompt for PIN. **Lock** clears both cookies and requires PIN again.
- Session contexts: `ManagerSessionContext` from `src/app/manager/layout.js` (manager session) for Manager pages; `AdminSessionContext` from `src/app/admin/layout.js` (admin session) for Admin pages. Consume with `useContext(...)` to get `{ id, name, role }`.
- Shared sidebar: `src/components/admin/Sidebar.js` takes `links` + `heading` props; each layout passes its own link set so the panels never share nav items.
- PIN modal: `ManagerPinModal` accepts optional `role` (filter user list) and `endpoint` (defaults `/api/auth/manager`; pass `/api/auth/admin` for Owner) props; no `role` = show all MANAGER + ADMIN users
- Only ACTIVE users appear in `GET /api/users/list` (used by PIN modal and clock-in) — PENDING users cannot log in

## Users

- `User.status` — `"ACTIVE"` (default) or `"PENDING"`
- Manager-created accounts are PENDING; Admin-created accounts are immediately ACTIVE
- Manager can only create STAFF or MANAGER accounts; only Admin can create ADMIN accounts
- Only Admin can approve (PATCH status → ACTIVE), decline, or delete accounts

## Stock

- `StockItem` model is independent from `Product` — tracks raw ingredients/supplies, not menu items
- `POST /api/stock-items` and `DELETE /api/stock-items/[id]` require ADMIN role
- `PATCH /api/stock-items/[id]` requires MANAGER or ADMIN role

## Order Status Flow

- The status lifecycle applies **only to ONLINE orders**: `AWAITING_PAYMENT` (pre-payment) → `PENDING` (paid, via webhook) → `PREPARING` → `READY` → `COMPLETED` (or `CANCELLED` from any state)
- **In-store (POS) orders are created `COMPLETED`** right away (`POST /api/orders`) — the shop has no kitchen/front display; the docket prints and staff make & run the order. There are no status buttons in-store. Reports/cash/sales count all non-CANCELLED orders, so this doesn't affect revenue
- Staff watch live online orders on the **`/online`** tab (`src/app/online/page.js`, polls `source=ONLINE&status=PENDING,PREPARING,READY`): **Mark Ready** → `READY`, **Collected** → `COMPLETED`. The Kitchen/Front displays and the Edit-Order feature were removed (to change an order, refund it and ring a new one)
- **New online order alert**: `OnlineOrderWatcher` (mounted app-wide in `ConditionalNavBar`, never on customer pages) polls new paid online orders and pops a modal + Web-Audio chime on the staff tablet. Staff pick a prep time → `PATCH /api/orders/[id] { prepMinutes }` saves it and sets `PREPARING`. `Order.prepMinutes` (nullable) is returned by the public track API and shown to the customer as a static "Estimated prep time: X min"
- `PATCH /api/orders/[id]` accepts `{ status }` and/or `{ prepMinutes }` (the latter also sets `PREPARING`); it no longer edits items

## Order Numbers (ticket number vs id)

- **Two numbers per order, and they are not interchangeable.** `Order.id` is the permanent autoincrement key — unique forever, never reset, used for URLs, React keys, FK joins, refund audit trails and Square reconciliation. `Order.dailyNumber` is the short reference that **restarts at 1 every trading day**, and is only unique together with `Order.businessDate` (local `YYYY-MM-DD`)
- **Who actually reads `dailyNumber`:** mostly staff. **Dockets are internal working tickets for the baristas and cooks — they are never handed to a customer**, so the docket's headline is `orderLocationLabel` (table, or the customer's name) and the number sits below it at normal size as a reference: it ties the FRONT and KITCHEN copies of one order together and matches a docket back to the POS. Do not inflate it there. The only customer-facing appearances are the **online tracking page** and a **printed receipt** — in-store customers are called by table or name, and a cash sale prints no receipt unless asked
- Never display a raw `order.id` in staff/customer UI — use `orderTicketLabel(order)` (→ `#12`, falls back to `#<id>` when unnumbered) or `orderTicketWithId(order)` (→ `#12 · id 1487`) from `src/lib/formatters.js`. **Admin/history/refund views must use the `WithId` variant**: a ticket number repeats daily, so it is ambiguous on its own outside "today"
- Numbers come from `nextDailyNumber(client)` (`src/lib/orderNumber.js`) — one atomic `INSERT .. ON CONFLICT DO UPDATE .. RETURNING` against `OrderDayCounter`. **Never assign with `SELECT max(dailyNumber) + 1`**: two tills checking out together would read the same value and hand two orders the same number. Known ceiling: concurrent checkouts **serialise on the day's counter row** (measured ~60ms apart at 8-way concurrency) — fine at two tills, worth revisiting if this shop ever runs many at once
- **POS** (`POST /api/orders`) draws the number **inside the same transaction** as the insert, so a rejected order releases it and the day's sequence stays gapless. **Online** orders draw it in `fulfillPaidOrder` (`src/lib/fulfillment.js`) **at payment, not at checkout creation** — an abandoned checkout must not burn a number, and the ticket should be dated by the day it is actually made. Assignment there is deliberately non-fatal (logged, not thrown): an unnumbered docket still prints under its id, which beats losing the customer's stamps
- **`AWAITING_PAYMENT` online orders have no ticket number** — anything shown before payment (e.g. the Stripe/Square `paymentNote` in `src/lib/onlineCheckout.js`) must use the id
- **Grouping orders by trading day must happen in JS via `localDayKey`, never in SQL.** `createdAt` is stored in UTC, so a `createdAt::date` `GROUP BY` files every order made after 10am AEST under the following day. This is why `prisma/backfill-daily-numbers.js` is a Node script rather than one `UPDATE`

## Public / Private Zones

- Deployment model: staff POS + admin run on the trusted shop **LAN**; only customer routes are exposed to the internet through a tunnel (e.g. Cloudflare Tunnel)
- `isPublicZone(request)` (`src/lib/zone.js`) — true when header `x-dreamy-zone` equals `PUBLIC_ZONE_SECRET`. The tunnel/edge must **SET** that header on the public hostname (so it can't be forged/stripped). Unset secret = everything treated as LAN (dev)
- `src/proxy.js` enforces a strict allowlist for the public zone — public pages: `/` (storefront homepage), `/order*`, `/onlineorder*`, `/loyalty`; blocked paths redirect to `/`. Public APIs: `GET` menu (`/api/products`, `/api/categories`), `GET /api/health` (uptime monitor), `GET /api/customers` (phone loyalty lookup, rate-limited), `POST/GET /api/orders/online`, `GET /api/orders/track/[id]`, `GET /api/orders/lookup` (order recovery by phone), `POST /api/webhooks/stripe`, `POST /api/webhooks/square`, `POST /api/vouchers/validate`. Everything else is LAN-only. Staff counter lookup is **`/pos/loyalty`**; customer registration is LAN-only (`POST /api/customers`) or created on first paid online order.
- **Never trust client-supplied prices, discounts, or loyalty stamp counts on a public path** — always recompute server-side
- **The customer menu (`/order`) is intentionally edge-cacheable — do NOT add `cache: 'no-store'` to `usePublicMenu`.** `GET /api/products` + `/api/categories` send `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` so Cloudflare can absorb menu traffic on the single shop PC; `usePublicMenu` fetches without `no-store` by design. A customer may briefly (~60s) see a stale price/name/availability after a manager edit — this is **display-only and safe**: `POST /api/orders/online` re-resolves every `unitPrice` from the live DB in `resolveOnlineOrderItems` (client sends only ids/qty/size, never prices), so the amount charged via Stripe/Square is always the current price, never the stale one shown. The **staff POS** (`useMenu`) is different — it DOES use `no-store` (+ a visible-poll refresh) because staff must see edits immediately to ring orders correctly.
- Customer-facing tracking must use `GET /api/orders/track/[token]` (safe projection), never `/api/orders/[id]` (full order + PATCH). The `[token]` path segment is the order's unguessable `trackingToken` (UUID, minted on online order creation) — **never** the sequential id — so orders can't be enumerated. The route returns a parsed `pickupName` only; it must never return the raw `note` (which contains the customer's phone)
- **Order recovery**: if a customer closes the tracking tab, the track pages save the link to `localStorage` (`dc_last_order`, cleared on COMPLETED/CANCELLED) for a one-tap "Track my recent order"; cross-device, `GET /api/orders/lookup?phone=` (rate-limited, returns only the `trackingToken`+status of the caller's most recent **active** online order) backs "Find my order by phone" on `/order` + `/onlineorder`
- Rate limiting: `src/lib/ratelimit.js` (in-memory) on public customer lookup/register and voucher validation

## Live Deployment (as of 2026-06-11)

- **Self-hosted on the shop PC** (not Railway). App + local PostgreSQL run on the LAN; data lives only on this machine (no managed backups — `pg_dump` recommended)
- Public hostname **`dreamy-cafe.com`** → Cloudflare Tunnel `dreamycafe` → `http://localhost:3000`. Marketing **`www.dreamy-cafe.com`** → Cloudflare Pages ([`docs/marketing-pages.md`](docs/marketing-pages.md)). Tunnel config at `C:\path\to\.cloudflared\config.yml`
- A Cloudflare **Transform Rule** SETs `x-dreamy-zone` = `PUBLIC_ZONE_SECRET` (in `.env`) on **`Hostname equals dreamy-cafe.com`**
- Launcher: `start-pos.bat` (prod build+start) starts the server **and** `cloudflared tunnel run dreamycafe`. It no longer auto-opens a browser — the POS is opened from the installed PWA app icon. Use the launcher OR a `cloudflared` Windows service, **never both**: a second host running the same named tunnel becomes a Cloudflare **replica** and real customer traffic is split across them
- For day-to-day dev use `npm run dev` — **no tunnel**. The tunnel is not needed to exercise the public zone: `isPublicZone()` ([src/lib/zone.js](src/lib/zone.js)) only checks that `x-dreamy-zone` equals `PUBLIC_ZONE_SECRET`, so set both and send the header. If you genuinely need a real edge hostname, use a throwaway quick tunnel (`cloudflared tunnel --url http://localhost:3000`), never the production `dreamycafe` one
- Stripe webhook → `https://dreamy-cafe.com/api/webhooks/stripe` (when provider is Stripe)
- Square webhook → `https://dreamy-cafe.com/api/webhooks/square` (when provider is Square)
- **Active provider is Square on both channels**, so the **Square webhook is the live fulfillment path** (`SQUARE_WEBHOOK_SIGNATURE_KEY` in `.env`); `SQUARE_ENV=production`. Keep the Square payment link / webhook configured in the Square dashboard.

## Payment Terminal (in-person card)

- Stripe Terminal, **server-driven** smart reader (S700 / WisePOS E). The server creates a `card_present` PaymentIntent and calls `processPaymentIntent` on the reader; card data never touches the app
- Helpers in `src/lib/terminal.js`; reader id resolved from `TerminalReader` config (name `COUNTER`) or `STRIPE_TERMINAL_READER_ID`. Configure at `/admin/terminal`. Setup guides: `docs/terminal-setup.md` (Stripe), `docs/square-terminal-setup.md` (Square)
- Routes: `POST /api/terminal/charge`, `GET /api/terminal/status`, `POST /api/terminal/cancel`, `GET/POST /api/terminal/readers` (all LAN-only via zone proxy)
- POS flow: `CheckoutModal` "Card" path calls charge → polls status → creates order only on success with `Order.paymentIntentId`. `POST /api/orders` re-verifies the PaymentIntent server-side before recording paid
- Test mode (`sk_test...`): the charge route auto-simulates the card tap via `stripe.testHelpers.terminal.readers.presentPaymentMethod`
- Refunds: `POST /api/orders/[id]/refund` issues a real Stripe refund when `paymentIntentId` is set. It also **adjusts the cash drawer** when cash was involved: in the same transaction as the `REFUNDED` status update it logs a `CashMovement` `type:'OUT'` (note `Refund order #N`) against the open `CashSession` — full `total` for `CASH`, the cashier-supplied `cashReturned` (0..total) for `SPLIT`, nothing for `CARD`/online. Don't also exclude `REFUNDED` from the cash-sales sum in `api/cash/*` — the OUT movement already nets it out, so doing both would double-deduct
- **Split-payment card legs are terminal-integrated**: each `CARD` leg charges the reader for its share (incl. surcharge) via the shared `runTerminalCharge` helper, with brand blocking enforced per leg. The order stores all card-leg PaymentIntents **comma-joined** in `Order.paymentIntentId`; `POST /api/orders` verification and `POST /api/orders/[id]/refund` both split on `,` and process each. If no reader is configured, card legs fall back to manual recording (surcharge still applied)
- **Split bill has two modes** (`CheckoutModal`, Lightspeed-style, tab locked after the first leg): **Split by price** (cashier enters any amount per leg, with `÷2/÷3/÷4`/Remaining shortcuts) and **Split by product** (cashier taps line items into each leg). Each leg is a `SplitLegStep` collecting cash or card independently. Product-split line amounts are each line's proportional share of `grandTotal` (order-level surcharge/discount/tip/loyalty spread across lines; last leg absorbs rounding). The order records only the aggregate, not the per-leg breakdown
- **Manual capture for brand enforcement**: `/api/terminal/charge` creates the PaymentIntent with `capture_method: 'manual'`. After the reader authorizes (PI → `requires_capture`), the POS calls `POST /api/terminal/finalize`, which reads `latest_charge.payment_method_details.card_present.brand`, **voids** the hold if the brand is blocked, else **captures**. Order is created only after a successful capture

## Payment Providers (Stripe / Square — in-store and online)

- Card charging uses **two independent settings** on `PaymentSettings`: `provider` (in-store terminal / POS card) and `onlineProvider` (customer `/order` checkout). Both default to `SQUARE`; switch either at Admin → Payments.
- **This deployment runs Square on BOTH channels** (in-store and online). Stripe adapters remain in the code and stay usable via the Admin → Payments switch, but Square is the configured processor for in-person Terminal charges and `/order` online checkout. Consequences: brand blocking is **inactive** (Square supports none — see below), and the live online checkout links are real Square payment links (`SQUARE_ENV=production`), not test.
- **In-person:** `/api/terminal/*` and `POST /api/orders` card verification use `getInPersonProviderName()`.
- **Online:** `POST /api/orders/online` uses `getOnlineProviderName()` via [`src/lib/onlineCheckout.js`](src/lib/onlineCheckout.js). Fulfillment: `POST /api/webhooks/stripe` or `POST /api/webhooks/square` → [`src/lib/fulfillment.js`](src/lib/fulfillment.js).
- `Order.paymentProvider` is stamped at order creation so refunds always route to the processor that took that order.
- **Brand blocking** applies only on channels where Stripe is active. Square does not support brand blocking on any channel.
- The `/admin/terminal` $1 test-charge exercises the **in-store** provider

## Card Surcharge & Brand Blocking

- `PaymentSettings` model (singleton id=1): `cardSurchargeType` (`PERCENT`|`FIXED`), `cardSurchargeValue`, `blockedBrands` (canonical keys `visa`/`mastercard`/`amex`/`discover`). Helpers + brand mapping in `src/lib/paymentSettings.js`
- `GET /api/payment-settings` is LAN-readable (POS needs the surcharge); `PATCH` is ADMIN-only. Configure at `/admin/terminal` (the combined **Payments** tab — reader + surcharge + blocked brands)
- `GET /api/payment-settings/public` returns **only** `{ cardSurchargeType, cardSurchargeValue }` (no blocked brands, no auth) and is whitelisted in `src/proxy.js` for the public zone — it's how the customer `/order` page shows the surcharge breakdown before redirecting to checkout. Display-only; the authoritative amount is still recomputed server-side in `orders/online`
- Dev test: `node --env-file=.env scripts/test-amex-block.js` exercises the in-person brand block by presenting an Amex `card_present` test card (the normal charge route only taps Visa) and asserting `/api/terminal/finalize` voids it
- **Flat surcharge** applies to any card payment (not cash), both channels. POS auto-fills the surcharge fields on the Card path; online adds it as a server-computed line item (online is always card)
- **Brand blocking**: Stripe only — online uses `brands_blocked` on Checkout; in person via manual-capture + `/api/terminal/finalize`. Square does not support brand blocking on any channel.

## Tables / Floor Plan

- **Two mutually exclusive modes**, switched by `FeatureSettings.manualTableNumbers` (Admin → Settings → Table Numbers; default **false** = floor plan). **Typed mode** = the cashier types the number of the stand handed to the customer: no `Table` row, no occupancy, no `/api/tables` fetch, and the **Tables** tab is hidden from `BottomNav`. `tableNumberMax` (default 20) sets how many quick-pick buttons `CheckoutModal` renders. The rest of this section applies to **floor-plan mode only**
- **`Order.tableNumber` is overloaded — always read it with its two companions.** With `tableId` → a floor-plan table; with `tableManual: true` → a typed table number; with **neither** → the **customer's name**. Label it via `orderLocationLabel` (`src/lib/formatters.js`), never bare. Any `select` on Order that pulls `tableNumber` must also pull `tableId` **and** `tableManual`, or a typed number silently renders as a customer name (this bit `listFailedDockets`)
- `POST /api/orders` decides the mode **server-side** (re-reads the setting): it nulls a client `tableId` in typed mode and ignores a client `tableManual` in floor-plan mode — never trust the POS tab, which may be stale after a toggle
- `Table.groupId` (nullable UUID) — grouped tables move together on the floor plan and **share occupancy** (one party): always change table status via `setTableStatus(tableId, status)` from `src/lib/tables.js`, never `Table.status` directly
- Group/ungroup via `POST/DELETE /api/tables/group`; grouping into an existing group reuses its `groupId`, and a group occupied anywhere occupies all members
- On grouping, members auto-reflow into a single edge-to-edge **horizontal row** (`rowLayout` in `src/app/tables/page.js`, anchored at the leftmost member, clamped to the floor) so grouped circles never overlap; new positions are saved via `PATCH /api/tables/[id]`
- `DELETE /api/tables/[id]` requires MANAGER/ADMIN (the Tables page falls back to `ManagerPinModal`); deleting a member of a 2-table group dissolves the group
- Floor drag uses Pointer Events with a ~6px tap/drag threshold and is gated behind the page's Edit Layout toggle; dropping near another table (~120px) prompts to group

## Printing & Admin Layout

- Printing helpers in `src/lib/printer.js`. **FRONT/KITCHEN auto-print operational dockets only** (items/mods/notes, order #, table, cashier) — `buildLines` deliberately omits prices/totals/payment to save paper. The **receipt** is separate and on-demand: `buildReceiptLines` + `printReceipt` (full breakdown), triggered by `POST /api/orders/[id]/receipt`; reprint dockets via `POST /api/orders/[id]/reprint`
- `printReceipt` sends to whichever `PrinterConfig` has `printReceipts: true` (fallback FRONT). Order-detail modals expose **"Reprint Docket"** and **"Print Receipt"** ([OrderHistoryTable.js](src/components/admin/reports/OrderHistoryTable.js), [SalesOrderDetailModal.js](src/components/admin/sales/SalesOrderDetailModal.js))
- Manager **Sales** tab (`/manager/sales`) has **History** + **Online Orders** sub-tabs (`?tab=history|online`). **Reports** (accounting, GST, CSV export) live on the Owner panel at **`/admin/reports`**. View bodies live in `components/admin/{sales,reports,online}/*View.js` (the `components/admin/*` folder name predates the route rename and is unchanged)

## Loyalty & Vouchers

- Loyalty: buy 9, get 10th free; only `Product.loyaltyEnabled` items earn a stamp. Online orders accrue stamps **server-side in `fulfillPaidOrder`** on confirmed payment (POS still computes client-side, LAN-trusted)
- `Voucher` model: `type` = `PERCENT` | `FIXED` | `FREE_ITEM`; validated via `evaluateVoucher` (`src/lib/voucher.js`, which also exports `parseVoucherInput` for the admin create/edit routes — `PERCENT` capped at 100, `FREE_ITEM` value forced to 0). Online checkout applies it server-side (Stripe coupon or Square order discount); `timesUsed` is claimed atomically at order creation (reserved online, incremented directly in `POST /api/orders` for POS) and released on failure. The whole feature is gated by **`FeatureSettings.vouchersEnabled`** (default off): the admin **Vouchers** page (`/admin/vouchers`, ADMIN-gated CRUD via `/api/vouchers`), the customer promo-code field on `/order`, and every server path (`/api/vouchers/validate`, the `voucherCode` branch of `POST /api/orders/online` and `POST /api/orders`) hard-reject when it's off. `vouchersEnabled` rides on the public `/api/payment-settings/public` so the customer page can show/hide the field. A voucher covering 100% of an online order (`total` = $0) skips the payment processor and is fulfilled directly (Stripe/Square reject $0). The **POS checkout UI field is not built yet** — the server accepts a `voucherCode` but no POS component sends one.

## Changelog

All progress and issues must be recorded in `CHANGELOG.md`.
