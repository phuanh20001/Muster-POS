import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import { generateForSeries, validateSeriesPayload } from '@/lib/reservationSeries'

export async function GET() {
  try {
    const series = await prisma.reservationSeries.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    return NextResponse.json(series)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch recurring bookings' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const payload = await verifyManagerAccess(await cookies())
    if (!payload) {
      return NextResponse.json({ error: 'Manager access required' }, { status: 403 })
    }

    const body = await request.json()
    const { data, error } = validateSeriesPayload(body)
    if (error) return NextResponse.json({ error }, { status: 400 })

    const series = await prisma.reservationSeries.create({
      data: { ...data, generatedThrough: data.anchorDate, createdById: payload.id ?? null },
    })
    await generateForSeries(series)

    return NextResponse.json(series, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create recurring booking' }, { status: 500 })
  }
}
