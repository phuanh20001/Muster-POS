// Tests a DECLINED in-person card payment on the simulated reader (test mode only).
// Mirrors the /api/terminal/charge flow but presents a declining test card.
// Run: node --env-file=.env scripts/test-declined-charge.js
const Stripe = require('stripe')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

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

  const pi = await stripe.paymentIntents.create({
    amount: 500,
    currency,
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
  })
  console.log('PaymentIntent created:', pi.id, '(', pi.status, ')')

  await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: pi.id })

  // Present a DECLINED test card instead of the default success card.
  await stripe.testHelpers.terminal.readers.presentPaymentMethod(readerId, {
    type: 'card_present',
    card_present: { number: '4000000000000002' }, // generic decline
  })

  const reader = await stripe.terminal.readers.retrieve(readerId)
  const updated = await stripe.paymentIntents.retrieve(pi.id)

  console.log('\n--- Outcome ---')
  console.log('Reader action status :', reader.action ? reader.action.status : '-')
  console.log('Reader failure       :', reader.action && reader.action.failure_message ? reader.action.failure_message : '-')
  console.log('PaymentIntent status :', updated.status)
  console.log('Decline reason       :', updated.last_payment_error ? (updated.last_payment_error.decline_code || updated.last_payment_error.message) : '-')

  if (updated.status === 'succeeded') {
    console.log('\nUNEXPECTED: the payment succeeded.')
  } else {
    console.log('\nDECLINE WORKS: payment did not succeed, as expected. The POS would show the error and NOT create an order.')
  }
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
