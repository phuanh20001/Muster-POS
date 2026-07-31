import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyAdminOrManagerAccess } from '@/lib/auth'
import { getStripe, resolveReaderId } from '@/lib/terminal'
import { getSquare, resolveSquareDeviceId, squareLocationId } from '@/lib/square'
import { getActiveProviderName, PROVIDERS } from '@/lib/paymentProvider'

// LAN-only (gated by proxy.js zone). Returns saved config + whether a terminal
// is usable for the ACTIVE provider. With ?stripe=1 it also lists live Stripe
// readers; with ?square=1 it lists paired Square devices (admin_session or
// manager_session required).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const readers = await prisma.terminalReader.findMany({ orderBy: { id: 'asc' } })
    const provider = await getActiveProviderName()
    const enabled =
      provider === PROVIDERS.SQUARE
        ? (await resolveSquareDeviceId()) != null
        : (await resolveReaderId()) != null

    let stripeReaders
    let squareDevices
    const authed = await verifyAdminOrManagerAccess(await cookies())

    if (searchParams.get('stripe') === '1' && authed) {
      try {
        const list = await getStripe().terminal.readers.list({ limit: 100 })
        stripeReaders = list.data.map((r) => ({
          id: r.id,
          label: r.label,
          status: r.status,
          deviceType: r.device_type,
        }))
      } catch (err) {
        stripeReaders = { error: err.message }
      }
    }

    if (searchParams.get('square') === '1' && authed) {
      try {
        const locationId = squareLocationId()
        const res = await getSquare().devices.list({
          sortOrder: 'DESC',
          ...(locationId ? { locationId } : {}),
        })
        const devices = res.data || res.result?.devices || []
        squareDevices = devices.map((d) => ({
          id: d.id,
          label: d.attributes?.name || d.name || d.id,
          status: d.status?.category || '',
          deviceType: d.attributes?.type || '',
        }))
      } catch (err) {
        squareDevices = { error: err.message }
      }
    }

    return NextResponse.json({ enabled, provider, readers, stripeReaders, squareDevices })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch readers' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    if (!(await verifyAdminOrManagerAccess(await cookies()))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
    const name = (body.name || 'COUNTER').trim()

    const reader = await prisma.terminalReader.upsert({
      where: { name },
      update: {
        label: body.label ?? '',
        stripeReaderId: body.stripeReaderId ?? '',
        squareDeviceId: body.squareDeviceId ?? '',
        enabled: body.enabled ?? true,
      },
      create: {
        name,
        label: body.label ?? '',
        stripeReaderId: body.stripeReaderId ?? '',
        squareDeviceId: body.squareDeviceId ?? '',
        enabled: body.enabled ?? true,
      },
    })
    return NextResponse.json(reader)
  } catch {
    return NextResponse.json({ error: 'Failed to save reader' }, { status: 500 })
  }
}
