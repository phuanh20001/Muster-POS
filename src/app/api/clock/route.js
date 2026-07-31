import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyClockEditorAccess, canEditClockTarget } from '@/lib/auth'
import { isHalfHourDate } from '@/lib/clockTime'
import { startOfLocalDay, endOfLocalDay } from '@/lib/accounting'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const userId = searchParams.get('userId')

    const where = {}
    if (date) {
      where.timestamp = { gte: startOfLocalDay(date), lte: endOfLocalDay(date) }
    }
    if (userId) where.userId = parseInt(userId)

    const records = await prisma.clockRecord.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { timestamp: 'asc' },
    })
    return NextResponse.json(records)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch clock records' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const editor = await verifyClockEditorAccess(await cookies())
    if (!editor) {
      return NextResponse.json({ error: 'Manager or admin session required' }, { status: 401 })
    }

    const body = await request.json()
    const userId = parseInt(body.userId)
    if (!userId || isNaN(userId)) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!canEditClockTarget(editor.role, target.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ts = body.timestamp ? new Date(body.timestamp) : null
    if (ts && !isHalfHourDate(ts)) {
      return NextResponse.json({ error: 'Time must be on the hour or half-hour' }, { status: 400 })
    }

    const record = await prisma.clockRecord.create({
      data: {
        userId: parseInt(body.userId),
        type: body.type,
        ...(body.timestamp ? { timestamp: new Date(body.timestamp) } : {}),
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    })
    return NextResponse.json(record, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to record clock event' }, { status: 500 })
  }
}
