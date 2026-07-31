// Pre-flight check before production Square Terminal pairing.
// Does not create pairing codes — run after setting SQUARE_ENV=production.
// Run: node --env-file=.env scripts/verify-square-production-ready.js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase()
  const token = process.env.SQUARE_ACCESS_TOKEN
  const locationId = process.env.SQUARE_LOCATION_ID
  const webhookKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY

  const issues = []
  const ok = []

  if (env !== 'production') {
    issues.push('SQUARE_ENV is not production — Pair Square Terminal is blocked in sandbox')
  } else {
    ok.push('SQUARE_ENV=production')
  }

  if (!token) issues.push('SQUARE_ACCESS_TOKEN missing')
  else ok.push('SQUARE_ACCESS_TOKEN set')

  if (!locationId) issues.push('SQUARE_LOCATION_ID missing')
  else ok.push('SQUARE_LOCATION_ID set')

  if (!webhookKey) issues.push('SQUARE_WEBHOOK_SIGNATURE_KEY missing (required for online orders)')
  else ok.push('SQUARE_WEBHOOK_SIGNATURE_KEY set')

  const reader = await prisma.terminalReader.findUnique({ where: { name: 'COUNTER' } })
  const settings = await prisma.paymentSettings.findUnique({ where: { id: 1 } })

  if (settings?.provider === 'SQUARE') ok.push('In-store provider is SQUARE')
  else issues.push(`In-store provider is ${settings?.provider || 'STRIPE'} — set to SQUARE in Admin → Payments if using Square Terminal`)

  // The online channel is a separate field and used to go unreported here, which is how a
  // whole channel sat on the wrong provider unnoticed. Mirrors the fallback chain in
  // src/lib/paymentSettings.js so this reports what actually runs, not what the schema says.
  const onlineProvider = settings?.onlineProvider || settings?.provider || 'STRIPE'
  if (onlineProvider === 'SQUARE') {
    ok.push('Online provider is SQUARE')
  } else if ((process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test')) {
    // Not a preference — online card payments would capture no real money and still look fine.
    issues.push(`Online provider is ${onlineProvider} with a TEST Stripe key — /order card payments would succeed and capture NOTHING. Set SQUARE in Admin → Payments, or install a live Stripe key.`)
  } else {
    ok.push(`Online provider is ${onlineProvider} (deliberate split — in-store Square, online Stripe)`)
  }

  if (reader?.squareDeviceId && reader.enabled) {
    ok.push(`COUNTER reader has squareDeviceId (${reader.squareDeviceId.slice(0, 8)}…)`)
  } else {
    issues.push('COUNTER reader missing squareDeviceId or disabled — use Admin → Pair Square Terminal after production env is set')
  }

  console.log('Square production readiness\n')
  ok.forEach((line) => console.log('  OK  ', line))
  issues.forEach((line) => console.log('  FIX ', line))

  if (issues.length) {
    console.log('\nNext: set production credentials in .env, restart server, then Admin → Payments → Pair Square Terminal.')
    console.log('See docs/square-terminal-setup.md Step 2–4.')
    process.exitCode = 1
    return
  }

  console.log('\nPASS: Ready for production Square Terminal. Run Test charge $1.00 on real hardware.')
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
