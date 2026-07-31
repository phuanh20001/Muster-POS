import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reseedDemo } from '@/lib/demoReseed'
import { seedInto } from '../../../../../prisma/seedData'
import { rateLimit } from '@/lib/ratelimit'

// Visitor-triggered demo reset. The nightly cron is the scheduled reset; this is
// the escape hatch for when someone has already wrecked the data and the next
// cron is up to a day away — the demo PINs are published, so any visitor can
// delete the menu or change the logins.
//
// Rate limited on a single GLOBAL key rather than per IP: the thing worth
// capping is total truncations of the database, and a per-IP limit would let a
// caller rotate addresses and hammer it anyway. Blocking a legitimate reset for
// a few minutes costs nothing.
//
// Doubly guarded like the cron route: reseedDemo itself refuses unless
// NEXT_PUBLIC_DEMO === 'true', so this is inert on the shop's deployment even
// if the path were reachable.
export const dynamic = 'force-dynamic'

const WINDOW_MS = 5 * 60000

export async function POST() {
  if (process.env.NEXT_PUBLIC_DEMO !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const limit = rateLimit('demo-reset', { limit: 1, windowMs: WINDOW_MS })
  if (!limit.ok) {
    return NextResponse.json(
      { error: `The demo was reset recently. Try again in ${limit.retryAfter}s.` },
      { status: 429 }
    )
  }

  try {
    await reseedDemo(prisma, seedInto)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
