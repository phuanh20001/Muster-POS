import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isPublicZone } from '@/lib/zone'
import { rateLimit, clientIp } from '@/lib/ratelimit'

const MENU_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'

export async function GET(request) {
  try {
    if (isPublicZone(request)) {
      const rl = rateLimit(`categories:${clientIp(request)}`, { limit: 60, windowMs: 60000 })
      if (!rl.ok) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
        )
      }
    }

    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    return NextResponse.json(categories, { headers: { 'Cache-Control': MENU_CACHE } })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const category = await prisma.category.create({
      data: {
        name: body.name,
        color: body.color ?? '#6B7280',
        emoji: body.emoji ?? '☕',
      },
    })
    return NextResponse.json(category, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
