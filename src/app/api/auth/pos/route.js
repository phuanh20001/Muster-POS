import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { signPosJwt, verifyPosJwt, POS_COOKIE, clearSessionCookie, SESSION_COOKIE_OPTS, POS_MAX_AGE_SECONDS } from '@/lib/auth'
import { requestPathUrl } from '@/lib/requestUrl'
import { clientIp, credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { lockedResponse, isValidPinFormat } from '@/lib/pinAttempts'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function safeNext(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next
  return '/pos'
}

async function readCredentials(request) {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const body = await request.json()
    return { userId: body.userId, pin: body.pin }
  }
  const form = await request.formData()
  return { userId: form.get('userId'), pin: form.get('pin') }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(POS_COOKIE)?.value
    if (!token) return NextResponse.json(null, { headers: NO_STORE })
    const payload = await verifyPosJwt(token)
    if (!payload) return NextResponse.json(null, { headers: NO_STORE })
    return NextResponse.json({ id: payload.id, name: payload.name, role: payload.role }, { headers: NO_STORE })
  } catch {
    return NextResponse.json(null, { headers: NO_STORE })
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url)
    const { userId, pin } = await readCredentials(request)
    const wantsRedirect = !((request.headers.get('content-type') || '').includes('application/json'))

    if (!userId || !pin) {
      if (wantsRedirect) {
        const back = requestPathUrl(request, '/login')
        back.searchParams.set('error', 'missing')
        return NextResponse.redirect(back, 303)
      }
      return NextResponse.json({ error: 'userId and pin are required' }, { status: 400 })
    }

    if (!isValidPinFormat(pin)) {
      if (wantsRedirect) {
        const back = requestPathUrl(request, '/login')
        back.searchParams.set('error', 'pin')
        return NextResponse.redirect(back, 303)
      }
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }

    const keys = credentialKeys(clientIp(request), userId)
    const lock = credentialLocked(keys)
    if (lock.locked) {
      if (wantsRedirect) {
        const back = requestPathUrl(request, '/login')
        back.searchParams.set('error', 'locked')
        return NextResponse.redirect(back, 303)
      }
      return lockedResponse(lock)
    }

    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } })
    if (!user || user.status !== 'ACTIVE' || !user.pin) {
      // A miss counts as a failed attempt too — otherwise an attacker can spray
      // userIds indefinitely without ever tripping the per-IP lock.
      recordCredentialFailure(keys)
      if (wantsRedirect) {
        const back = requestPathUrl(request, '/login')
        back.searchParams.set('error', 'auth')
        return NextResponse.redirect(back, 303)
      }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await compare(String(pin), user.pin)
    if (!valid) {
      recordCredentialFailure(keys)
      if (wantsRedirect) {
        const back = requestPathUrl(request, '/login')
        back.searchParams.set('error', 'pin')
        return NextResponse.redirect(back, 303)
      }
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }
    clearCredentialFailures(keys)

    const token = await signPosJwt({ id: user.id, name: user.name, role: user.role })
    const cookieOpts = { ...SESSION_COOKIE_OPTS, maxAge: POS_MAX_AGE_SECONDS }

    if (wantsRedirect) {
      const dest = safeNext(url.searchParams.get('next'))
      const res = NextResponse.redirect(requestPathUrl(request, dest), 303)
      res.cookies.set(POS_COOKIE, token, cookieOpts)
      return res
    }

    const cookieStore = await cookies()
    cookieStore.set(POS_COOKIE, token, cookieOpts)
    return NextResponse.json({ ok: true, id: user.id, name: user.name, role: user.role })
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    clearSessionCookie(cookieStore, POS_COOKIE)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to lock' }, { status: 500 })
  }
}
