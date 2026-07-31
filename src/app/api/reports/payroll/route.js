import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyOwnerAccess } from '@/lib/auth'
import { payrollDaysFromRecords } from '@/lib/clockPairs'

export async function GET(request) {
  try {
    const payload = await verifyOwnerAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 })
    }

    const start = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T23:59:59')

    const records = await prisma.clockRecord.findMany({
      where: { timestamp: { gte: start, lte: end } },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { timestamp: 'asc' },
    })

    // Group records by userId
    const byUser = {}
    for (const r of records) {
      if (!byUser[r.userId]) {
        byUser[r.userId] = { id: r.user.id, name: r.user.name, role: r.user.role, records: [] }
      }
      byUser[r.userId].records.push(r)
    }

    const result = Object.values(byUser).map(({ id, name, role, records }) => {
      const days = payrollDaysFromRecords(records)
      const totalHours = Math.round(Object.values(days).reduce((s, d) => s + d.hours, 0) * 100) / 100
      return { id, name, role, days, totalHours }
    })

    result.sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch payroll data' }, { status: 500 })
  }
}
