import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { pairClockEventsForOverlap } from '@/lib/clockPairs'
import { isHalfHourHhmm } from '@/lib/clockTime'
import { clientIp, credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { lockedResponse } from '@/lib/pinAttempts'

export async function POST(request) {
  try {
    const { username, password, startTime, endTime } = await request.json()
    if (!username || !password) return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    if (!startTime || !endTime) return NextResponse.json({ error: 'Start and end time are required' }, { status: 400 })
    if (!isHalfHourHhmm(startTime) || !isHalfHourHhmm(endTime)) {
      return NextResponse.json({ error: 'Times must be on the hour or half-hour' }, { status: 400 })
    }

    const keys = credentialKeys(clientIp(request), username)
    const lock = credentialLocked(keys)
    if (lock.locked) return lockedResponse(lock)

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await compare(password, user.password)
    if (!valid) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    clearCredentialFailures(keys)

    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)

    const clockIn = new Date()
    clockIn.setHours(sh, sm, 0, 0)

    const clockOut = new Date()
    clockOut.setHours(eh, em, 0, 0)

    // Both times are stamped on the same day, so end must be after start — else a
    // 22:00->02:00 entry would store a negative-duration shift. An overnight shift
    // spanning midnight is recorded via live clock-in/out or the manager editor.
    if (clockOut <= clockIn) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const existing = await prisma.clockRecord.findMany({
      where: { userId: user.id, timestamp: { gte: startOfDay, lte: endOfDay } },
      orderBy: { timestamp: 'asc' },
    })

    const fmt = (d) => `${String(new Date(d).getHours()).padStart(2, '0')}:${String(new Date(d).getMinutes()).padStart(2, '0')}`
    const existingShifts = pairClockEventsForOverlap(existing, { openEnd: endOfDay })

    for (const shift of existingShifts) {
      if (clockIn < shift.end && clockOut > shift.start) {
        const endStr = shift.open ? 'ongoing' : fmt(shift.end)
        return NextResponse.json(
          { error: `Shift overlaps with an existing shift (${fmt(shift.start)}–${endStr})` },
          { status: 409 }
        )
      }
    }

    await prisma.clockRecord.createMany({
      data: [
        { userId: user.id, type: 'IN', timestamp: clockIn },
        { userId: user.id, type: 'OUT', timestamp: clockOut },
      ],
    })

    return NextResponse.json({ ok: true, name: user.name })
  } catch {
    return NextResponse.json({ error: 'Failed to record shift' }, { status: 500 })
  }
}
