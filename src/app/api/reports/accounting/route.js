import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import {
  parseReportDateRange,
  fetchAccountingOrders,
  aggregateAccounting,
  getGstConfig,
  buildPnl,
} from '@/lib/accounting'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const orders = await fetchAccountingOrders(prisma, start, end)
    const summary = aggregateAccounting(orders)
    const pnl = await buildPnl(prisma, start, end, summary.netRevenue)

    return NextResponse.json({
      from,
      to,
      gstConfig: getGstConfig(),
      ...summary,
      pnl,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch accounting report' }, { status: 500 })
  }
}
