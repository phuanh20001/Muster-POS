import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clockedInOnly = searchParams.get('clockedIn') === '1'

    if (clockedInOnly) {
      const now = new Date()
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)

      const users = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          clockRecords: { some: { timestamp: { gte: todayStart, lte: now } } },
        },
        select: {
          id: true,
          name: true,
          role: true,
          clockRecords: {
            where: { timestamp: { gte: todayStart, lte: now } },
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      })
      const result = users
        .filter((u) => u.clockRecords[0]?.type === 'IN')
        .map(({ clockRecords: _, ...u }) => u)
      return NextResponse.json(result)
    }

    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
