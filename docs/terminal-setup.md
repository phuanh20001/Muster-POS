# Connecting a Real Payment Terminal

How to swap the test-mode simulated reader for a real in-person card reader.

DreamyCafe uses **Stripe Terminal in server-driven mode** with a **smart reader**. The
server creates the PaymentIntent and tells the reader to process it
(`src/lib/terminal.js`, `src/app/api/terminal/charge/route.js`), so there is **no
browser pairing or card-reader SDK** to set up — you register the reader to your
Stripe account and paste its id into the **Payments** tab. Card data never touches
this app (PCI scope stays minimal).

## Prerequisites

1. **A supported reader** — Stripe Reader **S700** or **BBPOS WisePOS E** (buy from
   Stripe). These are the smart readers the code expects. Terminal must be available
   in your country (AU is supported; currency is already `aud`).
2. **Live Stripe keys** — the reader runs in live mode, so switch `.env` from
   `sk_test…` to `sk_live…`. ⚠️ This affects the whole Stripe integration: real
   charges **and** a new **live `STRIPE_WEBHOOK_SECRET`** for online orders. Plan the
   switch deliberately.
3. **Network** — the reader connects via Wi-Fi or Ethernet and talks to Stripe's
   cloud directly, so it needs outbound internet (same network as the shop is fine).

## Step 1 — Create a Location (once)

Stripe requires a Terminal **Location** (the shop's real address) to register readers.
In the **Stripe Dashboard → Terminal → Locations**, create one with the cafe's address.
(The test script `scripts/create-simulated-reader.js` does this automatically for the
simulated reader.)

## Step 2 — Register the physical reader

On the reader, generate a **registration code**:

- **WisePOS E / S700:** open settings (swipe in from the left edge, or enter the admin
  PIN), then **Generate registration code** — you'll get words like `quick-brown-fox`.
  *(The exact swipe/PIN differs between S700 and WisePOS E firmware — check the
  reader's quick-start card.)*

Then register it, either way:

- **Dashboard:** Terminal → Readers → **Register reader** → enter the code, pick your
  Location, add a label.
- **API** (same call the script makes, with the real code instead of `simulated-wpe`):

  ```js
  stripe.terminal.readers.create({
    registration_code: 'quick-brown-fox',
    location: 'tml_…',
    label: 'Front counter',
  })
  ```

This yields the reader id **`tmr_…`** — you'll need it next.

## Step 3 — Configure it in the app

1. Go to **Admin → Payments** (`/admin/terminal`).
2. The page lists live readers from your Stripe account (the reader dropdown is
   populated via `GET /api/terminal/readers?stripe=1`). Pick yours, or paste the
   **`tmr_…`** id.
3. **Leave the name as `COUNTER`** — the charge flow resolves the reader named
   `COUNTER` by default (`resolveReaderId('COUNTER')`). Alternatively set
   `STRIPE_TERMINAL_READER_ID` in `.env` as a fallback.
4. Set a label, tick **Enabled**, then **Save reader**.
5. Click **Test charge $1.00** and tap a real card to confirm end-to-end.

## Go-live notes

- **In live mode the tap is real.** The charge route auto-simulates a card tap **only**
  when the key is `sk_test` (`isTestMode()`); with `sk_live` it waits for an actual
  card.
- **Test-mode readers don't carry over** — register the real reader fresh under live
  keys. The simulated reader is test-mode only.
- **Everything else still works in live:** manual-capture brand blocking, the card
  surcharge, refunds (`Order.paymentIntentId`), and split card legs are not test-only.

## Quick checklist

1. Buy S700 / WisePOS E
2. Switch `.env` to live keys (+ live webhook secret)
3. Create a Location in Stripe
4. Generate the registration code on the reader → register it (Dashboard or API)
5. Admin → Payments: set the `tmr_…` id as `COUNTER`, Enabled, Save
6. Test charge $1.00 → done

## Troubleshooting

- **Reader not listed in the dropdown** — confirm `.env` keys match the mode the reader
  was registered in (live vs test), and that you're logged in as MANAGER/ADMIN (the
  `?stripe=1` listing requires it).
- **"No payment terminal configured"** — the saved reader name isn't `COUNTER`, it's
  disabled, or `stripeReaderId` is blank.
- **Charge never completes** — check the reader is online (Dashboard shows `online`)
  and on a network with outbound internet.
