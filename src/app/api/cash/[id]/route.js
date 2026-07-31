import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeExpectedCash } from '@/lib/cashSession'
import { D, roundCents, toDb } from '@/lib/money'

export async function GET(request, { params }) {
  try {
    const { id } = await params
    const session = await prisma.cashSession.findUnique({
      where: { id: parseInt(id) },
      include: { movements: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const expectedCash = await computeExpectedCash(session, session.movements)
    return NextResponse.json({ ...session, expectedCash })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const sessionId = parseInt(id)
    const body = await request.json()

    const closingCash = D(parseFloat(body.closingCash))
    if (closingCash.isNaN() || closingCash.lt(0)) {
      return NextResponse.json({ error: 'Enter a valid closing cash amount' }, { status: 400 })
    }

    // Close atomically: compute expected and flip closedAt in one transaction, and
    // only if the session is still open. This stops a re-submitted close from
    // overwriting an already-closed count, and stops a movement landing between
    // the expected calc and the close from being silently dropped.
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.cashSession.findUnique({
        where: { id: sessionId },
        include: { movements: true },
      })
      if (!session) return { error: 'not_found' }
      if (session.closedAt) return { error: 'already_closed' }

      const expectedCash = await computeExpectedCash(session, session.movements)
      const variance = roundCents(closingCash.minus(expectedCash))

      const closed = await tx.cashSession.updateMany({
        where: { id: sessionId, closedAt: null },
        data: {
          closedAt: new Date(),
          closingCash: toDb(closingCash),
          expectedCash: toDb(expectedCash),
          variance: toDb(variance),
          closedById: body.closedById ? parseInt(body.closedById) : null,
          note: body.note ?? '',
        },
      })
      if (closed.count === 0) return { error: 'already_closed' }
      return { session: await tx.cashSession.findUnique({ where: { id: sessionId } }) }
    })

    if (result.error === 'not_found') return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (result.error === 'already_closed') return NextResponse.json({ error: 'This session is already closed' }, { status: 409 })
    return NextResponse.json(result.session)
  } catch {
    return NextResponse.json({ error: 'Failed to close session' }, { status: 500 })
  }
}
