import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signManagerJwt, verifyManagerJwt, MANAGER_COOKIE, clearSessionCookie, SESSION_COOKIE_OPTS, MANAGER_MAX_AGE_SECONDS } from '@/lib/auth'
import { clientIp, credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { lockedResponse, isValidPinFormat } from '@/lib/pinAttempts'

// Never let a browser/proxy cache the session probe — a cached `null` from before
// login (or a cached session after lock) would make panels mis-detect auth state.
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(MANAGER_COOKIE)?.value
    if (!token) return NextResponse.json(null, { headers: NO_STORE })
    const payload = await verifyManagerJwt(token)
    if (!payload || !['MANAGER', 'ADMIN'].includes(payload.role)) return NextResponse.json(null, { headers: NO_STORE })
    return NextResponse.json({ id: payload.id, name: payload.name, role: payload.role }, { headers: NO_STORE })
  } catch {
    return NextResponse.json(null, { headers: NO_STORE })
  }
}

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
    if (!user || !['MANAGER', 'ADMIN'].includes(user.role) || !user.pin) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await compare(String(pin), user.pin)
    if (!valid) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }
    clearCredentialFailures(keys)

    const token = await signManagerJwt({ id: user.id, name: user.name, role: user.role })
    const cookieStore = await cookies()
    // httpOnly so the session JWT can't be read/stolen by client-side JS (XSS).
    // The client gets role/name from GET /api/auth/manager instead of the cookie.
    // Note: no `secure` flag — the in-shop POS is served over plain HTTP on the LAN.
    cookieStore.set(MANAGER_COOKIE, token, {
      ...SESSION_COOKIE_OPTS,
      maxAge: MANAGER_MAX_AGE_SECONDS,
    })

    return NextResponse.json({ ok: true, id: user.id, name: user.name, role: user.role })
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    clearSessionCookie(cookieStore, MANAGER_COOKIE)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to lock' }, { status: 500 })
  }
}
