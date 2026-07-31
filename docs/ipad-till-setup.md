# iPad Till Setup — do this at the shop

**Everything on the mini PC is already done.** This page is only the part that needs the
tablet in your hands. Budget **~5 minutes for the first iPad**, ~2 for each one after.

You will need:

- the iPad, on the **shop Wi-Fi** (not mobile data)
- the file **`caddy-root-ca.crt`** — it sits in the project folder on the mini PC
- the mini PC powered on

---

## Before you start — one check that saves the whole trip

The mini PC was set to a fixed address at home: **`192.168.0.10`**. The shop's router
hands out addresses from its own range, and if `192.168.0.10` is inside that range the
router might give it to something else.

**On the mini PC, open PowerShell and run:**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-resilience.ps1
```

Then confirm the address is still what we set:

```powershell
Get-NetIPAddress -InterfaceAlias "Ethernet 2" -AddressFamily IPv4 |
  Select-Object IPAddress, PrefixOrigin
```

| You see | Meaning | Do |
|---|---|---|
| `192.168.0.10` / `Manual` | All good | Carry on to Step 1 |
| Anything else, or a "duplicate address" warning | Something else on the shop LAN wants that address | See [If the address has to change](#if-the-address-has-to-change) — it is a 2-minute fix and **you will not have to redo the tablets** |

---

## Step 1 — get the certificate file onto the iPad

The tablets talk to the till over HTTPS. The certificate is issued by the mini PC itself,
so each iPad has to be told once that it trusts that mini PC. `caddy-root-ca.crt` is what
does that.

Pick whichever is easiest:

- **Email it** to an address you can open on the iPad (it is ~600 bytes)
- **AirDrop** it from a Mac
- Put it on a USB stick / cloud folder the iPad can reach

> This file is **safe to email**. It is the public half only — it lets a tablet *check*
> the till's identity, it cannot be used to impersonate anything. The private half stays
> on the mini PC and is deliberately never copied anywhere.

On the iPad, **tap the file**. iOS says **"Profile Downloaded"**. Nothing has been
installed yet — that is the next step.

---

## Step 2 — install the profile

**Settings → General → VPN & Device Management** → tap the downloaded profile → **Install**

Enter the iPad passcode if asked. It will warn you the certificate is unmanaged — that is
expected, it is your own certificate.

---

## Step 3 — the toggle everyone misses 🔴

Installing the profile is **not enough.** There is a second, separate switch in a
completely different part of Settings, and without it Safari still says "Not Secure".

**Settings → General → About → Certificate Trust Settings**

Find **`Caddy Local Authority - 2026 ECC Root`** and turn it **ON**.

iOS will ask you to confirm with a scary-sounding warning. Accept it.

> If you only do Step 2 and skip this, everything looks installed and nothing works.
> This is the single most common failure in this whole setup.

---

## Step 4 — point the iPad at the till

In Safari, go to:

```
https://dreamy-cafe.local
```

**Note what is different:** no `http://`, no `:3000` on the end.

You should see the POS load with a **padlock** in the address bar and no warning.

> **Use the name, not the number.** `https://dreamy-cafe.local` follows the mini PC even if
> its address changes later. `https://192.168.0.10` also works and is the fallback if the
> name does not resolve on the shop's Wi-Fi — some routers block the discovery protocol
> that makes `.local` names work. If the name fails, use the number and everything still
> functions; just note it down, because a future address change would then need the
> tablets revisited.

Then **Share → Add to Home Screen** so it opens fullscreen like an app.

---

## Step 5 — confirm it is genuinely working

Tick all four:

- [ ] Padlock shows, no certificate warning
- [ ] You can **log in with a PIN**
- [ ] A **test sale** rings through end to end
- [ ] `http://192.168.0.10:3000` now **fails to connect** — this is correct and proves the
      unencrypted way in is closed

The third one matters most: it exercises the whole path rather than just the page loading.

---

## Step 6 — repeat for every tablet

Steps 1–5 on each iPad. **Do not skip a tablet and plan to come back to it** — the next
step breaks any tablet still on `http://`.

---

## Step 7 — lock the session cookies (only after every tablet is done)

Once **all** tablets are on `https://`, on the mini PC add this line to `.env`:

```
SESSION_COOKIE_SECURE=1
```

then:

```powershell
Restart-Service DreamyCafeApp
```

This stops session cookies ever travelling unencrypted.

> ⚠ **Order genuinely matters here.** A `Secure` cookie is silently thrown away by any
> tablet still on `http://`, so logins there just stop working with no useful error. If a
> tablet breaks after this step, that tablet is still on `http://` — either finish Step 4
> on it, or set `SESSION_COOKIE_SECURE=0` and restart to undo.

Re-log in on one iPad afterwards to confirm.

---

## If the address has to change

Only if the pre-flight check found a clash. On the mini PC, as Administrator:

```powershell
# 1. Pick a free address. Check the router's DHCP range first and choose OUTSIDE it.
#    Do NOT use .12 or .4 - those are the front and kitchen printers.
Remove-NetIPAddress -InterfaceAlias "Ethernet 2" -Confirm:$false
New-NetIPAddress -InterfaceAlias "Ethernet 2" -IPAddress 192.168.0.11 `
  -PrefixLength 24 -DefaultGateway 192.168.0.1
Set-DnsClientServerAddress -InterfaceAlias "Ethernet 2" -ServerAddresses 192.168.0.1

# 2. Re-issue the certificate for the new address
powershell -ExecutionPolicy Bypass -File scripts\install-caddy-service.ps1 `
  -LanHost 192.168.0.11 -LanName dreamy-cafe.local
```

✅ **The tablets do not need redoing**, as long as they are bookmarked to
`https://dreamy-cafe.local`. That is exactly why the hostname is on the certificate — this
was the one mistake here that would otherwise have cost a lap of the shop with every iPad.

Also update the printers if their addresses moved, and re-run `verify-resilience.ps1`.

---

## If something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| "Not Secure" / certificate warning | **Step 3** was skipped | Turn on Certificate Trust Settings |
| `dreamy-cafe.local` does not load, but `192.168.0.10` does | Router blocks mDNS/Bonjour | Use the IP; note it, so a future address change means revisiting tablets |
| Neither address loads | Caddy not running, or wrong Wi-Fi | `Get-Service DreamyCafeCaddy`; check the iPad is on shop Wi-Fi, not mobile data |
| `502 Bad Gateway` | Caddy is up, the app is not | `Get-Service DreamyCafeApp`; check `logs\app-stderr.log` |
| Login fails on one tablet only, after Step 7 | That tablet is still on `http://` | Finish Step 4 on it |
| Was working, now every tablet errors at once | Caddy's certificate authority was lost (OS reinstall / new PC) | Re-run the installer, redo Steps 1–3 on each tablet. Delete the old profile first. |

---

## Why it is built this way

Without this, the tablets talk to the till in **plain text over the shop Wi-Fi** — anyone
who gets onto that network can read session cookies, staff PINs and order data off the air.

You cannot buy a normal certificate for a private address like `192.168.0.10`, because
private addresses are not globally unique and there is nothing for a certificate authority
to verify. That is the real reason this is fiddly rather than a one-click job, and why the
mini PC runs its own tiny certificate authority instead.

It also buys three things beyond encryption:

- The **offline cache works.** Browsers only allow it on HTTPS, so over `http://` the till
  has no offline fallback at all — a Wi-Fi blip mid-order would show a browser error page
  instead of the app.
- The **PIN lockout cannot be dodged.** Caddy rewrites the client-address header, so a
  tablet cannot forge it to escape the per-device lockout after wrong PINs.
- The **plain-text door is shut**, not just unused — port 3000 is blocked to the network.

---

*Related: [lan-tls.md](lan-tls.md) (full reference) · [resilience-reference.md](resilience-reference.md) · [staff-quick-reference.md](staff-quick-reference.md)*
