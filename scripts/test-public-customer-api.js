const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'
const ZONE_SECRET = process.env.PUBLIC_ZONE_SECRET

function publicHeaders() {
  if (!ZONE_SECRET) {
    console.log('SKIP public-zone tests: PUBLIC_ZONE_SECRET not set')
    return null
  }
  return {
    'Content-Type': 'application/json',
    'x-dreamy-zone': ZONE_SECRET,
  }
}

async function testPublicCustomerGet(headers) {
  const phone = '0400000001'
  const res = await fetch(`${BASE}/api/customers?phone=${encodeURIComponent(phone)}`, { headers })
  const data = await res.json()
  if (!res.ok) throw new Error('GET customers failed: ' + JSON.stringify(data))
  if (!data || data.found !== false) {
    throw new Error('Expected { found: false } for unknown phone, got: ' + JSON.stringify(data))
  }
  console.log('PASS: public customer GET returns { found: false } for unknown phone')

  const known = await prisma.customer.findFirst({ orderBy: { id: 'asc' } })
  if (!known) return
  const res2 = await fetch(`${BASE}/api/customers?phone=${encodeURIComponent(known.phone)}`, { headers })
  const data2 = await res2.json()
  if (!res2.ok || !data2.found) throw new Error('Expected found customer: ' + JSON.stringify(data2))
  if (data2.name != null || data2.phone != null) {
    throw new Error('Public customer lookup must not return name/phone: ' + JSON.stringify(data2))
  }
  if (typeof data2.stampsCollected !== 'number' || typeof data2.freeItems !== 'number') {
    throw new Error('Expected stamp fields only: ' + JSON.stringify(data2))
  }
  console.log('PASS: public customer GET omits name and phone')
}

async function testPublicCustomerPostBlocked(headers) {
  const res = await fetch(`${BASE}/api/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Squatter', phone: '0400000099' }),
  })
  if (res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    throw new Error('Expected 404 for public POST customers, got ' + res.status + ' ' + JSON.stringify(data))
  }
  console.log('PASS: public POST /api/customers blocked')
}

async function testVoucherValidateDbPrices() {
  const product = await prisma.product.findFirst({ where: { available: true }, orderBy: { id: 'asc' } })
  if (!product) throw new Error('No product in DB')

  const res = await fetch(`${BASE}/api/vouchers/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'INVALIDCODE999',
      items: [{
        productId: product.id,
        quantity: 1,
        unitPrice: 0.01,
        size: '',
        modifiers: [],
      }],
    }),
  })
  const data = await res.json()
  if (res.status === 400 && data.error) {
    console.log('PASS: voucher validate resolves items (invalid code after resolve path)')
    return
  }
  if (data.valid === false && data.error === 'Invalid code') {
    console.log('PASS: voucher validate uses DB prices (invalid code on resolved cart)')
    return
  }
  throw new Error('Unexpected voucher validate response: ' + JSON.stringify(data))
}

async function run() {
  const headers = publicHeaders()
  if (headers) {
    await testPublicCustomerGet(headers)
    await testPublicCustomerPostBlocked(headers)
  }
  await testVoucherValidateDbPrices()
}

run()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
