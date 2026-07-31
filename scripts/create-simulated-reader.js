// Creates a Stripe Terminal Location + simulated reader in test/sandbox mode,
// then saves it as the COUNTER reader so the POS can use it immediately.
// Run: node --env-file=.env scripts/create-simulated-reader.js
const Stripe = require('stripe')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set in .env')
  if (!key.startsWith('sk_test')) {
    throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a test/sandbox key')
  }
  const stripe = new Stripe(key)

  const location = await stripe.terminal.locations.create({
    display_name: 'Dreamy Cafe',
    address: { line1: '1 Coffee St', city: 'Sydney', state: 'NSW', postal_code: '2000', country: 'AU' },
  })
  console.log('Location:', location.id)

  const reader = await stripe.terminal.readers.create({
    registration_code: 'simulated-wpe',
    location: location.id,
    label: 'Simulated Counter',
  })
  console.log('Reader:  ', reader.id, `(${reader.device_type})`)

  await prisma.terminalReader.upsert({
    where: { name: 'COUNTER' },
    update: { stripeReaderId: reader.id, label: 'Simulated Counter', enabled: true },
    create: { name: 'COUNTER', stripeReaderId: reader.id, label: 'Simulated Counter', enabled: true },
  })
  console.log('\nSaved as COUNTER reader. Open Admin → Payment Terminal → Test charge $1.00')
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
