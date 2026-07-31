// Exercises the Square Terminal sandbox end-to-end against the REAL Square API,
// following the same call path as src/lib/paymentProvider.js (the SQUARE adapter):
//   createTerminalCheckout -> poll get -> resolve payment id -> get payment (verify) -> refundPayment
//
// The Square Sandbox does NOT support device pairing; instead it provides magic
// device_id values that auto-complete a checkout. We use the "success" id so the
// checkout completes without any UI, then confirm we can read the payment and
// refund it — proving our credentials and adapter shape are correct.
//
// Requires SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENV=sandbox in .env.
// Run:  node --env-file=.env scripts/test-square-sandbox.js
const { randomUUID } = require('crypto')
const { SquareClient, SquareEnvironment } = require('square')

// Magic sandbox device ids (no physical reader / no pairing in sandbox).
const DEVICE_SUCCESS = '9fa747a2-25ff-48ee-b078-04381f7c828f'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const token = process.env.SQUARE_ACCESS_TOKEN
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase()
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN missing in .env')
  if (env === 'production') throw new Error('Refusing to run against production — set SQUARE_ENV=sandbox')

  const currency = (process.env.SQUARE_CURRENCY || 'AUD').toUpperCase()
  const client = new SquareClient({ token, environment: SquareEnvironment.Sandbox })

  // 1) Create the checkout (mirrors squareProvider.charge) — $5.00.
  const created = await client.terminal.checkouts.create({
    idempotencyKey: randomUUID(),
    checkout: {
      amountMoney: { amount: 500n, currency },
      deviceOptions: { deviceId: DEVICE_SUCCESS },
    },
  })
  const checkout = created.checkout || created.result?.checkout
  if (!checkout?.id) throw new Error('No checkout returned: ' + JSON.stringify(created))
  console.log('Checkout created :', checkout.id, '(', checkout.status, ')')

  // 2) Poll for completion (mirrors squareProvider.getStatus). The magic device
  //    auto-completes, so this should resolve within a few seconds.
  let paymentId = null
  let finalStatus = checkout.status
  for (let elapsed = 0; elapsed < 30; elapsed += 2) {
    await sleep(2000)
    const res = await client.terminal.checkouts.get({ checkoutId: checkout.id })
    const c = res.checkout || res.result?.checkout
    finalStatus = c?.status
    console.log('  poll status   :', finalStatus)
    if (finalStatus === 'COMPLETED') { paymentId = c?.paymentIds?.[0] || null; break }
    if (finalStatus === 'CANCELED' || finalStatus === 'CANCEL_REQUESTED') break
  }

  if (finalStatus !== 'COMPLETED' || !paymentId) {
    console.log('\n--- Result ---')
    console.log(`FAIL: checkout did not complete with a payment id (status=${finalStatus}).`)
    process.exitCode = 1
    return
  }
  console.log('Payment id       :', paymentId)

  // 3) Verify the payment (mirrors squareProvider.verify).
  const payRes = await client.payments.get({ paymentId })
  const payment = payRes.payment || payRes.result?.payment
  console.log('Payment status   :', payment?.status, '(expected COMPLETED)')
  const brand = payment?.cardDetails?.card?.cardBrand || '(n/a)'
  console.log('Card brand        :', brand, '(informational — brand blocking is Stripe-only)')

  // 4) Refund it (mirrors squareProvider.refund).
  const refRes = await client.refunds.refundPayment({
    idempotencyKey: randomUUID(),
    paymentId,
    amountMoney: payment.amountMoney,
  })
  const refund = refRes.refund || refRes.result?.refund
  console.log('Refund status    :', refund?.status, '(PENDING or COMPLETED is fine in sandbox)')

  const pass = payment?.status === 'COMPLETED' && !!refund?.id
  console.log('\n--- Result ---')
  if (pass) {
    console.log('PASS: created -> completed -> verified -> refunded. Square sandbox + adapter path work.')
  } else {
    console.log('FAIL: payment not COMPLETED or refund not created.')
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('Error:', e.message || e)
  if (e.body) console.error('Body:', JSON.stringify(e.body))
  process.exitCode = 1
})
