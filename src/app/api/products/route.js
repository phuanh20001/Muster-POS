import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDb } from '@/lib/money'
import { getFeatureSettings } from '@/lib/featureSettings'
import { isPublicZone } from '@/lib/zone'
import { rateLimit, clientIp } from '@/lib/ratelimit'

const MENU_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'

function publicMenuProducts(products, productImagesEnabled) {
  return products
    .filter((p) => !p.isCombo)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description,
      imageEmoji: p.imageEmoji,
      imageUrl: productImagesEnabled ? p.imageUrl : null,
      available: p.available,
      loyaltyEnabled: p.loyaltyEnabled,
      categoryId: p.categoryId,
      category: p.category
        ? {
            id: p.category.id,
            name: p.category.name,
            color: p.category.color,
            emoji: p.category.emoji,
            modifiers: p.category.modifiers,
          }
        : undefined,
      sizes: p.sizes,
      modifiers: p.modifiers,
    }))
}

export async function GET(request) {
  try {
    if (isPublicZone(request)) {
      const rl = rateLimit(`products:${clientIp(request)}`, { limit: 60, windowMs: 60000 })
      if (!rl.ok) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
        )
      }
    }

    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('categoryId')

    const products = await prisma.product.findMany({
      where: categoryId ? { categoryId: parseInt(categoryId) } : undefined,
      include: {
        category: { include: { modifiers: { where: { available: true }, orderBy: { id: 'asc' } } } },
        sizes: { orderBy: { id: 'asc' } },
        modifiers: { where: { available: true }, orderBy: { id: 'asc' } },
        comboSlots: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { include: { product: { select: { id: true, name: true, imageEmoji: true } } } } },
        },
      },
      orderBy: { name: 'asc' },
    })
    const { productImagesEnabled } = await getFeatureSettings()
    const result = isPublicZone(request)
      ? publicMenuProducts(products, productImagesEnabled)
      : (productImagesEnabled ? products : products.map((p) => ({ ...p, imageUrl: null })))
    return NextResponse.json(result, { headers: { 'Cache-Control': MENU_CACHE } })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const product = await prisma.product.create({
      data: {
        name: body.name,
        price: toDb(body.price),
        description: body.description ?? '',
        imageEmoji: body.imageEmoji ?? '☕',
        imageUrl: body.imageUrl || null,
        available: body.available ?? true,
        loyaltyEnabled: body.loyaltyEnabled ?? false,
        printer: body.printer ?? 'FRONT',
        categoryId: parseInt(body.categoryId),
        sizes: body.sizes?.length
          ? { create: body.sizes.map((s) => ({ label: s.label, price: toDb(s.price) })) }
          : undefined,
        modifiers: body.modifiers?.length
          ? { create: body.modifiers.map((m) => ({ name: m.name, price: toDb(m.price), available: m.available ?? true })) }
          : undefined,
      },
      include: { category: true, sizes: { orderBy: { id: 'asc' } } },
    })
    return NextResponse.json(product, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
