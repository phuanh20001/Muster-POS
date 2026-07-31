---
name: square-best-practices
description: >-
  Guides Square integration decisions for DreamyCafe — Terminal API (in-person
  smart readers), Checkout Payment Links (online orders), webhooks, refunds,
  sandbox vs production, and the provider abstraction in paymentProvider.js.
  Use when building, modifying, or reviewing any Square payment path — terminal
  charging, online checkout, webhooks, device pairing, or switching between
  Stripe and Square.
---

Square API version: pin via `SQUARE_VERSION` when using the MCP server; this app uses the `square` npm SDK (`SquareClient`) and inherits the SDK’s default API version.

Official docs: [Square Developer](https://developer.squareup.com/docs). Optional live API exploration: [Square MCP Server](https://developer.squareup.com/docs/mcp) (`https://mcp.squareup.com/sse`).

## DreamyCafe architecture

Card charging uses **two independent settings** on `PaymentSettings`:

| Channel | Setting field | Code path |
| ------- | ------------- | --------- |
| In-store terminal / POS | `provider` | `getInPersonProvider()` → `/api/terminal/*` |
| Customer `/order` checkout | `onlineProvider` | `getOnlineProviderName()` → `onlineCheckout.js` |

Both adapters live in `src/lib/paymentProvider.js`. The POS client **never** calls Square directly — only `/api/terminal/*` and `/api/orders/*`.

| File | Role |
| ---- | ---- |
| `src/lib/square.js` | `SquareClient`, env helpers, device resolution |
| `src/lib/paymentProvider.js` | `squareProvider` adapter (charge / status / finalize / cancel / verify / refund) |
| `src/lib/onlineCheckout.js` | Square Payment Links for online orders |
| `src/app/api/webhooks/square/route.js` | `payment.updated` → `fulfillPaidOrder` |
| `src/app/api/terminal/*` | Thin routes dispatching to active in-person provider |

`Order.paymentProvider` is stamped at creation so refunds always route to the processor that took the order, even after the active provider is switched.

## Integration routing

| Building… | Square API | Details |
| --------- | ---------- | ------- |
| In-person card (POS) | Terminal API — `terminal.checkouts.create` | <references/terminal.md> |
| Online customer checkout | Checkout API — `checkout.paymentLinks.create` | <references/online.md> |
| Payment confirmation (online) | Webhook `payment.updated` + poll fallback | <references/webhooks.md> |
| Refunds | `refunds.refundPayment` | <references/terminal.md> |
| Keys, env, sandbox | — | <references/security.md> |

Read the relevant reference file before answering integration questions or writing code.

## Critical rules (DreamyCafe)

- **Brand blocking is Stripe-only.** Square auto-captures; there is no auth-then-void. `squareProvider.finalize()` is a pass-through. Do not attempt card-brand restrictions on Square paths.
- **Never trust client prices** on public routes — always recompute server-side (same as Stripe).
- **`paymentRef` naming:** in-person Square uses `chk:<checkoutId>` until the tap completes, then `pay:<paymentId>`. Stored in `Order.paymentIntentId` (comma-joined for split legs). Status route may return an updated `paymentRef` — the client must adopt it.
- **Canonical status strings:** both adapters return Stripe-style statuses (`processing`, `requires_capture`, `succeeded`, `canceled`, `requires_payment_method`) so `CheckoutModal` stays provider-agnostic.
- **Separate providers:** changing in-store provider does not change online provider unless `onlineProvider` is also updated in Admin → Payments.
- **Use `idempotencyKey`** on every Square create/refund call (already done via `randomUUID()`).
- **Money is minor units** — `BigInt` for Square `amountMoney`; app amounts are dollars/`Number`.

## Dev verification

| Script | What it exercises |
| ------ | ----------------- |
| `node --env-file=.env scripts/test-square-sandbox.js` | Direct Square API (sandbox) |
| `node --env-file=.env scripts/test-square-app-stack.js` | Admin $1 charge + POS card order via `/api/terminal/*` |
| `node --env-file=.env scripts/test-square-online.js` | `POST /api/orders/online` with `onlineProvider=SQUARE` |
| `node --env-file=.env scripts/test-square-cancel-charge.js` | Canceled Terminal checkout (no order path) |

Sandbox magic device id (no physical reader): `9fa747a2-25ff-48ee-b078-04381f7c828f`.

## Key documentation

- [Terminal API overview](https://developer.squareup.com/docs/terminal-api/overview)
- [Checkout API / Payment Links](https://developer.squareup.com/docs/checkout-api)
- [Webhooks](https://developer.squareup.com/docs/webhooks/overview)
- [OAuth / access tokens](https://developer.squareup.com/docs/build-basics/access-tokens)
- [Go-live checklist](https://developer.squareup.com/docs/development-essentials/go-live-checklist) — review before production
