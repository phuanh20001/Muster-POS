import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeExpectedCash } from '@/lib/cashSession'
import { toDb } from '@/lib/money'

export async function GET() {
  try {
    const session = await prisma.cashSession.findFirst({
      where: { closedAt: null },
      orderBy: { openedAt: 'desc' },
      include: { movements: true },
    })
    if (!session) return NextResponse.json(null)

    const expectedCash = await computeExpectedCash(session, session.movements)
    return NextResponse.json({ ...session, expectedCash })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch cash session' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()

    const existing = await prisma.cashSession.findFirst({ where: { closedAt: null } })
    if (existing) return NextResponse.json({ error: 'A session is already open' }, { status: 409 })

    const session = await prisma.cashSession.create({
      data: {
        openingFloat: toDb(body.openingFloat ?? 0),
        openedById: parseInt(body.openedById),
      },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    // The partial unique index (CashSession_single_open) rejects a 2nd open
    // session if two opens race past the findFirst check above — surface it as
    // the same friendly 409, not a 500.
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A session is already open' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to open cash session' }, { status: 500 })
  }
}
