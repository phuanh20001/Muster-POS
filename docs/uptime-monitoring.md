# Uptime Monitoring

Get an email (or SMS) alert when online ordering goes down — before a customer complains.

DreamyCafe exposes a public health endpoint that checks the app **and** the database:

```
https://dreamy-cafe.com/api/health
```

- **200** `{"ok":true,"db":true}` — tunnel, app, and Postgres are up
- **503** — app or database is unhealthy

Use this URL for monitoring instead of `/order` alone — the order page can load while checkout is broken if the database is down.

---

## UptimeRobot (free, recommended)

1. Sign up at <https://uptimerobot.com> (free tier: 50 monitors, 5-minute interval).
2. **Add New Monitor**
   - Monitor type: **HTTP(s)**
   - Friendly name: `DreamyCafe online`
   - URL: `https://dreamy-cafe.com/api/health`
   - Monitoring interval: **5 minutes**
3. **Alert contacts** → add your email (and optional SMS on paid tier or email-to-SMS gateway).
4. Save. UptimeRobot will email you when the check fails 2+ times in a row.

### Optional second monitor

Add a backup check on `https://dreamy-cafe.com/order` if you also want the customer page HTML verified — usually redundant if `/api/health` is green.

---

## What failures mean

| Symptom | Likely cause |
|---------|----------------|
| Both monitors down | Shop PC off, no internet, or tunnel not running |
| `/order` up, `/api/health` 503 | Next.js running but Postgres down |
| LAN POS works, public down | `DreamyCafeTunnel` service stopped — see [windows-services.md](windows-services.md) |

---

## Verify locally (before relying on alerts)

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing | Select-Object StatusCode, Content
```

From mobile data (not shop Wi‑Fi):

```
https://dreamy-cafe.com/api/health
```

---

*Related: [DEPLOY.md](../DEPLOY.md), [windows-services.md](windows-services.md)*
