import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminAccess } from '@/lib/auth'
import { getShiftSettings } from '@/lib/shiftSettings'

export async function GET() {
  try {
    const settings = await getShiftSettings()
    return NextResponse.json(settings)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch shift settings' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const cookieStore = await cookies()
    const payload = await verifyAdminAccess(cookieStore)
    if (!payload) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    if (typeof body.shiftRoutineEnabled !== 'boolean') {
      return NextResponse.json({ error: 'shiftRoutineEnabled must be a boolean' }, { status: 400 })
    }

    const settings = await prisma.shiftSettings.upsert({
      where: { id: 1 },
      update: { shiftRoutineEnabled: body.shiftRoutineEnabled },
      create: { id: 1, shiftRoutineEnabled: body.shiftRoutineEnabled },
    })

    return NextResponse.json({ shiftRoutineEnabled: settings.shiftRoutineEnabled })
  } catch {
    return NextResponse.json({ error: 'Failed to update shift settings' }, { status: 500 })
  }
}
