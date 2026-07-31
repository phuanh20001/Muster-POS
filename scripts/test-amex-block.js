// Tests the in-person BRAND BLOCK on the simulated reader (test mode only).
// The real /api/terminal/charge always taps a Visa test card, so this script
// drives the flow itself: it presents an Amex test card, then calls the real
// /api/terminal/finalize endpoint to prove a blocked brand is voided (no charge).
//
// It temporarily blocks `amex` in PaymentSettings and restores the prior value.
// The dev server must be running. Run:
//   node --env-file=.env scripts/test-amex-block.js
const Stripe = require('stripe')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BASE = process.env.TERMINAL_BASE_URL || 'http://localhost:3000'
const AMEX_TEST_PAN = '378282246310005'

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key || !key.startsWith('sk_test')) {
    throw new Error('Need a test/sandbox STRIPE_SECRET_KEY')
  }
  const stripe = new Stripe(key)
  const currency = process.env.STRIPE_CURRENCY || 'aud'

  const cfg = await prisma.terminalReader.findUnique({ where: { name: 'COUNTER' } })
  const readerId = cfg?.stripeReaderId || process.env.STRIPE_TERMINAL_READER_ID
  if (!readerId) throw new Error('No COUNTER reader — run scripts/create-simulated-reader.js first')

  // Temporarily ensure `amex` is blocked, remembering the prior state to restore.
  const prior = await prisma.paymentSettings.findUnique({ where: { id: 1 } })
  const priorBlocked = prior?.blockedBrands ?? []
  await prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: { blockedBrands: Array.from(new Set([...priorBlocked, 'amex'])) },
    create: { id: 1, blockedBrands: ['amex'] },
  })

  try {
    // Mirror the real charge route: manual capture so finalize can inspect the brand.
    const pi = await stripe.paymentIntents.create({
      amount: 500,
      currency,
      payment_method_types: ['card_present'],
      capture_method: 'manual',
    })
    console.log('PaymentIntent created:', pi.id, '(', pi.status, ')')

    await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id })

    // Present an AMEX test card instead of the default success (Visa) card.
    await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId, {
      type: 'card_present',
      card_present: { number: AMEX_TEST_PAN },
    })

    const authorized = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] })
    const brand = authorized.latest_charge?.payment_method_details?.card_present?.brand ?? '(none)'
    console.log('Authorized status   :', authorized.status, '(expected requires_capture)')
    console.log('Reported card brand :', brand, '(expected amex)')

    // Call the real brand-block code path.
    const res = await fetch(`${BASE}/api/terminal/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: pi.id }),
    })
    const fin = await res.json()
    console.log('Finalize response   :', JSON.stringify(fin))

    const after = await stripe.paymentIntents.retrieve(pi.id)
    console.log('PaymentIntent status:', after.status, '(expected canceled)')

    const pass = fin.status === 'blocked' && brand === 'amex' && after.status === 'canceled'
    console.log('\n--- Result ---')
    if (pass) {
      console.log('PASS: Amex was blocked and the hold was voided — no charge taken.')
    } else {
      console.log('FAIL: expected status=blocked, brand=amex, PaymentIntent=canceled.')
      process.exitCode = 1
    }
  } finally {
    // Restore the prior blocked-brands list.
    await prisma.paymentSettings.update({
      where: { id: 1 },
      data: { blockedBrands: priorBlocked },
    }).catch(() => {})
    console.log('Restored prior blockedBrands:', JSON.stringify(priorBlocked))
  }
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
