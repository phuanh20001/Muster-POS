import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import {
  parseReportDateRange,
  fetchAccountingOrders,
  aggregateAccounting,
  buildSummaryCsv,
  buildOrdersCsv,
  buildPnl,
} from '@/lib/accounting'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') === 'orders' ? 'orders' : 'summary'
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const orders = await fetchAccountingOrders(prisma, start, end)
    const summary = aggregateAccounting(orders)
    if (type !== 'orders') {
      summary.pnl = await buildPnl(prisma, start, end, summary.netRevenue)
    }

    const csv = type === 'orders'
      ? buildOrdersCsv(orders)
      : buildSummaryCsv(summary, from, to)

    const filename = `dreamycafe-${type}-${from}${from !== to ? `_to_${to}` : ''}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 })
  }
}
