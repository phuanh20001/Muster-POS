import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { regenerateFutureForSeries, validateSeriesPayload } from '@/lib/reservationSeries'

export async function PATCH(request, { params }) {
  try {
    const access = await verifyManagerAccess(await cookies())
    if (!access) {
      return NextResponse.json({ error: 'Manager access required' }, { status: 403 })
    }

    const { id } = await params
    const seriesId = parseInt(id)
    const body = await request.json()
    const { data, error } = validateSeriesPayload(body)
    if (error) return NextResponse.json({ error }, { status: 400 })

    const series = await prisma.reservationSeries.update({
      where: { id: seriesId },
      data,
    })
    await regenerateFutureForSeries(series)

    return NextResponse.json(series)
  } catch {
    return NextResponse.json({ error: 'Failed to update recurring booking' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const access = await verifyManagerAccess(await cookies())
    if (!access) {
      return NextResponse.json({ error: 'Manager access required' }, { status: 403 })
    }

    const { id } = await params
    const seriesId = parseInt(id)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.reservation.deleteMany({
      where: { seriesId, scheduledAt: { gte: today } },
    })
    await prisma.reservationSeries.delete({ where: { id: seriesId } })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to stop recurring booking' }, { status: 500 })
  }
}
