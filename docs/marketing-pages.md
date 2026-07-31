# Marketing site (Cloudflare Pages)

> ⚠ **Every `dreamy-cafe.com` below is the OLD brand's domain and is a stand-in, not a live
> hostname.** The shop is now **Dreamy Cafe** and its real domain is **not yet decided**. Read this
> guide as `dreamy-cafe.com` → *the apex domain you register*, and `www.dreamy-cafe.com` → *its
> `www` subdomain*. The concrete name is kept in the examples deliberately — DNS and tunnel steps
> are far easier to follow against a real-looking hostname than against `<domain>` — but **do not
> type these literally.** The page copy in `marketing/` is already rebranded to Dreamy Cafe; only the
> domain is outstanding, in [`marketing/config.js`](../marketing/config.js) and
> [`marketing/_redirects`](../marketing/_redirects), which must be filled in **together**.

Static marketing HTML lives in [`marketing/`](../marketing/). **Order Online** buttons link to
**`https://<your-domain>/order`** — the same hostname and path your tunnel serves.

## Diagnosis: why `order.dreamy-cafe.com` was wrong

An earlier draft of this guide assumed:

```
dreamy-cafe.com          → Cloudflare Pages (marketing)
order.dreamy-cafe.com    → Cloudflare Tunnel (app)
```

That required creating a **new DNS record** for `order.dreamy-cafe.com`. It was never set up,
so every **Order Online** link failed with `DNS_PROBE_FINISHED_NXDOMAIN`.

**Your live setup is different and correct:** the tunnel already owns **`dreamy-cafe.com`**, and
online ordering is a **path** (`/order`), not a separate subdomain. Marketing must use **`www`**
so the apex can stay on the tunnel.

```
www.dreamy-cafe.com    → Cloudflare Pages (marketing homepage — no shop PC needed)
dreamy-cafe.com        → Cloudflare Tunnel → shop PC (/, /order, /loyalty, webhooks)
```

Do **not** point apex `dreamy-cafe.com` at Pages while the tunnel uses the same hostname.
Only one service can own that DNS record unless you add a Cloudflare Worker for path routing
(not needed here).

When the tunnel or shop PC is down, **`www.dreamy-cafe.com`** still shows hours and about us;
**`dreamy-cafe.com/order`** is unavailable until the café server is back.

---

## 1. Deploy to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
   (use **Get started** under Pages — not the Workers deploy flow).
2. Connect the DreamyCafe GitHub repo.
3. **Build command:** leave empty (static site).
4. **Build output directory:** `marketing`
5. **Production branch:** branch that contains `marketing/` (e.g. `main`).
6. Deploy → open the `https://<project>.pages.dev` preview URL.

[`marketing/config.js`](../marketing/config.js) must point order links at the tunnel host. It
currently holds a deliberate placeholder, because there is no correct value until the domain exists:

```js
window.DREAMYCAFE_ORDER_ORIGIN = 'https://CHANGE_ME.invalid'   // ← replace with the apex domain
```

`.invalid` is a reserved TLD (RFC 2606) that can never resolve, so an accidental deploy produces
**visibly dead** Order Online buttons instead of quietly sending customers to whoever owns the old
`dreamy-cafe.com`. The variable *name* stays (see [rebrand-checklist.md](rebrand-checklist.md) §4);
only the value changes. Redeploy Pages after changing `config.js`.

Copy in [`marketing/index.html`](../marketing/index.html) is kept in sync with
[`src/components/public/StorefrontHome.js`](../src/components/public/StorefrontHome.js)
(edit both when changing address, hours, or hero text).

---

## 2. Custom domain — use `www`, not apex

1. Pages project → **Custom domains** → **Set up a custom domain**.
2. Add **`www.dreamy-cafe.com`**.
3. Let Cloudflare add the `www` CNAME (proxied).

**Keep apex on the tunnel** (do not remove this record):

```
dreamy-cafe.com    CNAME    <tunnel-id>.cfargotunnel.com    (proxied)
```

Optional: add a **Redirect rule** so visitors who type `dreamy-cafe.com` without `www` land on
marketing — **only if** you first move the app to a different hostname. With the model above,
**skip** apex → `www` redirects; `dreamy-cafe.com` must keep hitting the tunnel for `/order`.

---

## 3. Tunnel (unchanged — apex hostname)

`C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: C:\Users\<you>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: dreamy-cafe.com
    service: http://localhost:3000
  - service: http_status:404
```

```powershell
cloudflared tunnel route dns dreamycafe dreamy-cafe.com
cloudflared tunnel run dreamycafe
```

Online ordering URL: **`https://dreamy-cafe.com/order`** (not a subdomain).

---

## 4. Transform Rule (public zone)

**Rules → Transform Rules → Modify Request Header**

- **When:** `Hostname equals dreamy-cafe.com`
- **Set:** `x-dreamy-zone` = your `PUBLIC_ZONE_SECRET` (same value as in `.env`)

Use **Set** (not Add) so clients cannot forge the header. Restart the app after `.env` changes.

---

## 5. Payment webhooks

Webhooks stay on the **apex** tunnel host:

| Provider | URL |
| -------- | --- |
| Stripe | `https://dreamy-cafe.com/api/webhooks/stripe` |
| Square | `https://dreamy-cafe.com/api/webhooks/square` |

Update `STRIPE_WEBHOOK_SECRET` / `SQUARE_WEBHOOK_SIGNATURE_KEY` after recreating endpoints.

---

## 6. Marketing `_redirects`

[`marketing/_redirects`](../marketing/_redirects) is intentionally **empty**. Order and loyalty
live on `dreamy-cafe.com` (tunnel), not on Pages. **Order Online** buttons use `config.js` to
link directly to `https://dreamy-cafe.com/order`.

Do **not** add redirects from `www` `/order` to a non-existent `order.dreamy-cafe.com`.

---

## Verification

- [ ] `https://<project>.pages.dev` or `https://www.dreamy-cafe.com/` loads with **tunnel stopped**
- [ ] **Order Online** opens `https://dreamy-cafe.com/order` (not `order.dreamy-cafe.com`)
- [ ] `https://dreamy-cafe.com/order` loads when tunnel + app are running
- [ ] `https://dreamy-cafe.com/loyalty` loads when tunnel + app are running
- [ ] `https://dreamy-cafe.com/pos` and `/admin` are blocked or redirected from the internet
- [ ] Stripe/Square dashboards use **`dreamy-cafe.com`** webhook URLs

See also [DEPLOY.md](../DEPLOY.md) and [go-live-checklist.md](go-live-checklist.md).

---

## Troubleshooting

### Error 1033 on `dreamy-cafe.com/order` but marketing homepage works

The marketing site (`www` or `*.pages.dev`) is on **Pages** and does not need the tunnel.
**Error 1033** means Cloudflare has DNS for the tunnel hostname but **no healthy connector**
reaching your shop PC.

Check both:

1. **App running** — `http://127.0.0.1:3000/order` must return 200 locally (`npm run start` or `start-pos.bat`).
2. **Tunnel running** — `cloudflared tunnel run dreamycafe` (or desktop app / NSSM service).

### Wrong `ingress` hostname (common mistake)

The tunnel hostname is the **domain only** — never include a path:

```yaml
# WRONG — causes 1033 or no routing
- hostname: dreamy-cafe.com/order

# CORRECT
- hostname: dreamy-cafe.com
  service: http://localhost:3000
```

`/order` is a URL path served by Next.js after traffic reaches `localhost:3000`.

Validate after edits:

```powershell
cloudflared tunnel ingress validate
```
