import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getProvider } from '@/lib/paymentProvider'
import { D, roundCents, gt, lt, toDb } from '@/lib/money'

export async function POST(request, { params }) {
  try {
    const manager = await verifyManagerAccess(await cookies())
    if (!manager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const body = await request.json()

    const order = await prisma.order.findUnique({ where: { id: parseInt(id) } })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed orders can be refunded' }, { status: 400 })
    }

    // Cash leaving the drawer on refund: full total for CASH, the cashier-entered
    // "cash returned" for SPLIT (card legs go back via Stripe, not the till), 0 otherwise.
    let cashOut = D(0)
    if (order.paymentMethod === 'CASH') {
      cashOut = D(order.total)
    } else if (order.paymentMethod === 'SPLIT') {
      const defaultCash = gt(order.cashAmount, 0) ? D(order.cashAmount) : D(order.total)
      const entered = body.cashReturned != null ? D(parseFloat(body.cashReturned)) : defaultCash
      if (entered.isNaN() || lt(entered, 0) || gt(entered, order.total)) {
        return NextResponse.json({ error: 'Invalid cash returned amount' }, { status: 400 })
      }
      cashOut = roundCents(entered)
    }

    // Cash physically leaving the drawer must be logged against an OPEN session,
    // or the OUT movement is orphaned (cashSessionId: null) and no Z-report ever
    // subtracts it — the drawer then reads permanently over by this amount.
    // Fail before any processor refund so nothing partially completes.
    if (gt(cashOut, 0)) {
      const openSession = await prisma.cashSession.findFirst({ where: { closedAt: null } })
      if (!openSession) {
        return NextResponse.json(
          { error: 'Open a till session before refunding cash — otherwise the drawer count will not balance.' },
          { status: 409 },
        )
      }
    }

    // Card (Terminal / online) orders carry a payment ref — issue a real refund
    // before marking the order. Refunds must go back through the SAME processor
    // that charged it, so route by the order's stored provider (not the current
    // active one). Split orders may carry several comma-joined card-leg refs;
    // refund each. If the processor refuses, don't mark refunded.
    if (order.paymentIntentId) {
      const provider = getProvider(order.paymentProvider)
      try {
        const ids = order.paymentIntentId.split(',').filter(Boolean)
        for (const pid of ids) {
          await provider.refund(pid)
        }
      } catch (err) {
        // A real money event: the processor refused to return the customer's money.
        // Leave a trail (order, provider, ref) — the order stays COMPLETED, so staff
        // must retry or refund by hand in the processor dashboard.
        console.error('[refund] processor REFUSED for order %s (provider %s, refs %s): %s', id, order.paymentProvider, order.paymentIntentId, err.message)
        return NextResponse.json({ error: `Refund failed: ${err.message}` }, { status: 502 })
      }
    }

    // Mark refunded and, when cash physically left the till, log an OUT movement so
    // the open session's expected cash drops and the drawer history explains it.
    // Both in one transaction so a movement never exists without the refund.
    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: parseInt(id) },
        data: { status: 'REFUNDED', refundNote: body.refundNote ?? '' },
      })
      if (gt(cashOut, 0)) {
        const session = await tx.cashSession.findFirst({
          where: { closedAt: null },
          orderBy: { openedAt: 'desc' },
        })
        // Re-check inside the tx: if the session closed between the guard above
        // and here, roll the whole refund back rather than write an orphaned
        // OUT movement (cashSessionId: null) that no Z-report would net out.
        if (!session) throw new Error('NO_OPEN_SESSION')
        await tx.cashMovement.create({
          data: {
            type: 'OUT',
            amount: toDb(cashOut),
            note: `Refund order #${o.id}`,
            cashSessionId: session.id,
            userId: manager.id ?? null,
          },
        })
      }
      return o
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (err?.message === 'NO_OPEN_SESSION') {
      return NextResponse.json(
        { error: 'The till session closed during the refund. Re-open a session and try again.' },
        { status: 409 },
      )
    }
    console.error('[refund] unexpected failure: %s', err?.message)
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 })
  }
}
