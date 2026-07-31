import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signAdminJwt, verifyAdminJwt, ADMIN_COOKIE, clearSessionCookie, SESSION_COOKIE_OPTS } from '@/lib/auth'
import { clientIp, credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { lockedResponse, isValidPinFormat } from '@/lib/pinAttempts'

// Short-lived Owner (Admin) session, separate from the 1h manager session. Minted
// only by an ADMIN PIN, ~5 min, re-prompted on entry/expiry — admin power is never
// left logged in. Gates the /admin/* (Owner) area.
// Never let a browser/proxy cache the session probe — a cached `null` from before
// login (or a cached session after lock/expiry) would make the panel mis-detect auth.
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(ADMIN_COOKIE)?.value
    if (!token) return NextResponse.json(null, { headers: NO_STORE })
    const payload = await verifyAdminJwt(token)
    if (!payload) return NextResponse.json(null, { headers: NO_STORE })
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
    if (!user || user.role !== 'ADMIN' || !user.pin) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await compare(String(pin), user.pin)
    if (!valid) {
      recordCredentialFailure(keys)
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }
    clearCredentialFailures(keys)

    const token = await signAdminJwt({ id: user.id, name: user.name, role: user.role })
    const cookieStore = await cookies()
    cookieStore.set(ADMIN_COOKIE, token, {
      ...SESSION_COOKIE_OPTS,
      maxAge: 5 * 60,
    })

    return NextResponse.json({ ok: true, id: user.id, name: user.name, role: user.role })
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate' }, { status: 500 })
  }
}

// Sliding renewal: while the Owner is actively in the Admin panel (visible tab),
// the client heartbeats here to re-mint the token before it lapses. Renews ONLY a
// still-valid session — an expired/missing token returns null and sets no cookie,
// so a session that has fully lapsed still forces a PIN re-entry.
export async function PUT() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(ADMIN_COOKIE)?.value
    const payload = token ? await verifyAdminJwt(token) : null
    if (!payload) return NextResponse.json(null, { headers: NO_STORE })

    const fresh = await signAdminJwt({ id: payload.id, name: payload.name, role: payload.role })
    cookieStore.set(ADMIN_COOKIE, fresh, {
      ...SESSION_COOKIE_OPTS,
      maxAge: 5 * 60,
    })

    return NextResponse.json({ id: payload.id, name: payload.name, role: payload.role }, { headers: NO_STORE })
  } catch {
    return NextResponse.json(null, { headers: NO_STORE })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    clearSessionCookie(cookieStore, ADMIN_COOKIE)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to lock' }, { status: 500 })
  }
}
