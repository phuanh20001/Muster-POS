import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reseedDemo } from '@/lib/demoReseed'
import { seedInto } from '../../../../../prisma/seedData'

// Nightly demo reset, invoked by the Vercel Cron entry in vercel.json. Vercel
// signs cron requests with the CRON_SECRET as a Bearer token; we reject anything
// that doesn't carry it so a visitor can't wipe the demo on demand. Doubly
// guarded: reseedDemo itself refuses unless NEXT_PUBLIC_DEMO === 'true', so this
// route is inert on a non-demo deployment even if it were reachable.
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await reseedDemo(prisma, seedInto)
    return NextResponse.json({ ok: true, reseededAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
