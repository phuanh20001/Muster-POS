import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDb } from '@/lib/money'
import { comboInclude, buildSlotsCreate, getOrCreateComboCategory } from '@/lib/combos'

export async function PUT(request, { params }) {
  try {
    const { id } = await params
    const comboId = parseInt(id)
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const slots = buildSlotsCreate(body.slots)
    if (slots.length === 0) {
      return NextResponse.json({ error: 'A combo needs at least one slot with an item' }, { status: 400 })
    }
    const category = await getOrCreateComboCategory()

    // Replacing the slots wholesale is simplest and safe — cascade removes the
    // old options, then the nested create rebuilds them.
    const combo = await prisma.$transaction(async (tx) => {
      await tx.comboSlot.deleteMany({ where: { comboId } })
      return tx.product.update({
        where: { id: comboId },
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
    })
    return NextResponse.json(combo)
  } catch {
    return NextResponse.json({ error: 'Failed to update combo' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    await prisma.product.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete combo' }, { status: 500 })
  }
}
