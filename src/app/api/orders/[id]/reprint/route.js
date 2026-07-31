import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { printOrderDockets } from '@/lib/printer'

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

    const result = await printOrderDockets(order)
    if (result.failed.length > 0) {
      return NextResponse.json(
        { ok: false, error: result.failed[0].error, failed: result.failed },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true, printed: result.printed })
  } catch {
    return NextResponse.json({ error: 'Failed to reprint order' }, { status: 500 })
  }
}
