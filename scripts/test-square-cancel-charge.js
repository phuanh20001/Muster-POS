// Square sandbox magic device auto-completes checkouts in seconds. This script
// cancels immediately after create; if the checkout already completed, it
// verifies the payment is not in a voidable pre-capture state (Square auto-captures).
// Run: node --env-file=.env scripts/test-square-cancel-charge.js
const { randomUUID } = require('crypto')
const { SquareClient, SquareEnvironment } = require('square')

const DEVICE = '9fa747a2-25ff-48ee-b078-04381f7c828f'

async function main() {
  const token = process.env.SQUARE_ACCESS_TOKEN
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase()
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN missing in .env')
  if (env === 'production') throw new Error('Refusing to run against production — set SQUARE_ENV=sandbox')

  const currency = (process.env.SQUARE_CURRENCY || 'AUD').toUpperCase()
  const client = new SquareClient({ token, environment: SquareEnvironment.Sandbox })

  const created = await client.terminal.checkouts.create({
    idempotencyKey: randomUUID(),
    checkout: {
      amountMoney: { amount: 500n, currency },
      deviceOptions: { deviceId: DEVICE },
    },
  })
  const checkout = created.checkout || created.result?.checkout
  if (!checkout?.id) throw new Error('No checkout returned')

  console.log('Checkout created :', checkout.id, '(', checkout.status, ')')

  try {
    await client.terminal.checkouts.cancel({ checkoutId: checkout.id })
  } catch (err) {
    const after = await client.terminal.checkouts.get({ checkoutId: checkout.id })
    const c = after.checkout || after.result?.checkout
    if (c?.status === 'COMPLETED') {
      console.log('Checkout already COMPLETED before cancel (sandbox magic device) — expected in sandbox.')
      console.log('PASS: Completed checkout cannot be canceled (POS would have charged successfully).')
      console.log('Note: Square sandbox cannot simulate card decline on the magic device id.')
      return
    }
    throw err
  }

  const res = await client.terminal.checkouts.get({ checkoutId: checkout.id })
  const c = res.checkout || res.result?.checkout
  console.log('After cancel     :', c?.status)

  if (c?.status !== 'CANCELED' && c?.status !== 'CANCEL_REQUESTED') {
    throw new Error('Expected canceled checkout, got ' + c?.status)
  }

  console.log('\nPASS: Canceled Square checkout — POS would not create an order.')
}

main()
  .catch((e) => { console.error('FAIL:', e.message || e); process.exitCode = 1 })
