# DreamyCafe — Deployment Guide

This describes the **production deployment model**: the staff POS + admin run on
the trusted shop LAN, and only customer routes are exposed to the internet
through a Cloudflare Tunnel. See `AGENTS.md` → "Public / Private Zones" for the
app-side enforcement.

```
                    Internet (customers)
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────▼─────────┐         ┌───────────▼──────────┐
    │ Cloudflare Pages   │         │ Cloudflare Tunnel     │
    │ www.dreamy-cafe.com│         │ dreamy-cafe.com       │
    │ (static marketing) │         │ + Transform Rule      │
    └────────────────────┘         └───────────┬──────────┘
                                               │ → localhost:3000
        ┌─────────────────── shop LAN ─────────┴──────────┐
        │  Host PC: Next.js + Postgres + cloudflared       │
        │   ├── (eth) FRONT printer   [.50]                │
        │   ├── (eth) KITCHEN printer [.51]                  │
        │   └── (wifi) Tablet → http://192.168.x.10:3000   │
        └──────────────────────────────────────────────────┘
```

**Marketing** on **`www.dreamy-cafe.com`** (Pages) — see [docs/marketing-pages.md](docs/marketing-pages.md).
**Ordering** at **`https://dreamy-cafe.com/order`** via the tunnel (apex unchanged).

The public zone only activates when Cloudflare SETs the `x-dreamy-zone` header on
**`dreamy-cafe.com`**. Until then nothing is exposed and the LAN POS works normally.

---

## 1. Host PC (the shop server)

1. Wire the PC to the router via **ethernet** and give it a **static IP** (or a
   DHCP reservation), e.g. `192.168.1.10`.
2. **Set the machine timezone to the shop's local timezone** (e.g. `Australia/Sydney`).
   The app derives "today" for all day-boundary reports (today's sales, Z-report,
   daily breakdowns) from the server clock, so a box left on **UTC** — the default on
   most cloud/Linux hosts — reports the wrong business day during evening/overnight
   trade. The NSSM App service also pins `TZ=Australia/Sydney` as a belt-and-braces
   guard (`scripts/install-windows-services.ps1`); update that value if the shop is in
   a different timezone.
3. Install Node.js (LTS), PostgreSQL, and the project. Set `.env`:
   ```
   DATABASE_URL=postgresql://USER:PASS@localhost:5432/dreamycafe
   JWT_SECRET=<long-random-string>
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...        # filled in step 4
   STRIPE_CURRENCY=aud
   PRINTER_FRONT_IP=192.168.1.50
   PRINTER_KITCHEN_IP=192.168.1.51
   PUBLIC_ZONE_SECRET=<long-random-string>   # must match the Transform Rule in step 3
   ```
   Generate secrets, e.g. (PowerShell):
   ```powershell
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
   ```
4. Build + run:
   ```powershell
   npx prisma migrate deploy
   npm run build
   npm run start          # serves on http://localhost:3000
   ```
   Or use **`start-pos.bat`** — builds, then opens the **DreamyCafe desktop app** (Electron), which starts the server, Cloudflare tunnel, and POS window automatically.
5. Staff browse to `http://192.168.1.10:3000` on **LAN tablets** (PWA). The **shop PC till** uses the desktop app. Verify a test print from
   **Admin → Printers** (see §5).

> **Desktop app:** first run installs Electron deps in `desktop/` (`npm install`). Close the POS window to minimize to tray — server and tunnel keep running. Use tray → **Quit DreamyCafe** to stop everything, or run **`stop-pos.bat`** if processes are stuck after End Task. Logs: `logs/desktop.log`. Packaged installer: `npm run desktop:dist` (shell only — set `DREAMYCAFE_ROOT` to the project path if installed elsewhere).

> Auto-start: run `npm run start` and `cloudflared` as Windows services (e.g. via
> NSSM) so a reboot fully recovers the system — or pin `start-pos.bat` / the desktop shortcut to Startup.

---

## 2. Printers

- Connect both printers by **ethernet** and give each a **static IP / DHCP
  reservation** matching `.env` (`192.168.1.50`, `.51`).
- Print a printer self-test to confirm its IP, then enter it in
  **Admin → Printers** (or the env vars above).
- They must speak **ESC/POS over raw TCP port 9100**. Epson TM-series work out of
  the box; **Star** printers may need to be switched to ESC/POS mode.

---

## 3. Cloudflare Transform Rule (marks public traffic) — do this BEFORE the tunnel

This is what makes the public/private split secure. It stamps every internet
request with the secret so the app knows it's public; LAN requests never get it.

1. Cloudflare dashboard → your domain → **Rules → Transform Rules → Modify
   Request Header → Create rule**.
2. **When incoming requests match:** `Hostname equals dreamy-cafe.com`
3. **Then → Set static:**
   - Header name: `x-dreamy-zone`
   - Value: the same string as `PUBLIC_ZONE_SECRET`.
4. Use **Set** (not *Add*) so any client-supplied `x-dreamy-zone` is overwritten
   — a visitor cannot forge or strip it.
5. Deploy the rule.

> Why this matters: the app treats a request as LAN (full access) when the header
> is absent. If you set `PUBLIC_ZONE_SECRET` but forget this rule, internet
> traffic would be treated as LAN. **Configure both together.**

---

## 4. Cloudflare Tunnel

Run on the **host PC** so the tunnel reaches `localhost:3000`.

1. Install `cloudflared` and authenticate:
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create dreamycafe
   ```
2. Map the public hostname to the local app. Create
   `C:\Users\<you>\.cloudflared\config.yml`:
   ```yaml
   tunnel: <TUNNEL-ID-from-create>
   credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-ID>.json

   ingress:
     - hostname: dreamy-cafe.com
       service: http://localhost:3000
     - service: http_status:404
   ```

   > **Hostname is the domain only** — do not use `dreamy-cafe.com/order`. Paths like `/order`
   > are handled by the app after the tunnel forwards to `localhost:3000`. Run
   > `cloudflared tunnel ingress validate` after edits.
3. Route DNS and run:
   ```powershell
   cloudflared tunnel route dns dreamycafe dreamy-cafe.com
   cloudflared tunnel run dreamycafe
   ```
4. Visit `https://dreamy-cafe.com/order` — it should load. Visit
   `https://dreamy-cafe.com/admin` or `/pos` — it should redirect to `/order`
   (proof the staff zone is hidden from the internet).

> Defense-in-depth (optional): the `ingress` block can also be path-scoped, but
> the app's `proxy.js` allowlist is the authoritative control.

---

## 5. Payment webhooks (online orders)

Online checkout uses **`onlineProvider`**; the in-store terminal uses **`provider`**. Configure the matching webhook for each channel you use (both can stay registered).

### Stripe (when provider = Stripe)

1. Stripe dashboard → **Developers → Webhooks → Add endpoint**:
   `https://dreamy-cafe.com/api/webhooks/stripe`
2. Subscribe to **`checkout.session.completed`**.
3. Copy the signing secret into `.env` as `STRIPE_WEBHOOK_SECRET`, restart the app.
4. Place a test online order and confirm: payment → order `PENDING` → kitchen docket prints.

### Square (when provider = Square)

1. Square Developer Dashboard → your app → **Webhooks → Add subscription**:
   `https://dreamy-cafe.com/api/webhooks/square`
2. Subscribe to **`payment.updated`**.
3. Copy the **signature key** into `.env` as `SQUARE_WEBHOOK_SIGNATURE_KEY`, restart the app.
4. Ensure `SQUARE_ENV=production`, `SQUARE_ACCESS_TOKEN`, and `SQUARE_LOCATION_ID` are set.
5. Place a test online order on `https://dreamy-cafe.com/order` → pay → confirm docket + chime.

### Cutover notes

- **Disable the inactive provider's online webhook** after switching — e.g. when moving online to Square, remove or unsubscribe `checkout.session.completed` on the Stripe endpoint (no new Stripe Checkout sessions will be created).
- Keep Stripe keys and webhook if you still use **Stripe Terminal** in person with Square online only.
- Historical orders refund through `Order.paymentProvider` — do not remove Stripe until all Stripe-paid orders are closed/refunded.

---

## 6. Payment terminal (Stripe Terminal, in-person card)

The POS drives a Stripe Terminal **smart reader** server-side. The reader keeps
its own connection to Stripe; the host server creates a PaymentIntent and tells
the reader to process it — card data never touches the app.

1. Buy a supported reader — **Stripe Reader S700** or **BBPOS WisePOS E**.
2. In the Stripe dashboard, create a **Terminal Location** and register the reader
   to it (follow the on-reader pairing code). Note its reader id (`tmr_...`).
3. (Optional) set `STRIPE_TERMINAL_READER_ID=tmr_...` in `.env` as a fallback.
4. In the app: **Admin → Payment Terminal**, paste the Stripe Reader ID (the
   dropdown lists readers found in your Stripe account), enable it, **Save**, then
   **Test charge $1.00**.
5. At the register, "💳 Card" now routes through the reader; the order is only
   created once payment succeeds.

**Test mode:** with `sk_test...` keys, create a simulated reader in Stripe
(`device_type: simulated-wpe`); the charge route auto-simulates the tap so you can
exercise the full flow without hardware.

> Requires internet (the reader and server both reach Stripe). If the connection
> drops, card charging fails — fall back to cash. Card **refunds** are issued via
> Stripe automatically from **Admin → Sales → refund** when the order was paid by
> card.

---

## 7. Verification checklist

- [ ] `https://dreamy-cafe.com/order` loads; `/loyalty` loads.
- [ ] `https://www.dreamy-cafe.com/` loads from **Cloudflare Pages** even when the tunnel is stopped.
- [ ] `https://dreamy-cafe.com/admin`, `/pos`, `/orders` all redirect to `/order`.
- [ ] `https://dreamy-cafe.com/api/orders` (GET) returns 404 from the internet.
- [ ] On the LAN, `http://192.168.1.10:3000/pos` and `/admin` work normally.
- [ ] Test print succeeds from Admin → Printers.
- [ ] Online order: pays → prints in kitchen → stamp accrues.
- [ ] (If used) a voucher code applies the discount at Stripe checkout.

---

## 8. Operational notes

- **No UPS** — deliberately decided against: in a power cut the espresso machine,
  grinder, fridge and Wi-Fi are down too, so the shop closes regardless. The free
  stand-in is leaving Windows **write-cache buffer flushing enabled** on the system
  drive, which is what keeps a hard power cut survivable for Postgres — see
  [database-backup.md](docs/database-backup.md#decision-no-ups-deliberate--dont-re-raise-it).
- **Online ordering depends on the host PC + internet being up.** The in-shop POS
  keeps working on the LAN regardless.
- **Backups:** see [docs/database-backup.md](docs/database-backup.md) (nightly task +
  Google Drive mirror).
- **Auto-start on reboot:** see [docs/windows-services.md](docs/windows-services.md)
  (NSSM services — use this *or* `start-pos.bat`, never both). One-shot install:
  `powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1` (Administrator).
- **LAN TLS (encrypt the tills):** see [docs/lan-tls.md](docs/lan-tls.md) — a Caddy
  reverse proxy terminates HTTPS on the LAN so tablet ↔ mini-PC traffic isn't
  plaintext. One-shot install:
  `powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1` (Administrator).
- **Uptime alerts:** see [docs/uptime-monitoring.md](docs/uptime-monitoring.md) — monitor
  `https://dreamy-cafe.com/api/health` via UptimeRobot (free).
- **Go-live:** [docs/go-live-checklist.md](docs/go-live-checklist.md) and
  [docs/staff-quick-reference.md](docs/staff-quick-reference.md) (print for the till).
- **Rotating the secret:** update `PUBLIC_ZONE_SECRET` in `.env` and the Transform
  Rule value together, then restart the app.
