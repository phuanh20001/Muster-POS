# Rebrand Checklist — changing "DreamyCafe" to the real shop name

"DreamyCafe" appears ~500 times across the repo, but **most of those are the project /
developer identity** (scripts, agent rules, package names) and must stay. This doc lists
**only what a customer sees or what points at the domain** — the things you actually change
when the cafe gets its real name and domain.

The shop name shown to customers is now centralized. In most cases you change **one env var**,
not code.

---

## 1. The fast path — set two env vars

The customer-facing app name reads from the environment via [`src/lib/brand.js`](../src/lib/brand.js):

```
NEXT_PUBLIC_BUSINESS_NAME="Real Cafe Name"
NEXT_PUBLIC_BUSINESS_TAGLINE="Coffee & Food"     # optional, storefront subtitle
```

Setting `NEXT_PUBLIC_BUSINESS_NAME` renames all of these automatically (they import `BRAND_NAME`):

**Customer-facing**

- Storefront homepage — header, hero, about, footer, copyright ([StorefrontHome.js](../src/components/public/StorefrontHome.js))
- Online order page header ([PublicOnlineOrderPage.js](../src/components/public/PublicOnlineOrderPage.js))
- Order tracking page header + thank-you ([PublicTrackOrderPage.js](../src/components/public/PublicTrackOrderPage.js))
- Privacy policy title, meta, header, body ([privacy/page.js](../src/app/privacy/page.js))
- Browser tab title, meta description, iOS web-app title ([layout.js](../src/app/layout.js))
- Public root tab title ([page.js](../src/app/page.js))
- Loyalty / stamp-card page header ([loyalty/page.js](../src/app/loyalty/page.js))
- **Receipt reprint** printed from order history ([OrderDetailModal.js](../src/components/admin/shared/OrderDetailModal.js))
- Printed report header ([PrintReport.js](../src/components/shared/PrintReport.js))

**Staff-facing**

- Staff nav bar — full name, and the narrow-screen abbreviation via `BRAND_INITIALS` ([NavBar.js](../src/components/shared/NavBar.js))
- Login screen heading ([login/page.js](../src/app/login/page.js))
- PWA install hint ([PwaInstallBanner.js](../src/components/shared/PwaInstallBanner.js))
- Square reconciliation card copy ([SquareReconcileCard.js](../src/components/admin/reports/SquareReconcileCard.js))

Receipts and other **money artifacts** read a **separate** var so you can print a different
legal/trading name if you want — set it (falls back to "DreamyCafe" if unset):

```
DOCKET_BRAND_NAME="Real Cafe Name"      # printed receipts, Z-report, accounting CSV, Square records
```

Files: [printer.js](../src/lib/printer.js), [zReport.js](../src/lib/zReport.js),
[accounting.js](../src/lib/accounting.js) (CSV export header),
[onlineCheckout.js](../src/lib/onlineCheckout.js) (Square `paymentNote`),
[square.js](../src/lib/square.js) (default terminal device label).

Unlike `NEXT_PUBLIC_*`, this one is read at **runtime**, so changing it does not need a rebuild.

Also set (already referenced by the app):

```
NEXT_PUBLIC_PRIVACY_EMAIL="privacy@newdomain.com"
```

---

## 2. Manual edits — static files that can't read env vars

These are static assets served as-is; edit the text directly:

- **PWA manifest** — [public/manifest.json](../public/manifest.json): `name`, `short_name`, `description`
  (this is the installed-app name customers see on their home screen — and it is baked in at
  install time, so a wrong value persists until the app is reinstalled).
- **Offline fallback** — [public/offline.html](../public/offline.html).
- **Square terminal device label** — `'DreamyCafe counter'` is hardcoded at
  [api/terminal/square-pair/route.js:12](../src/app/api/terminal/square-pair/route.js#L12), which is
  in this project's never-touch path set. Don't edit it: pass a name from the pairing UI, or rename
  the device in the Square dashboard.
- [public/icon.svg](../public/icon.svg) contains **no text** (a coffee-cup mark), so it only needs
  replacing if the logo itself changes.
- **Marketing site** (separate Cloudflare Pages deploy under `marketing/`):
  - [marketing/index.html](../marketing/index.html) — all visible copy.
  - [marketing/config.js](../marketing/config.js) — `DREAMYCAFE_ORDER_ORIGIN` value → new app domain.
  - [marketing/_redirects](../marketing/_redirects) — old domain redirect rules.

---

## 3. Domain / infrastructure (change when the domain flips)

Not in the repo — change in your environment and dashboards:

- **`.env`** — every URL: `NEXTAUTH_URL`, `NEXT_PUBLIC_*` origins, webhook URLs, Square/Stripe redirect URLs.
- **Cloudflare Tunnel + DNS** — hostname mapping to the new domain.
- **Square / Stripe dashboards** — webhook endpoint URLs and any redirect URLs on the old domain.
- **Icons** — replace `public/icon.svg` if the logo changes (manifest + favicons point at it).

---

## 4. Leave as-is — project identity (do NOT rename)

Renaming these breaks tooling for zero customer benefit. They name the *project*, not the shop:

- Repo folder name, [package.json](../package.json) `name`, `desktop/package.json`.
- Agent/editor rules: [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), `.claude/`, `.cursor/`.
- All `scripts/*.ps1`, `*.bat`, Windows service names, deploy tooling.
- `window.DREAMYCAFE_ORDER_ORIGIN` — the JS variable *name* stays; only its URL *value* changes (§2).
- Internal docs (RUNBOOK, DEPLOY, README) — update opportunistically, not required for rebrand.

---

## Verify after rebranding

1. Set the env vars, restart the app.
2. Load `/` (storefront), `/order`, an order tracking page, and `/privacy` — confirm the new name.
3. Check the browser tab title and the installed-PWA name (manifest).
4. Print a test receipt and a Z-report — confirm `DOCKET_BRAND_NAME`.
5. Place a test online order end-to-end on the new domain — confirm webhooks fire.
