# Deploying the portfolio demo (Vercel + Neon)

This stands up a **public, all-access demo** of DreamyCafe for a portfolio / job
application — a live URL a recruiter can click into and explore the POS, manager,
and owner panels. It is deliberately **not** a production deployment:

- **No LAN / zone lockdown.** `PUBLIC_ZONE_SECRET` is left unset, so the whole
  app (staff + admin) is reachable on the public URL. That's what you want for a
  demo — reviewers can see everything. It is the *opposite* of the real shop
  setup ([DEPLOY.md](../DEPLOY.md)), where only customer routes are exposed.
- **No payment keys.** With no Stripe/Square keys configured, card checkout is
  unavailable. The **cash** checkout path exercises the full order flow with no
  hardware — that's the one to demo.
- **No printers.** Print calls fail silently (already non-fatal by design — they
  queue for reprint), so "Print Receipt" simply does nothing visible.
- **Data resets nightly** via a Vercel Cron so visitor edits never accumulate.

Everything below is free-tier.

---

## 1. Database — Neon (serverless Postgres)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (looks like
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`).
   Prisma works fine against the pooled endpoint for this app.
3. Keep it handy — it's `DATABASE_URL` below.

## 2. Deploy to Vercel

1. Push this repo to GitHub (see the pre-publish checklist below).
2. At [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework preset: **Next.js** (auto-detected). Leave build/output defaults —
   `npm run build` already runs `prisma generate`.
4. Add the environment variables in the next section **before** the first deploy.

### 2a. Gate the demo behind the test suite (one-time)

This demo is what a recruiter clicks, so a commit that fails the tests must not reach
it. By default Vercel deploys on every push to `main` **regardless of CI status** —
it doesn't wait for GitHub checks. The fix inverts the trigger: Vercel's own git
deploy is switched off for `main`, and the deploy is fired from CI instead, only
after the tests pass.

Already committed (nothing to do):

- [`vercel.json`](../vercel.json) sets `git.deploymentEnabled.main = false`. This stops
  automatic deploys **from a push to `main`** while leaving **deploy hooks working** —
  that combination is the whole trick. Other branches still get preview deploys as
  normal; only the recruiter-facing URL is gated.
- The `deploy-demo` job in [`.github/workflows/tests.yml`](../.github/workflows/tests.yml)
  runs `needs: test`, so it only fires after a green suite, and only on a push to `main`.

Do this once:

1. **Vercel** → Project → **Settings → Git → Deploy Hooks** → create one for branch
   `main`. Copy the URL (it looks like `https://api.vercel.com/v1/integrations/deploy/prj_…/…`).
2. **GitHub** → repo → **Settings → Secrets and variables → Actions → New repository
   secret** → name it exactly **`VERCEL_DEPLOY_HOOK`**, paste the URL.

> Treat that URL as a secret — anyone holding it can trigger a deploy of your demo.
> Until the secret exists the job **skips cleanly** with a note in the log rather than
> failing, so CI won't go red in the meantime.

**Verify on the next push to `main`.** Don't judge this by the commit's check list — a
Vercel check appears there *either way*, because Vercel reports a status for hook-triggered
deploys too. The unambiguous signal is in the **Vercel dashboard → the deployment →
`Created`**:

| It says | Meaning |
|---|---|
| `… by Deploy Hook` | ✅ Working — the deploy came from CI, after the tests passed |
| `… by <your GitHub user>` / attributed to the push | ❌ `deploymentEnabled` isn't taking effect — the git trigger still fired |

A second tell: if the gate has failed you'll see **two** deployments for the same commit —
one from the push, one from the hook a minute later. Exactly one means it's working.

If it isn't taking effect, fall back to **Settings → Git → Ignored Build Step** in the
Vercel dashboard, which blocks the git-triggered build from Vercel's side instead of
relying on `vercel.json`.

To confirm the gate actually bites, push a commit with a deliberately failing test to a
branch, merge it to `main`, and check that no deployment fires. Revert afterwards.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Why |
| --- | --- | --- |
| `DATABASE_URL` | *(Neon pooled string)* | Postgres connection |
| `JWT_SECRET` | *(run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)* | App refuses to boot without it |
| `NEXT_PUBLIC_DEMO` | `true` | Shows the "Live demo" banner **and** unlocks the reseed guard |
| `CRON_SECRET` | *(a second random value)* | Authorizes the nightly reseed cron |
| `APP_TZ` | `Australia/Sydney` | **Important.** Vercel runs Node in UTC; without this, "today" in Reports/Order History/cash sessions/reservations is computed on a different calendar day than the browser's local date, so same-day orders appear to vanish. `src/instrumentation.js` applies it to the process timezone at startup. (Note: the standard `TZ` var is **reserved** on Vercel/Lambda and can't be set in the dashboard — that's why the app reads `APP_TZ` instead.) |
| `NEXT_PUBLIC_BUSINESS_NAME` | *(optional, e.g. `DreamyCafe`)* | Customer-facing brand name |

> **Env var changes require a redeploy** to take effect (Deployments → latest → ⋯ → Redeploy). Adding `APP_TZ` after the first deploy means one extra redeploy.

Do **not** set `PUBLIC_ZONE_SECRET` (leaving it unset is what makes the demo
all-access), and do **not** set any `STRIPE_*` / `SQUARE_*` keys (keeps card
checkout disabled so nothing can attempt a real charge).

## 4. First-time database setup

The build runs `prisma generate`, but migrations + seed must be applied once
against the Neon database. Easiest is locally, pointing at Neon:

```bash
# in a shell with DATABASE_URL set to the Neon string
npx prisma migrate deploy      # create all tables
NEXT_PUBLIC_DEMO=true npm run db:seed:demo   # wipe + seed demo data
```

(`start` also runs `prisma migrate deploy` on boot, so tables get created on
first deploy regardless — but the seed still has to be run once as above.)

On Windows PowerShell, set the env vars inline:

```powershell
$env:DATABASE_URL = "<neon string>"; $env:NEXT_PUBLIC_DEMO = "true"
npx prisma migrate deploy
npm run db:seed:demo
```

## 5. Verify

- Visit the Vercel URL — the storefront loads and the **"Live demo · how to log
  in"** pill appears bottom-right.
- Open it: Manager PIN `1234`, Owner/Admin PIN `0000`, or pick a staff name for
  the POS.
- Ring a cash order in the POS → it completes (no card, no printer needed).
- Owner → Reports shows the order in the day's takings.

## 6. Nightly reseed (already wired)

[`vercel.json`](../vercel.json) registers a Vercel Cron hitting
`/api/demo/reseed` at **15:00 UTC** (01:00 AEST). Vercel signs cron requests with
`CRON_SECRET` as a Bearer token; the route rejects anything else, and
`reseedDemo` additionally refuses to run unless `NEXT_PUBLIC_DEMO === 'true'`.

To reseed on demand, either re-run `npm run db:seed:demo` locally against Neon, or
call the route with the secret:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-demo>.vercel.app/api/demo/reseed
```

---

## Known demo limitations (by design)

- **Product image upload** writes to `public/uploads/products/` on disk;
  Vercel's serverless filesystem is read-only, so uploading a new product image
  in the demo will fail. Emoji product images (the seeded default) work fine.
  Not worth fixing for a demo — mention it isn't wired for cloud storage if asked.
- **Card / terminal** flows require real processor keys + a physical reader, so
  they're intentionally off. The cash and split-by-price(cash) paths fully work.
- **Printing** requires a networked ESC/POS printer; calls no-op in the cloud.

## Pre-publish checklist (before pushing public)

Already done in this repo, but re-confirm before flipping the GitHub repo public:

- [x] No `.env` in git history, no live keys in tracked code (audited).
- [x] Stray `prisma/prisma/dev.db` untracked; `.gitignore` tightened.
- [ ] Decide whether the infra docs (`database-backup.md`, `migrate-to-new-pc.md`)
      describing your real mini-PC/tunnel setup should stay public.
