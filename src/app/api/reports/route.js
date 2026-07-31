import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { parseReportDateRange } from '@/lib/accounting'
import { D, sum, cmp, gt } from '@/lib/money'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: 'COMPLETED',
      },
      include: {
        items: { include: { product: { include: { category: true } } } },
        user: { select: { id: true, name: true } },
      },
    })

    const revenue = sum(orders, (o) => o.total)
    const orderCount = orders.length
    const avgOrderValue = orderCount > 0 ? revenue.div(orderCount) : D(0)

    const itemCounts = {}
    for (const order of orders) {
      for (const item of order.items) {
        // Deleted products have a null productId; group those by their snapshot
        // name so they still appear in Top Items instead of crashing.
        const key = item.productId != null ? `p:${item.productId}` : `n:${item.productName}`
        if (!itemCounts[key]) {
          const product = item.product ?? { id: key, name: item.productName, imageEmoji: '🍽️', imageUrl: null }
          itemCounts[key] = { product, quantity: 0, revenue: D(0) }
        }
        itemCounts[key].quantity += item.quantity
        itemCounts[key].revenue = itemCounts[key].revenue.plus(D(item.unitPrice).times(item.quantity))
      }
    }
    const topItems = Object.values(itemCounts).sort((a, b) => b.quantity - a.quantity).slice(0, 5)

    const hourlyMap = {}
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours()
      if (!hourlyMap[hour]) hourlyMap[hour] = { revenue: D(0), count: 0 }
      hourlyMap[hour].revenue = hourlyMap[hour].revenue.plus(D(order.total))
      hourlyMap[hour].count += 1
    }
    const hourlySales = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: hourlyMap[hour]?.revenue ?? D(0),
      count: hourlyMap[hour]?.count ?? 0,
    }))

    const categoryMap = {}
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.product.category
        if (!cat) continue
        if (!categoryMap[cat.id]) {
          categoryMap[cat.id] = { categoryId: cat.id, name: cat.name, emoji: cat.emoji, revenue: D(0), quantity: 0 }
        }
        categoryMap[cat.id].revenue = categoryMap[cat.id].revenue.plus(D(item.unitPrice).times(item.quantity))
        categoryMap[cat.id].quantity += item.quantity
      }
    }
    const categoryBreakdown = Object.values(categoryMap)
      .sort((a, b) => cmp(b.revenue, a.revenue))
      .map((c) => ({ ...c, percentage: gt(revenue, 0) ? c.revenue.div(revenue).times(100).toNumber() : 0 }))

    const staffMap = {}
    for (const order of orders) {
      const key = order.userId ?? 0
      const name = order.user?.name ?? 'Unknown'
      if (!staffMap[key]) staffMap[key] = { userId: key, name, orderCount: 0, revenue: D(0) }
      staffMap[key].orderCount += 1
      staffMap[key].revenue = staffMap[key].revenue.plus(D(order.total))
    }
    const staffBreakdown = Object.values(staffMap).sort((a, b) => cmp(b.revenue, a.revenue))

    return NextResponse.json({
      from,
      to,
      date: from === to ? from : null,
      revenue,
      orderCount,
      avgOrderValue,
      topItems,
      hourlySales,
      categoryBreakdown,
      staffBreakdown,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}
