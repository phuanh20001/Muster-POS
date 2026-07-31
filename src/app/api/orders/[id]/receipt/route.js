import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { printReceipt } from '@/lib/printer'

export async function POST(request, { params }) {
  try {
    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: {
        items: { include: { product: true, modifiers: true } },
        table: true,
        user: { select: { id: true, name: true } },
      },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    await printReceipt(order)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to print receipt' }, { status: 500 })
  }
}
