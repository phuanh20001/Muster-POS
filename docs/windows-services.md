# Windows Services — Auto-Start on Reboot

> **Optional / deferred.** The shop can run via **`start-pos.bat`** (server + tunnel + Electron kiosk) without NSSM. When you are ready for auto-start after reboot, install services with `install-windows-services.bat` and switch to **`open-pos.bat`** for the kiosk only. To turn services off again: **`disable-windows-services.bat`**.

By default, `start-pos.bat` opens two console windows that must stay open. If the
shop PC reboots overnight (Windows Update, power blip), **online ordering stops**
until someone logs in and runs the launcher again.

This guide registers the app and Cloudflare tunnel as **Windows services** so they
start automatically at boot — no logged-in user required.

> **Use NSSM services OR `start-pos.bat` for server+tunnel — never both.** After NSSM is installed, open the till with **`open-pos.bat`** (Electron kiosk only).

PostgreSQL is already a Windows service (`postgresql-x64-18`). The nightly backup
uses Task Scheduler (`DreamyCafe DB Backup`) — that guide is in
[database-backup.md](database-backup.md).

---

## Prerequisites

- DreamyCafe built at least once: `npm run build` in the project folder
- `cloudflared` installed and tunnel `dreamycafe` already created (see [DEPLOY.md](../DEPLOY.md))
- **Administrator** PowerShell for installing services

Paths below assume:

| Item | Path |
|------|------|
| Project | `C:\path\to\DreamyCafe` |
| Node.js | `C:\Program Files\nodejs\node.exe` |
| cloudflared | wherever `where.exe cloudflared` points (often `C:\Program Files (x86)\cloudflared\cloudflared.exe`) |

Adjust if your machine differs.

---

## Quick install (recommended)

From an **Administrator** PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1
```

This downloads NSSM into `tools\nssm\`, registers `DreamyCafeApp` + `DreamyCafeTunnel`, starts them, and verifies `localhost:3000/pos`. Skip to [Step 4](#step-4--stop-using-the-desktop-launcher) when done.

---

## Step 1 — Install NSSM (manual)

NSSM (Non-Sucking Service Manager) wraps any executable as a Windows service.

1. Download from <https://nssm.cc/download> (64-bit zip).
2. Extract `nssm.exe` to e.g. `C:\Tools\nssm\nssm.exe` (or use `tools\nssm\nssm.exe` after the quick install script).
3. Verify:

```powershell
& "C:\Tools\nssm\nssm.exe" version
```

---

## Step 2 — Service: DreamyCafe app

`npm run start` runs `prisma migrate deploy` then `next start` — use it so migrations
apply on boot.

Open **Administrator** PowerShell:

```powershell
$nssm = "C:\Tools\nssm\nssm.exe"
$project = "C:\path\to\DreamyCafe"

& $nssm install DreamyCafeApp "C:\Program Files\nodejs\npm.cmd" "run" "start"
& $nssm set DreamyCafeApp AppDirectory $project
# TZ pins the shop's local timezone so day-boundary reports stay correct even if the OS clock is UTC
& $nssm set DreamyCafeApp AppEnvironmentExtra "NODE_ENV=production" "TZ=Australia/Sydney"
& $nssm set DreamyCafeApp DisplayName "DreamyCafe POS Server"
& $nssm set DreamyCafeApp Description "Next.js POS app on port 3000"
& $nssm set DreamyCafeApp Start SERVICE_AUTO_START
& $nssm set DreamyCafeApp AppStdout "$project\logs\app-stdout.log"
& $nssm set DreamyCafeApp AppStderr "$project\logs\app-stderr.log"
& $nssm set DreamyCafeApp AppRotateFiles 1
& $nssm set DreamyCafeApp AppRotateOnline 1
& $nssm set DreamyCafeApp AppRotateBytes 10485760
# Wait for PostgreSQL at boot (name is version-specific, e.g. postgresql-x64-18),
# and restart on crash with a throttle so a broken start can't hot-loop.
& $nssm set DreamyCafeApp DependOnService postgresql-x64-18
& $nssm set DreamyCafeApp AppExit Default Restart
& $nssm set DreamyCafeApp AppRestartDelay 5000
& $nssm set DreamyCafeApp AppThrottle 10000
```

> On a shop **mini PC** these matter: after a power cut the machine cold-boots, and
> without `DependOnService` the app can start before PostgreSQL is ready and fail its
> boot migration. `scripts\install-windows-services.ps1` auto-detects the Postgres
> service name for you — prefer running that script over the manual commands above.

Create the logs folder first:

```powershell
New-Item -ItemType Directory -Force -Path "C:\path\to\DreamyCafe\logs"
```

Start and test:

```powershell
Start-Service DreamyCafeApp
Start-Sleep -Seconds 15
Invoke-WebRequest -Uri "http://localhost:3000/pos" -UseBasicParsing | Select-Object StatusCode
```

Expect `200`. Then open the POS on the LAN tablet.

---

## Step 3 — Service: Cloudflare tunnel

Find your `cloudflared` path:

```powershell
(Get-Command cloudflared).Source
```

Install (replace the path if different):

```powershell
$nssm = "C:\Tools\nssm\nssm.exe"
$cf = (Get-Command cloudflared).Source

& $nssm install DreamyCafeTunnel $cf "tunnel" "--config" "C:\path\to\.cloudflared\config.yml" "run" "dreamycafe"
& $nssm set DreamyCafeTunnel AppDirectory "C:\path\to\.cloudflared"
& $nssm set DreamyCafeTunnel DisplayName "DreamyCafe Cloudflare Tunnel"
& $nssm set DreamyCafeTunnel Description "Exposes dreamy-cafe.com to localhost:3000"
& $nssm set DreamyCafeTunnel Start SERVICE_AUTO_START
& $nssm set DreamyCafeTunnel AppStdout "C:\path\to\DreamyCafe\logs\tunnel-stdout.log"
& $nssm set DreamyCafeTunnel AppStderr "C:\path\to\DreamyCafe\logs\tunnel-stderr.log"
& $nssm set DreamyCafeTunnel DependOnService DreamyCafeApp
& $nssm set DreamyCafeTunnel AppEnvironmentExtra "TUNNEL_ORIGIN_CERT=C:\path\to\.cloudflared\cert.pem"
```

`DependOnService` starts the app before the tunnel so `localhost:3000` is ready.

```powershell
Start-Service DreamyCafeTunnel
```

From mobile data (not shop Wi‑Fi): `https://dreamy-cafe.com/order` should load.
Marketing: `https://www.dreamy-cafe.com/` should load even when the tunnel is stopped.

---

## Step 4 — Open the kiosk (Electron) each day

Windows services keep the **server and tunnel** running in the background. The shop PC till still uses the **Electron kiosk** for a full-screen POS feel.

1. Do **not** use `start-pos.bat` on boot — it would start a second server and tunnel.
2. Double-click **`open-pos.bat`** (or pin it to the taskbar / Startup folder).
3. Electron detects the server is already up and opens **shell-only mode** — fullscreen kiosk, no duplicate processes.
4. Close the POS window (X) → minimizes to tray. **Close POS window** from the tray only hides Electron — server and tunnel keep running.
5. To stop server + tunnel, use **services.msc** or `Stop-Service DreamyCafeTunnel; Stop-Service DreamyCafeApp`.

```powershell
Get-Service DreamyCafeApp, DreamyCafeTunnel
```

---

## Step 5 — Windows power settings

Prevent sleep suspending the services:

1. **Settings → System → Power** → Screen and sleep → **Never** (on AC power).
2. **Control Panel → Power Options → Choose what closing the lid does** → Do nothing
   (if the host is a laptop).

---

## Deploying a code update

Services do not auto-rebuild. After pulling new code:

```powershell
cd C:\path\to\DreamyCafe

# Optional but recommended before migrations
powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1

npm run build

Restart-Service DreamyCafeApp
```

The tunnel service can keep running; it proxies to the restarted app.

---

## Managing services

```powershell
# Status
Get-Service DreamyCafeApp, DreamyCafeTunnel

# Restart app only
Restart-Service DreamyCafeApp

# Stop everything (maintenance window)
Stop-Service DreamyCafeTunnel
Stop-Service DreamyCafeApp

# View recent logs
Get-Content C:\path\to\DreamyCafe\logs\app-stderr.log -Tail 30
```

GUI: `Win+R` → `services.msc` → find **DreamyCafe POS Server** and
**DreamyCafe Cloudflare Tunnel**.

---

## Removing services (rollback to start-pos.bat)

```powershell
$nssm = "C:\Tools\nssm\nssm.exe"
Stop-Service DreamyCafeTunnel -ErrorAction SilentlyContinue
Stop-Service DreamyCafeApp -ErrorAction SilentlyContinue
& $nssm remove DreamyCafeTunnel confirm
& $nssm remove DreamyCafeApp confirm
```

Then use `start-pos.bat` again when someone is logged in.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Service starts then stops | Read `logs\app-stderr.log` — often missing `.env`, `JWT_SECRET`, or Postgres not up |
| Port 3000 already in use | Stop the old `start-pos.bat` window or stray `node` process |
| Tunnel connects but 502 online | App service not running yet — check `DependOnService` or increase app startup wait |
| Tunnel service won't start / `cert.pem` error | Service runs as SYSTEM — run `fix-tunnel-service.bat` as admin. If status is **Paused**, the fix script resets that. Ensure `origincert:` is in `%USERPROFILE%\.cloudflared\config.yml`. |
| `npm.cmd` fails under NSSM | Point `Application` at `cmd.exe` with `/c npm run start` and `AppDirectory` set |
| Online works, LAN POS doesn't | Unrelated to tunnel — check firewall on port 3000 for LAN devices |

---

*Related: [go-live-checklist.md](go-live-checklist.md), [lan-tls.md](lan-tls.md), [DEPLOY.md](../DEPLOY.md)*
