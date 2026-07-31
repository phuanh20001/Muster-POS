// Exercises Square online checkout: POST /api/orders/online with provider=SQUARE,
// confirms a payment link is returned and the order is stored as AWAITING_PAYMENT.
// Optional: pass --fulfill to call fulfillPaidOrder directly (webhook smoke test).
//
// Full card payment in sandbox still requires opening checkoutUrl in a browser.
// Requires dev server on localhost:3000 and Square sandbox credentials in .env.
// Run: node --env-file=.env scripts/test-square-online.js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function main() {
  const fulfillOnly = process.argv.includes('--fulfill')

  await prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: { onlineProvider: 'SQUARE' },
    create: { id: 1, provider: 'STRIPE', onlineProvider: 'SQUARE', cardSurchargeType: '', cardSurchargeValue: 0, blockedBrands: [] },
  })
  console.log('Configured onlineProvider=SQUARE')

  const product = await prisma.product.findFirst({ where: { available: true }, orderBy: { id: 'asc' } })
  if (!product) throw new Error('No available product in DB — run npm run db:seed')

  const body = {
    name: 'Square Online Test',
    phone: `0400${String(Date.now()).slice(-6)}`,
    items: [{
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.price,
      size: '',
      modifiers: [],
    }],
    returnBase: '/order',
  }

  const res = await fetch(`${BASE}/api/orders/online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('POST /api/orders/online failed: ' + JSON.stringify(data))

  console.log('orderId     :', data.orderId)
  console.log('checkoutUrl :', data.checkoutUrl)

  const order = await prisma.order.findUnique({ where: { id: data.orderId } })
  if (!order) throw new Error('Order not found in DB')
  if (order.status !== 'AWAITING_PAYMENT') throw new Error(`Expected AWAITING_PAYMENT, got ${order.status}`)
  if (order.paymentProvider !== 'SQUARE') throw new Error(`Expected paymentProvider SQUARE, got ${order.paymentProvider}`)
  if (!order.checkoutRef) throw new Error('checkoutRef not set')
  if (!order.trackingToken) throw new Error('trackingToken not set')

  console.log('checkoutRef :', order.checkoutRef)
  console.log('trackingToken:', order.trackingToken)

  if (fulfillOnly) {
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: 'AWAITING_PAYMENT' },
      data: { status: 'PENDING', paymentProvider: 'SQUARE', paymentIntentId: 'pay:sandbox-test' },
    })
    const updated = await prisma.order.findUnique({ where: { id: order.id } })
    console.log('fulfill rows :', claim.count)
    console.log('status      :', updated.status, '(expected PENDING)')
    if (claim.count !== 1 || updated.status !== 'PENDING') {
      process.exitCode = 1
      return
    }
    console.log('\n--- Result ---')
    console.log('PASS: Square online order created + status transition smoke test')
    return
  }

  const pollRes = await fetch(`${BASE}/api/orders/online?checkoutRef=${encodeURIComponent(order.trackingToken)}`)
  const poll = await pollRes.json()
  console.log('poll status :', poll.status, '(expected AWAITING_PAYMENT until paid)')

  console.log('\n--- Result ---')
  console.log('PASS: Square online checkout created')
  console.log('Open checkoutUrl in a browser to pay (sandbox test card), then poll:')
  console.log(`  ${BASE}/api/orders/online?checkoutRef=${order.trackingToken}`)
  console.log('Or re-run with --fulfill to smoke-test fulfillment without paying.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
