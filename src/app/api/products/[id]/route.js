import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toDb } from '@/lib/money'

export async function PUT(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsedId = parseInt(id)

    // Replace sizes wholesale in one transaction so a failed update never
    // leaves the product with its old sizes deleted and none recreated.
    const product = await prisma.$transaction(async (tx) => {
      await tx.productSize.deleteMany({ where: { productId: parsedId } })
      return tx.product.update({
        where: { id: parsedId },
        data: {
          name: body.name,
          price: toDb(body.price),
          description: body.description,
          imageEmoji: body.imageEmoji,
          imageUrl: body.imageUrl || null,
          available: body.available,
          printer: body.printer ?? 'FRONT',
          loyaltyEnabled: body.loyaltyEnabled ?? false,
          categoryId: parseInt(body.categoryId),
          sizes: body.sizes?.length
            ? { create: body.sizes.map((s) => ({ label: s.label, price: toDb(s.price) })) }
            : undefined,
        },
        include: { category: true, sizes: { orderBy: { id: 'asc' } } },
      })
    })
    return NextResponse.json(product)
  } catch {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = {}
    if ('stock' in body) {
      data.stock = body.stock === '' || body.stock === null || body.stock === undefined
        ? null
        : parseInt(body.stock)
    }
    if ('lowStockThreshold' in body) data.lowStockThreshold = parseInt(body.lowStockThreshold)
    if ('loyaltyEnabled' in body) data.loyaltyEnabled = Boolean(body.loyaltyEnabled)
    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data,
    })
    return NextResponse.json(product)
  } catch {
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    await prisma.product.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
