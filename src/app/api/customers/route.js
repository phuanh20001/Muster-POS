import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isPublicZone } from '@/lib/zone'
import { rateLimit, clientIp } from '@/lib/ratelimit'
import { publicCustomerLookupResponse } from '@/lib/publicCustomer'
import { isValidAuPhone, normalizeAuPhone } from '@/lib/phone'

export async function GET(request) {
  try {
    const publicZone = isPublicZone(request)
    const { searchParams } = new URL(request.url)
    const phoneParam = searchParams.get('phone')
    const phone = phoneParam ? normalizeAuPhone(phoneParam.trim()) : null

    if (publicZone) {
      const rl = rateLimit(`cust-get:${clientIp(request)}`, { limit: 20, windowMs: 60000 })
      if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 })
      if (!isValidAuPhone(phone)) {
        return NextResponse.json({ error: 'Enter a valid 10-digit Australian phone number.' }, { status: 400 })
      }

      const customer = await prisma.customer.findUnique({ where: { phone } })
      return NextResponse.json(publicCustomerLookupResponse(customer))
    }

    if (phone) {
      if (!isValidAuPhone(phone)) {
        return NextResponse.json({ error: 'Enter a valid 10-digit Australian phone number.' }, { status: 400 })
      }
      const customer = await prisma.customer.findUnique({ where: { phone } })
      if (!customer) return NextResponse.json(null)
      const freeItems = Math.floor(customer.stampsCollected / 9) - customer.stampsRedeemed
      return NextResponse.json({ ...customer, freeItems })
    }

    // Manager list: capped so the payload can't grow unbounded with loyalty
    // signups over the years. An optional `q` searches name/phone SERVER-side so
    // any customer stays findable regardless of the cap (POS/public phone lookups
    // above are single-row and unaffected).
    const q = searchParams.get('q')?.trim()
    const listWhere = q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }
      : {}
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: listWhere,
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.customer.count(),
    ])
    return NextResponse.json({
      customers: customers.map((c) => ({
        ...c,
        freeItems: Math.floor(c.stampsCollected / 9) - c.stampsRedeemed,
      })),
      total,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    if (isPublicZone(request)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const name = body.name?.trim()
    const phone = normalizeAuPhone(body.phone)
    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 })
    }
    if (!isValidAuPhone(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Australian phone number.' }, { status: 400 })
    }

    const customer = await prisma.customer.create({ data: { name, phone } })
    return NextResponse.json({ ...customer, freeItems: 0 }, { status: 201 })
  } catch (e) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
