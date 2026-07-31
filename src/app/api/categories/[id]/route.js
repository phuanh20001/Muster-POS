import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { name: body.name, color: body.color, emoji: body.emoji },
    })
    return NextResponse.json(category)
  } catch {
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    const productCount = await prisma.product.count({ where: { categoryId: parseInt(id) } })
    if (productCount > 0) {
      return NextResponse.json({ error: 'Cannot delete category with existing products' }, { status: 400 })
    }
    await prisma.category.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
