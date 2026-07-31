import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfLocalDay, endOfLocalDay } from '@/lib/accounting'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (date) {
      const movements = await prisma.cashMovement.findMany({
        where: { createdAt: { gte: startOfLocalDay(date), lte: endOfLocalDay(date) } },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json(movements)
    }

    const session = await prisma.cashSession.findFirst({
      where: { closedAt: null },
      orderBy: { openedAt: 'desc' },
    })
    if (!session) return NextResponse.json([])
    const movements = await prisma.cashMovement.findMany({
      where: { cashSessionId: session.id },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(movements)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { type, amount, note, userId } = await request.json()
    if (!type || !amount) return NextResponse.json({ error: 'type and amount are required' }, { status: 400 })
    if (!['IN', 'OUT'].includes(type)) return NextResponse.json({ error: 'type must be IN or OUT' }, { status: 400 })
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })

    const session = await prisma.cashSession.findFirst({
      where: { closedAt: null },
      orderBy: { openedAt: 'desc' },
    })

    const movement = await prisma.cashMovement.create({
      data: {
        type,
        amount: parsedAmount,
        note: note ?? '',
        cashSessionId: session?.id ?? null,
        userId: userId ?? null,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    })
    return NextResponse.json(movement, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to record movement' }, { status: 500 })
  }
}
