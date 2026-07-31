import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { isValidAuPhone, normalizeAuPhone } from '@/lib/phone'

// Public order recovery: a customer who closed their tracking tab can re-enter
// the phone number they checked out with to get back the tracking link for their
// most recent ACTIVE online order. Rate-limited, and returns only the unguessable
// trackingToken plus a tiny safe projection — never the sequential id list, other
// customers' orders, payment details, or the raw note (which holds the phone).
export async function GET(request) {
  try {
    const rl = rateLimit(`order-lookup:${clientIp(request)}`, { limit: 10, windowMs: 60000 })
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const { searchParams } = new URL(request.url)
    const phone = normalizeAuPhone(searchParams.get('phone')?.trim() ?? '')
    if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })
    if (!isValidAuPhone(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Australian phone number.' }, { status: 400 })
    }

    const customer = await prisma.customer.findUnique({ where: { phone } })
    if (!customer) return NextResponse.json(null)

    // Most recent active online order for this customer (paid + still in progress).
    const order = await prisma.order.findFirst({
      where: {
        customerId: customer.id,
        source: 'ONLINE',
        status: { in: ['PENDING', 'PREPARING', 'READY'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { trackingToken: true, status: true },
    })
    if (!order?.trackingToken) return NextResponse.json(null)

    return NextResponse.json({ trackingToken: order.trackingToken, status: order.status })
  } catch {
    return NextResponse.json({ error: 'Failed to look up order' }, { status: 500 })
  }
}
