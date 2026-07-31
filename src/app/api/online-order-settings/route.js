import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { getOnlineOrderStatus, isValidTime } from '@/lib/onlineOrderSettings'

export async function GET() {
  try {
    const status = await getOnlineOrderStatus()
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch online order settings' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    if (!(await verifyAdminAccess(cookieStore))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const data = {}

    if ('hoursEnabled' in body) data.hoursEnabled = Boolean(body.hoursEnabled)
    if ('acceptingOrders' in body) data.acceptingOrders = Boolean(body.acceptingOrders)
    if ('closedMessage' in body) {
      data.closedMessage = String(body.closedMessage ?? '').trim().slice(0, 200)
    }

    // Per-day hours: [{ dayOfWeek, closed, openTime, closeTime }, …]
    let hours = null
    if ('hours' in body) {
      if (!Array.isArray(body.hours) || body.hours.length === 0) {
        return NextResponse.json({ error: 'hours must be a non-empty array' }, { status: 400 })
      }
      const seen = new Set()
      for (const h of body.hours) {
        if (!Number.isInteger(h?.dayOfWeek) || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
          return NextResponse.json({ error: 'Each day needs a dayOfWeek of 0-6' }, { status: 400 })
        }
        if (seen.has(h.dayOfWeek)) {
          return NextResponse.json({ error: 'Duplicate dayOfWeek in hours' }, { status: 400 })
        }
        seen.add(h.dayOfWeek)
        if (!isValidTime(h.openTime) || !isValidTime(h.closeTime)) {
          return NextResponse.json({ error: 'Times must be in HH:MM 24-hour format' }, { status: 400 })
        }
      }
      hours = body.hours
    }

    if (Object.keys(data).length === 0 && !hours) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    // One transaction so a partial write can't leave the shop on a half-saved week.
    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.onlineOrderSettings.upsert({
          where: { id: 1 },
          update: data,
          create: { id: 1, ...data },
        })
      }
      for (const h of hours ?? []) {
        const row = {
          closed: Boolean(h.closed),
          openTime: h.openTime,
          closeTime: h.closeTime,
        }
        await tx.onlineOrderHours.upsert({
          where: { dayOfWeek: h.dayOfWeek },
          update: row,
          create: { dayOfWeek: h.dayOfWeek, ...row },
        })
      }
    })

    return NextResponse.json(await getOnlineOrderStatus())
  } catch {
    return NextResponse.json({ error: 'Failed to update online order settings' }, { status: 500 })
  }
}
