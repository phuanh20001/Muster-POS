import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('alerts') === '1') {
    try {
      const items = await prisma.stockItem.findMany({
        where: { quantity: { not: null } },
        select: { id: true, name: true, quantity: true, lowStockThreshold: true },
      })
      const alerts = items.filter((i) => i.quantity <= i.lowStockThreshold)
      return NextResponse.json(alerts)
    } catch {
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
    }
  }

  // original full stock GET below
  return getFullStock()
}

async function getFullStock() {
  try {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const [products, orderItems] = await Promise.all([
      prisma.product.findMany({
        include: { category: true, sizes: { orderBy: { id: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
          },
        },
        select: { productId: true, quantity: true },
      }),
    ])

    const soldMap = {}
    for (const item of orderItems) {
      soldMap[item.productId] = (soldMap[item.productId] ?? 0) + item.quantity
    }

    const result = products.map((p) => ({ ...p, soldToday: soldMap[p.id] ?? 0 }))
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stock data' }, { status: 500 })
  }
}

