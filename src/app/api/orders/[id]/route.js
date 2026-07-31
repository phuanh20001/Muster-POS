import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { setTableStatus } from '@/lib/tables'

export async function GET(request, { params }) {
  try {
    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: { items: { include: { product: true } }, table: true },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const orderId = parseInt(id)
    const body = await request.json()

    // Setting a prep estimate (online order acknowledged) advances it to PREPARING.
    const data = {}
    if (body.prepMinutes != null) {
      const minutes = parseInt(body.prepMinutes)
      if (isNaN(minutes) || minutes <= 0) {
        return NextResponse.json({ error: 'prepMinutes must be a positive integer' }, { status: 400 })
      }
      data.prepMinutes = minutes
      data.status = 'PREPARING'
    }
    if (body.status) data.status = body.status

    const order = await prisma.order.update({
      where: { id: orderId },
      data,
      include: { items: { include: { product: true } }, table: true },
    })

    // Only free the table on CANCELLED — customer left without being served.
    // COMPLETED means food delivered; customer is still eating. Staff free the table manually.
    if (body.status === 'CANCELLED' && order.tableId) {
      // Grouped tables seat one party — only free when no member has an active order.
      const table = await prisma.table.findUnique({ where: { id: order.tableId } })
      const memberIds = table?.groupId
        ? (await prisma.table.findMany({ where: { groupId: table.groupId }, select: { id: true } })).map((t) => t.id)
        : [order.tableId]
      const activeOrders = await prisma.order.count({
        where: { tableId: { in: memberIds }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      })
      if (activeOrders === 0) {
        await setTableStatus(order.tableId, 'AVAILABLE')
      }
    }

    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
