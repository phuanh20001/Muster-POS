// Configures Square in the DB, then exercises the same API path as
// /admin/terminal (test charge) and /pos (charge -> finalize -> order).
// Requires dev server on localhost:3000 and .env Square credentials.
// Run: node --env-file=.env scripts/test-square-app-stack.js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const DEVICE = '9fa747a2-25ff-48ee-b078-04381f7c828f'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pollStatus(pid, maxSec = 30) {
  let current = pid
  for (let elapsed = 0; elapsed < maxSec; elapsed += 2) {
    await sleep(2000)
    const res = await fetch(`${BASE}/api/terminal/status?paymentIntentId=${encodeURIComponent(current)}`)
    const data = await res.json()
    if (data.paymentIntentId) current = data.paymentIntentId
    console.log('  poll status   :', data.status, current)
    if (data.status === 'requires_capture' || data.status === 'succeeded') {
      return { ok: true, paymentIntentId: current, status: data.status }
    }
    if (data.status === 'canceled' || (data.status === 'requires_payment_method' && data.lastError)) {
      return { ok: false, error: data.lastError || data.status }
    }
  }
  return { ok: false, error: 'timed out' }
}

async function main() {
  await prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: { provider: 'SQUARE' },
    create: { id: 1, provider: 'SQUARE', cardSurchargeType: '', cardSurchargeValue: 0, blockedBrands: [] },
  })
  await prisma.terminalReader.upsert({
    where: { name: 'COUNTER' },
    update: { squareDeviceId: DEVICE, enabled: true },
    create: { name: 'COUNTER', label: 'Counter', stripeReaderId: '', squareDeviceId: DEVICE, enabled: true },
  })
  console.log('Configured provider=SQUARE, squareDeviceId=', DEVICE)

  const chargeRes = await fetch(`${BASE}/api/terminal/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 1.0, readerName: 'COUNTER' }),
  })
  const charge = await chargeRes.json()
  if (!chargeRes.ok) throw new Error('Admin charge failed: ' + JSON.stringify(charge))
  console.log('Admin charge started:', charge.paymentIntentId)
  const admin = await pollStatus(charge.paymentIntentId)
  if (!admin.ok) throw new Error('Admin test charge failed: ' + admin.error)
  console.log('PASS: Admin $1 test charge')

  const product = await prisma.product.findFirst({ where: { available: true }, orderBy: { id: 'asc' } })
  if (!product) throw new Error('No available product in database — run npm run db:seed')

  const posChargeRes = await fetch(`${BASE}/api/terminal/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: product.price, readerName: 'COUNTER' }),
  })
  const posCharge = await posChargeRes.json()
  if (!posChargeRes.ok) throw new Error('POS charge failed: ' + JSON.stringify(posCharge))

  const posPoll = await pollStatus(posCharge.paymentIntentId)
  if (!posPoll.ok) throw new Error('POS charge poll failed: ' + posPoll.error)

  const finRes = await fetch(`${BASE}/api/terminal/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId: posPoll.paymentIntentId }),
  })
  const fin = await finRes.json()
  if (fin.status !== 'succeeded') throw new Error('Finalize failed: ' + JSON.stringify(fin))

  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'CARD',
      amountPaid: product.price,
      change: 0,
      paymentIntentId: posPoll.paymentIntentId,
      items: [{
        productId: product.id,
        quantity: 1,
        unitPrice: product.price,
        size: '',
        notes: '',
        modifiers: [],
      }],
      note: 'Square sandbox full-stack test',
    }),
  })
  const order = await orderRes.json()
  if (!orderRes.ok) throw new Error('Order create failed: ' + JSON.stringify(order))
  if (order.paymentProvider !== 'SQUARE') {
    throw new Error(`Expected paymentProvider SQUARE, got ${order.paymentProvider}`)
  }
  if (!order.paymentIntentId) throw new Error('Order missing paymentIntentId')

  console.log('PASS: POS card checkout — order #' + order.id)
  console.log('  paymentProvider :', order.paymentProvider)
  console.log('  paymentIntentId :', order.paymentIntentId)
  console.log('\n--- Result ---')
  console.log('PASS: Square sandbox full app stack (admin charge + POS order).')
}

main()
  .catch((e) => {
    console.error('FAIL:', e.message || e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
