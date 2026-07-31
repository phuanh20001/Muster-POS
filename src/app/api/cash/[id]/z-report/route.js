import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { aggregateAccounting } from '@/lib/accounting'
import { computeExpectedCash } from '@/lib/cashSession'
import { buildZReportLines } from '@/lib/zReport'
import { printToReceiptPrinter } from '@/lib/printer'

export async function POST(request, { params }) {
  try {
    const manager = await verifyManagerAccess(await cookies())
    if (!manager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const session = await prisma.cashSession.findUnique({
      where: { id: parseInt(id) },
      include: { movements: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const end = session.closedAt ?? new Date()
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: session.openedAt, lte: end },
        status: { in: ['COMPLETED', 'REFUNDED'] },
      },
      include: {
        items: { include: { modifiers: true, product: { include: { category: true } } } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const summary = aggregateAccounting(orders)
    const expectedCash = session.expectedCash ?? await computeExpectedCash(session, session.movements)
    const lines = buildZReportLines({
      session: { ...session, expectedCash },
      summary,
      expectedCash,
      movements: session.movements,
    })

    await printToReceiptPrinter(lines)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[z-report]', err)
    return NextResponse.json({ error: err.message || 'Failed to print Z-report' }, { status: 500 })
  }
}
