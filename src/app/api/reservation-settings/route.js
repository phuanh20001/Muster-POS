import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyManagerAccess } from '@/lib/auth'
import {
  getReservationSettings,
  MIN_REMINDER_LEAD_MINUTES,
  MAX_REMINDER_LEAD_MINUTES,
} from '@/lib/reservationSettings'

export async function GET() {
  try {
    const settings = await getReservationSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch reservation settings' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    const payload = await verifyManagerAccess(cookieStore)
    if (!payload) {
      return NextResponse.json({ error: 'Manager access required' }, { status: 403 })
    }

    const body = await request.json()
    const minutes = Number(body.reminderLeadMinutes)
    if (!Number.isInteger(minutes) || minutes < MIN_REMINDER_LEAD_MINUTES || minutes > MAX_REMINDER_LEAD_MINUTES) {
      return NextResponse.json(
        { error: `reminderLeadMinutes must be an integer between ${MIN_REMINDER_LEAD_MINUTES} and ${MAX_REMINDER_LEAD_MINUTES}` },
        { status: 400 },
      )
    }

    const settings = await prisma.reservationSettings.upsert({
      where: { id: 1 },
      update: { reminderLeadMinutes: minutes },
      create: { id: 1, reminderLeadMinutes: minutes },
    })

    return NextResponse.json({ reminderLeadMinutes: settings.reminderLeadMinutes })
  } catch {
    return NextResponse.json({ error: 'Failed to update reservation settings' }, { status: 500 })
  }
}
