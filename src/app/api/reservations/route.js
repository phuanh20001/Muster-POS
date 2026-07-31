import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { topUpActiveSeries } from '@/lib/reservationSeries'
import { startOfLocalDay, endOfLocalDay } from '@/lib/accounting'

export async function GET(request) {
  try {
    await topUpActiveSeries()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const status = searchParams.get('status')

    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where = {}

    if (date) {
      where.scheduledAt = { gte: startOfLocalDay(date), lte: endOfLocalDay(date) }
    } else if (from || to) {
      where.scheduledAt = {}
      if (from) where.scheduledAt.gte = startOfLocalDay(from)
      if (to) where.scheduledAt.lte = endOfLocalDay(to)
    }

    if (status) {
      where.status = status
    }

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    return NextResponse.json(reservations)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { name, phone, scheduledAt, partySize, note } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Guest name is required' }, { status: 400 })
    }
    if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
      return NextResponse.json({ error: 'Valid date and time are required' }, { status: 400 })
    }
    const size = parseInt(partySize)
    if (!partySize || isNaN(size) || size < 1) {
      return NextResponse.json({ error: 'Party size must be at least 1' }, { status: 400 })
    }
    // Cap server-side to match the form's max; the API can't trust the client's
    // bound, and an unbounded parseInt would overflow the Int column into a 500.
    if (size > 100) {
      return NextResponse.json({ error: 'Party size cannot exceed 100' }, { status: 400 })
    }

    const reservation = await prisma.reservation.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        scheduledAt: new Date(scheduledAt),
        partySize: size,
        note: note?.trim() || null,
        status: 'CONFIRMED',
      },
    })

    return NextResponse.json(reservation, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 })
  }
}
