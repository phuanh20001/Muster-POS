# Square online checkout

## Flow in DreamyCafe

1. `POST /api/orders/online` builds order server-side (`AWAITING_PAYMENT`)
2. When `onlineProvider === SQUARE`, `squareCreateOnlineCheckout()` in `onlineCheckout.js` runs
3. `checkout.paymentLinks.create` with embedded `order` (line items + optional voucher discount)
4. Customer redirected to Square-hosted payment page (`checkoutUrl`)
5. Success URL: `{origin}{returnBase}/success?checkoutRef={trackingToken}` — **tracking token**, not Square link id (backward-compatible poll path)
6. Fulfillment: `POST /api/webhooks/square` on `payment.updated` (`COMPLETED`) **or** `GET /api/orders/online?checkoutRef=` poll fallback

## Order construction

- `locationId` from `SQUARE_LOCATION_ID` (required)
- `referenceId` = DreamyCafe `orderId` (used to resolve order from webhook payment)
- Line items: `name`, `quantity` (string), `basePriceMoney` (`BigInt` minor units, `squareCurrency()`)
- Surcharge added as extra line item (server-computed, same as Stripe path)
- Voucher: `discounts[]` with `FIXED_AMOUNT` / `ORDER` scope

`checkoutRef` stored on order = Square **payment link id** (for poll verification via `paymentLinks.get` → `orders.get`).

## Verification (`squareVerifyOnlinePayment`)

1. `checkout.paymentLinks.get({ id: linkId })`
2. `orders.get({ orderId: link.orderId })`
3. Paid when the tender’s payment has `status === 'COMPLETED'` via `payments.get` (Payment Link orders stay `OPEN` on the Square order — do not use `order.state`)
4. Payment ref = `pay:<tender.paymentId>` from order tenders

## Stripe vs Square (online)

| | Stripe | Square |
| - | ------ | ------ |
| Surface | Checkout Session | Payment Link |
| Brand blocking | `brands_blocked` on session | **Not available** |
| Success param | `CHECKOUT_SESSION_ID` | `checkoutRef` = tracking token |
| Webhook | `checkout.session.completed` | `payment.updated` |

## `returnBase`

Callers may pass `returnBase: '/order'` or `'/onlineorder'` so success/cancel URLs stay in the correct route tree.

## Traps to avoid

- Do not use Stripe Checkout Session APIs on the Square path.
- `redirectUrl` must match the public hostname customers use (tunnel URL in production).
- Never expose raw Square access tokens to the client — checkout URL only.
