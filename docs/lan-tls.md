# LAN TLS — Encrypt the Wi‑Fi Tills

> **What this is.** Today the iPad tills reach the POS over **plaintext HTTP**
> (`http://192.168.1.10:3000`). Anyone who gets onto the shop Wi‑Fi could sniff
> session cookies, PINs, and order data off the air. This guide puts **HTTPS** in
> front of the tills using **Caddy** as a reverse proxy, so the tablet ↔ mini‑PC
> hop is encrypted. Network segregation is still the primary control — this is
> defence-in-depth that closes the sniffing gap.

```
   iPad tills (Wi‑Fi)                     mini-PC
   ┌──────────────┐   HTTPS :443    ┌──────────────────────────────┐
   │ Safari / PWA │ ───────────────▶│ Caddy  ──(loopback)──▶ Next  │
   │ https://IP   │                 │        127.0.0.1:3000        │
   └──────────────┘                 └──────────────────────────────┘
   Till PC kiosk (Electron) stays on http://127.0.0.1:3000 — loopback, unsniffable.
   Customers (internet) are unchanged: cloudflared → localhost:3000, TLS at the CF edge.
```

- **Certs:** Caddy's own **internal CA** (`tls internal`) — fully offline, no
  internet needed to issue or renew. One-time: trust Caddy's root CA on each iPad.
- **Addressing:** the cert covers **two** names, and this is deliberate insurance.
  A cert issued only for an IP is **pinned** to that IP, so if the address ever has
  to move — wrong DHCP pool at the shop, a router swap — every tablet throws a
  certificate error and each one needs its root re-trusted by hand. With the mDNS
  hostname on the cert too, the tablets follow the machine and the fix is one
  setting. **Bookmark the hostname; the IP is the fallback**, which is the reverse
  of the usual advice and correct here because the IP is what's most likely to change.
  - **`https://dreamy-cafe.local`** ← use this on the tablets
  - **`https://192.168.0.10`** ← fallback if mDNS misbehaves
- The **public zone (customers) is untouched** — it does not go through Caddy.

> **As built on `DREAMY-CAFE`, 2026-07-30:** static IP `192.168.0.10/24`, gateway and
> DNS `192.168.0.1`, hostname `dreamy-cafe.local`. Both names chain-verified `200` on
> `/api/health`. Installed with:
> ```powershell
> scripts\install-caddy-service.ps1 -LanHost 192.168.0.10 -LanName dreamy-cafe.local
> ```
> ⚠ The `192.168.1.10` seen throughout the rest of this guide is the **old generic
> placeholder** from DEPLOY.md, not this shop's address.

---

## Prerequisites

- DreamyCafe already deployed with the NSSM services (`DreamyCafeApp`,
  `DreamyCafeTunnel`) — see [windows-services.md](windows-services.md). This adds
  a third service, `DreamyCafeCaddy`.
- The mini‑PC has a **static LAN IP / DHCP reservation** (DEPLOY.md §1).
- **Administrator** PowerShell.

> If your host IP is not `192.168.1.10`, pass it to the installer with
> `-LanHost <your-ip>` (below) and use that IP everywhere in this guide.

---

## Quick install (recommended)

From an **Administrator** PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1
# or, if the host IP differs:
powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1 -LanHost 192.168.1.20
```

The script:

1. Ensures `caddy.exe` (winget, or a pinned download into `tools\caddy\`).
2. Validates the `Caddyfile` and registers the **`DreamyCafeCaddy`** NSSM service
   (auto-start, restart-on-crash, depends on `DreamyCafeApp`).
3. Adds firewall rules: **allow 443 + 80**, **block 3000** to the LAN (loopback
   is unaffected, so the kiosk/Caddy/cloudflared keep working).
4. Exports Caddy's root CA to **`caddy-root-ca.crt`** in the project folder for
   the next step, and does an end-to-end `https://<ip>/api/health` check.

Then do [Step B](#step-b--trust-the-root-ca-on-each-ipad) and
[Step C](#step-c--enable-secure-cookies) below.

---

## Manual steps (equivalent to the script)

### Step A — service + firewall

1. Install Caddy (`winget install Caddy.Caddy`, or download the Windows amd64
   build from <https://caddyserver.com/download>).
2. The [`Caddyfile`](../Caddyfile) at the repo root already terminates TLS for
   `https://{$POS_LAN_HOST:192.168.1.10}` and proxies to `127.0.0.1:3000`. Confirm:
   ```powershell
   caddy validate --config Caddyfile --adapter caddyfile
   ```
3. Register the service (adjust paths):
   ```powershell
   $nssm = "$PWD\tools\nssm\nssm.exe"
   $caddy = (Get-Command caddy).Source
   & $nssm install DreamyCafeCaddy $caddy run --config "$PWD\Caddyfile" --adapter caddyfile
   & $nssm set DreamyCafeCaddy AppDirectory $PWD
   & $nssm set DreamyCafeCaddy AppEnvironmentExtra "POS_LAN_HOST=192.168.1.10"
   & $nssm set DreamyCafeCaddy Start SERVICE_AUTO_START
   & $nssm set DreamyCafeCaddy DependOnService DreamyCafeApp
   & $nssm set DreamyCafeCaddy AppExit Default Restart
   Start-Service DreamyCafeCaddy
   ```
4. Firewall:
   ```powershell
   New-NetFirewallRule -DisplayName "DreamyCafe HTTPS (443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   New-NetFirewallRule -DisplayName "DreamyCafe HTTP redirect (80)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   New-NetFirewallRule -DisplayName "DreamyCafe block direct 3000 (use TLS)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Block
   ```

### Step B — trust the root CA on each iPad

Caddy's internal CA is self-signed, so each iPad must trust its **root** once (a
one-time, ~1-minute step per tablet). The root file is `caddy-root-ca.crt` (the
installer copies it to the project folder; otherwise it lives under
`C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\pki\authorities\local\root.crt`).

On **each iPad**:

1. Get `caddy-root-ca.crt` onto the iPad — AirDrop, email it to a shop address, or
   put it somewhere the iPad can download once.
2. Open the file → iOS says **Profile Downloaded**. Go to
   **Settings → General → VPN & Device Management → DreamyCafe/Caddy profile → Install**.
3. **Crucial second toggle:** **Settings → General → About → Certificate Trust
   Settings** → turn **ON** full trust for the Caddy root. Without this, Safari
   still shows "Not Secure".
4. Change the POS bookmark / home-screen link from `http://192.168.1.10:3000` to
   **`https://192.168.1.10`**. Confirm the padlock shows and `/pos` loads.

> 🔴 **CORRECTION 2026-07-30 — the mini-PC is _not_ trusted automatically.** This
> guide used to say Caddy installs its own root into the machine store when it runs
> as the SYSTEM service. It **tries and fails**, and says so only in its stderr log:
>
> ```
> pki.ca.local  "failed to install root certificate"
>               error="add cert failed: Failed adding cert: The request is not supported."
> ```
>
> That is Caddy's trust-store install not working when it runs as a Windows
> **service** under SYSTEM. The gap is silent in the worst way: `curl -k` returns
> **200** and looks like success, while `curl` without `-k` and every .NET client
> fail chain validation — so any smoke test that skips verification passes either
> way. `scripts\install-caddy-service.ps1` now imports the root into
> `Cert:\LocalMachine\Root` itself (idempotently) and verifies **without** `-k`,
> so this cannot regress unnoticed. Nothing about the **iPad** steps changes.

### Step C — enable Secure cookies

Once **every** tablet is on `https://` (Step B done on all of them), make the
session cookies `Secure` so they are never sent over plaintext:

1. Add to `.env`:
   ```
   SESSION_COOKIE_SECURE=1
   ```
2. `Restart-Service DreamyCafeApp`.
3. Re-log in on an iPad **and** on the till kiosk to confirm both still work.

> **Order matters.** A `Secure` cookie is dropped by the browser on any
> still-plaintext `http://<IP>` tablet, so enabling this before a tablet is moved
> to HTTPS makes login silently fail there. The till kiosk (loopback) and the
> public tunnel (already HTTPS) are unaffected. To roll back, set
> `SESSION_COOKIE_SECURE=0` and restart the app.

---

## Verification

- [ ] `Get-Service DreamyCafeApp, DreamyCafeCaddy, DreamyCafeTunnel` — all Running.
- [ ] From an iPad: `https://192.168.1.10/pos` loads with a valid padlock; login
      works; a test sale rings through.
- [ ] `http://192.168.1.10:3000/pos` from an iPad now **fails to connect** (proves
      the plaintext port is closed to the LAN).
- [ ] Public zone unaffected: `https://dreamy-cafe.com/order` still loads; `/pos`
      still redirects to `/order`.
- [ ] Till kiosk on the mini‑PC still opens and operates.
- [ ] After Step C: session cookies show the `Secure` flag (Safari Web Inspector /
      browser devtools) and login still works on iPad + kiosk.
- [ ] Reboot once: all three services auto-start and tablets reconnect over HTTPS.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| iPad shows "Not Secure" / cert warning | The **Certificate Trust Settings** toggle (Step B.3) is off, or the wrong root was installed. Re-trust `caddy-root-ca.crt`. |
| `502 Bad Gateway` from Caddy | `DreamyCafeApp` isn't up on 3000 yet — check `logs\app-stderr.log`; the service `DependOnService` should order this at boot. |
| Cert doesn't match the address | The tablet is using a different host than the cert. Use the exact `-LanHost` IP; re-run the installer if the host IP changed. |
| Tablet can't reach `https://<ip>` at all | Firewall 443 rule missing, or `DreamyCafeCaddy` not Running. `Get-Service DreamyCafeCaddy`; check `logs\caddy-stderr.log`. |
| Login fails on a tablet after Step C | That tablet is still on `http://` — move it to `https://` (Step B.4), or temporarily set `SESSION_COOKIE_SECURE=0`. |
| Till kiosk broke | It uses loopback (`http://127.0.0.1:3000`) and is independent of Caddy — check `DreamyCafeApp`, not Caddy. |

### If Caddy's data dir is lost

Caddy keeps its CA under the SYSTEM profile
(`C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\pki\`). If that
directory is wiped — OS reinstall, a from-scratch service reinstall, a new mini-PC
— **Caddy silently mints a brand-new root**, and every tablet that trusted the old
one shows a certificate error the next morning. Nothing is lost but nothing works
either, until you act.

**Recovery (~10 minutes):** re-run `scripts\install-caddy-service.ps1`, then redo
[Step B](#step-b--trust-the-root-ca-on-each-ipad) on each tablet with the newly
exported `caddy-root-ca.crt`. Delete the old profile on the iPad first
(**Settings → General → VPN & Device Management**) so the stale root isn't left
trusted.

**What to keep, and what deliberately not to.** Two files, opposite handling:

| File | Handling | Why |
|------|----------|-----|
| `caddy-root-ca.crt` (**public** certificate) | Backed up nightly and worth keeping with your off-machine `.env` copy | No secret in it — it's the file you hand to iPads. You'll want it to onboard a replacement tablet in three years. |
| `root.key` (**CA private key**) | **Not** backed up, on purpose | Whoever holds it can mint certificates your tablets trust. Putting it in the Google Drive–mirrored backup folder would be a worse risk than the outage it prevents — and the outage is a 10-minute re-trust across 2–3 tablets. |

> This is a deliberate trade, not an oversight: accept a short, recoverable
> re-trust rather than keep a LAN-wide signing key in cloud storage.

---

## Rollback

```powershell
Stop-Service DreamyCafeCaddy
& "$PWD\tools\nssm\nssm.exe" remove DreamyCafeCaddy confirm
Get-NetFirewallRule -DisplayName "DreamyCafe block direct 3000 (use TLS)" | Remove-NetFirewallRule
# (optional) reopen 3000 for LAN devices if you had an explicit allow before
```

Point tablets back to `http://192.168.1.10:3000` and set `SESSION_COOKIE_SECURE=0`
(or remove it) + `Restart-Service DreamyCafeApp`. No schema, tunnel, or app-logic
changes to unwind.

---

*Related: [DEPLOY.md](../DEPLOY.md), [windows-services.md](windows-services.md), [go-live-checklist.md](go-live-checklist.md)*
