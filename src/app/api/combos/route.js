import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDb } from '@/lib/money'
import { comboInclude, buildSlotsCreate, getOrCreateComboCategory } from '@/lib/combos'

// Combos are Products with isCombo=true (fixed price on Product.price). They
// never earn per-component stamps or carry stock, so loyaltyEnabled/stock are
// forced off here regardless of input.

export async function GET() {
  try {
    const combos = await prisma.product.findMany({
      where: { isCombo: true },
      include: comboInclude,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(combos)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch combos' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const slots = buildSlotsCreate(body.slots)
    if (slots.length === 0) {
      return NextResponse.json({ error: 'A combo needs at least one slot with an item' }, { status: 400 })
    }
    const category = await getOrCreateComboCategory()
    const combo = await prisma.product.create({
      data: {
        name: body.name,
        price: toDb(body.price ?? 0),
        description: body.description ?? '',
        imageEmoji: body.imageEmoji ?? '🍔',
        imageUrl: body.imageUrl || null,
        available: body.available ?? true,
        printer: body.printer ?? 'FRONT',
        categoryId: category.id,
        isCombo: true,
        loyaltyEnabled: false,
        stock: null,
        comboSlots: { create: slots },
      },
      include: comboInclude,
    })
    return NextResponse.json(combo, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create combo' }, { status: 500 })
  }
}
