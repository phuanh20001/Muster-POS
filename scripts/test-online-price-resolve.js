const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function main() {
  const product = await prisma.product.findFirst({
    where: { available: true },
    orderBy: { id: 'asc' },
  })
  if (!product) throw new Error('No product in DB')

  const phone = `0499${String(Date.now()).slice(-6)}`
  const res = await fetch(`${BASE}/api/orders/online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Price resolve test',
      phone,
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
  const order = data.orderId
    ? await prisma.order.findUnique({ where: { id: data.orderId }, include: { items: true } })
    : await prisma.order.findFirst({
        where: { note: { contains: phone } },
        orderBy: { id: 'desc' },
        include: { items: true },
      })

  if (!order) {
    throw new Error('Request failed: ' + JSON.stringify(data))
  }

  const item = order.items[0]

  console.log('DB product.price:', product.price)
  console.log('Order item.unitPrice:', item.unitPrice)
  console.log('Order total:', order.total)
  console.log('HTTP status:', res.status, res.ok ? 'ok' : data.error || '')

  if (item.unitPrice !== product.price) {
    throw new Error('Server stored tampered unitPrice')
  }
  if (order.total < product.price) {
    throw new Error('Order total below menu price')
  }

  await prisma.orderItemModifier.deleteMany({ where: { orderItem: { orderId: order.id } } })
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } })
  await prisma.order.delete({ where: { id: order.id } })

  console.log('PASS: online checkout uses DB prices')
}

async function testInvalidProduct() {
  const res = await fetch(`${BASE}/api/orders/online`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bad product',
      phone: '0477777777',
      items: [{ productId: 999999, quantity: 1, unitPrice: 0.01, modifiers: [] }],
    }),
  })
  const data = await res.json()
  if (res.status !== 400 || data.error !== 'Product not found') {
    throw new Error('Expected Product not found, got: ' + JSON.stringify(data))
  }
  console.log('PASS: rejects unknown product')
}

async function run() {
  await testInvalidProduct()
  await main()
}

run()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
