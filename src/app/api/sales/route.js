import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfLocalDay, endOfLocalDay } from '@/lib/accounting'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const search = searchParams.get('search') ?? ''
    const statusParam = searchParams.get('status')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    const where = {}

    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = startOfLocalDay(from)
      if (to) where.createdAt.lte = endOfLocalDay(to)
    }

    if (statusParam) {
      const statuses = statusParam.split(',')
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses }
    } else {
      where.status = { not: 'AWAITING_PAYMENT' }
    }

    if (search) {
      // Staff read the short ticket number off the docket ("#12"), so a numeric
      // search has to hit either that or the permanent id — the date range above
      // is what keeps a repeating ticket number down to one row.
      const numericId = parseInt(search.replace(/^#/, ''))
      if (!isNaN(numericId)) {
        where.OR = [{ id: numericId }, { dailyNumber: numericId }]
      } else if (['CASH', 'CARD', 'SPLIT'].includes(search.toUpperCase())) {
        where.paymentMethod = search.toUpperCase()
      } else {
        where.tableNumber = { contains: search, mode: 'insensitive' }
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: true,
              modifiers: true,
            },
          },
          table: true,
          user: { select: { id: true, name: true } },
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ])

    return NextResponse.json({ orders, total, page, limit })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}
