import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkInternetReachable } from '@/lib/connectivity'
import { isPublicZone } from '@/lib/zone'
import { rateLimit, clientIp } from '@/lib/ratelimit'

export async function GET(request) {
  // Only throttle internet-facing callers (uptime monitors). The LAN POS polls
  // this for connectivity and must never be rate limited.
  if (isPublicZone(request)) {
    const rl = rateLimit(`health:${clientIp(request)}`, { limit: 30, windowMs: 60000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }
  }

  const internet = await checkInternetReachable()

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: true, internet })
  } catch {
    return NextResponse.json({ ok: false, db: false, internet }, { status: 503 })
  }
}
