# Square Terminal (in-person)

## Flow in DreamyCafe

1. `POST /api/terminal/charge` → `squareProvider.charge()`
2. `terminal.checkouts.create` with `deviceOptions.deviceId` and `amountMoney`
3. Client polls `GET /api/terminal/status` → maps checkout status to canonical strings
4. On `requires_capture`, client calls `POST /api/terminal/finalize` → Square pass-through (`succeeded`)
5. `POST /api/orders` verifies each `paymentRef` via `squareProvider.verify()`

## Device resolution

Priority order (`resolveSquareDeviceId` in `square.js`):

1. `TerminalReader` row where `name = 'COUNTER'`, `enabled`, and `squareDeviceId` set (Admin → Payments)
2. Fallback `SQUARE_DEVICE_ID` env var

List devices for pairing: `GET /api/terminal/readers?square=1`.

Create a pairing code and poll status: `POST /api/terminal/square-pair` → `GET /api/terminal/square-pair?id=`. Admin → Payments **Pair Square Terminal** runs this flow; sandbox refuses physical pairing (use magic device id).

## Status mapping

| Square `TerminalCheckout.status` | Canonical status returned to client |
| -------------------------------- | ----------------------------------- |
| `PENDING`, `IN_PROGRESS` | `processing` |
| `COMPLETED` | `requires_capture` (then finalize → `succeeded`) |
| `CANCELED`, `CANCEL_REQUESTED` | `canceled` |

When checkout completes, `getStatus` swaps `paymentRef` from `chk:<id>` to `pay:<paymentId>` using `checkout.paymentIds[0]`.

## Wait window (deadline)

`charge` sets `deadlineDuration` from `PaymentSettings.terminalWaitSeconds` (Admin → Payments → Counter reader → "Card wait time", 30–300s, default 120), converted to ISO-8601 via `terminalDeadlineIso()` in `src/lib/terminalDeadline.js`. The **same** value is threaded into `runTerminalCharge`'s poll `timeoutSec`, so the reader's own cancel and the app's give-up fire together instead of one racing the other. On expiry Square returns `CANCELED` with `cancelReason` (e.g. `TIMED_OUT`), surfaced as `lastError`; the client poll only trips its local timeout `POLL_GRACE_SEC` seconds later as a safety net. The value is clamped by `clampTerminalWait` on both write (`payment-settings` PATCH) and read; `TERMINAL_DEADLINE_SECONDS` is the code default/fallback.

## Split payments

Each card leg charges independently. All card-leg payment refs are comma-joined in `Order.paymentIntentId`. Refund route splits on `,` and refunds each via `order.paymentProvider`.

## Refunds

`squareProvider.refund()`:

1. `payments.get` to read `amountMoney`
2. `refunds.refundPayment` with full `amountMoney` and new `idempotencyKey`

Route refunds by `order.paymentProvider`, not the currently active provider.

## Differences from Stripe Terminal

| | Stripe | Square |
| - | ------ | ------ |
| Capture | Manual (`capture_method: 'manual'`) | Auto-capture on checkout complete |
| Brand block | Yes (`finalize` voids blocked brands) | **Not supported** |
| Test simulate | `testHelpers.terminal.readers.presentPaymentMethod` | Sandbox device id or physical reader |
| Reader ref | `stripeReaderId` on `TerminalReader` | `squareDeviceId` on `TerminalReader` |

## Traps to avoid

- Do not call Stripe `finalize` logic (brand check / capture) on Square refs.
- Do not store bare checkout ids without the `chk:` prefix — `parseSquareRef` treats bare ids as payment ids.
- Amounts passed to `charge` are already in **minor units** (cents) at the route layer — match existing `/api/terminal/charge` behavior before changing units.
