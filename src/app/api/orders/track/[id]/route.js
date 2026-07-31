import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public, read-only order tracking. Looked up by the order's unguessable
// trackingToken (NOT the sequential id), so orders can't be enumerated. Returns
// only what the tracking page needs — no payment method, amounts paid, cashier,
// customer record, or raw note (which holds the customer's phone number). The
// pickup name is parsed out server-side; the phone never leaves the server.
export async function GET(request, { params }) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const order = await prisma.order.findUnique({
      where: { trackingToken: id },
      select: {
        id: true,
        dailyNumber: true,
        status: true,
        total: true,
        prepMinutes: true,
        note: true,
        stampEarned: true,
        customerId: true,
        customer: {
          select: { stampsCollected: true, stampsRedeemed: true },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            size: true,
            notes: true,
            productName: true,
            product: { select: { name: true, imageEmoji: true, imageUrl: true } },
          },
        },
      },
    })
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const { note, customer, customerId, stampEarned, ...safe } = order
    const pickupName = note?.match(/Pickup: (.+?) \|/)?.[1] ?? ''

    let loyalty = null
    if (customerId && customer && order.status !== 'AWAITING_PAYMENT' && order.status !== 'CANCELLED') {
      const progress = customer.stampsCollected % 9
      loyalty = {
        progress,
        stampsEarnedThisOrder: stampEarned ?? 0,
        freeItems: Math.floor(customer.stampsCollected / 9) - customer.stampsRedeemed,
      }
    }

    return NextResponse.json({ ...safe, pickupName, loyalty })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}
