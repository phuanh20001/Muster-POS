# Square webhooks

## DreamyCafe endpoint

`POST /api/webhooks/square` — public-zone allowlisted in `src/proxy.js`.

Handles: **`payment.updated`** when `data.object.payment.status === 'COMPLETED'` (payment is nested under `data.object.payment`).

Flow:

1. Read raw body (do not parse before verify)
2. `WebhooksHelper.verifySignature` from `square` SDK with:
   - `requestBody` (raw string)
   - `signatureHeader` (`x-square-hmacsha256-signature`)
   - `signatureKey` (`SQUARE_WEBHOOK_SIGNATURE_KEY`)
   - `notificationUrl` — reconstructed from `x-forwarded-host` + `x-forwarded-proto` in production (must match URL configured in Square Developer Dashboard)
3. `resolveOrderIdFromSquarePayment(payment)` → `orders.get` → `referenceId`
4. `fulfillPaidOrder(orderId, { paymentRef: pay:<id>, paymentProvider: SQUARE })`

Return `200` with `{ received: true }` for ignored events (non-COMPLETED payments, unresolvable orders).

## Dashboard setup

Production notification URL:

`https://dreamy-cafe.com/api/webhooks/square`

Subscribe to payment events (at minimum `payment.updated`). Copy the **signature key** into `.env` as `SQUARE_WEBHOOK_SIGNATURE_KEY`.

When provider is Stripe for online, Square webhook can remain configured but only fulfills Square-paid orders.

## Poll fallback

`GET /api/orders/online?checkoutRef=` calls `verifyOnlinePayment` — useful when webhook delivery is delayed or for local testing without webhook forwarding.

## Traps to avoid

- **Notification URL mismatch** — signature verification fails if the URL Square signed does not match what the app passes to `verifySignature` (include correct scheme/host behind Cloudflare tunnel).
- Do not fulfill on `payment.created` only — wait for `COMPLETED`.
- Fulfillment must be idempotent — `fulfillPaidOrder` should tolerate duplicate webhook delivery (verify existing implementation before adding side effects).
- Never skip signature verification in production.
