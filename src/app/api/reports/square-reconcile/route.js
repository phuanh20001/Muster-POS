import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAdminAccess } from '@/lib/auth'
import { parseReportDateRange } from '@/lib/accounting'
import { reconcileSquare } from '@/lib/squareReconcile'

export async function GET(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const { from, to, start, end } = parseReportDateRange(searchParams)

    const data = await reconcileSquare({ start, end })
    return NextResponse.json({ from, to, ...data })
  } catch {
    return NextResponse.json({ error: 'Failed to reconcile Square' }, { status: 500 })
  }
}
