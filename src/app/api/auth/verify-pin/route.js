import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { clientIp, credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { lockedResponse, isValidPinFormat } from '@/lib/pinAttempts'

export async function POST(request) {
  try {
    const { userId, pin } = await request.json()
    if (!userId || !pin) return NextResponse.json({ error: 'userId and pin are required' }, { status: 400 })
    if (!isValidPinFormat(pin)) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

    const keys = credentialKeys(clientIp(request), userId)
    const lock = credentialLocked(keys)
    if (lock.locked) return lockedResponse(lock)

    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } })
    // A miss counts as a failed attempt too — otherwise an attacker can spray
    // userIds indefinitely without ever tripping the per-IP lock.
    if (!user || user.status !== 'ACTIVE' || !user.pin) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    const valid = await compare(String(pin), user.pin)
    if (!valid) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }
    clearCredentialFailures(keys)

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } })
  } catch {
    return NextResponse.json({ error: 'Failed to verify PIN' }, { status: 500 })
  }
}
