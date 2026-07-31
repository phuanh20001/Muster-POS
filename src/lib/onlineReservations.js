import { prisma } from '@/lib/prisma'

const ALLOWED_RETURN_BASES = ['/order', '/onlineorder']

export function resolveReturnBase(raw) {
  const base = typeof raw === 'string' ? raw.trim() : '/order'
  return ALLOWED_RETURN_BASES.includes(base) ? base : '/order'
}

export async function claimOnlineReservations(tx, {
  voucher,
  voucherId,
  customerId,
  freeItemRedeemed,
  items,
}) {
  if (voucherId && voucher) {
    const where = {
      id: voucherId,
      active: true,
      ...(voucher.expiresAt ? { expiresAt: { gt: new Date() } } : {}),
      ...(voucher.usageLimit != null ? { timesUsed: { lt: voucher.usageLimit } } : {}),
    }
    const claimed = await tx.voucher.updateMany({
      where,
      data: { timesUsed: { increment: 1 } },
    })
    if (claimed.count === 0) {
      throw new ReservationError('This voucher is no longer available')
    }
  }

  if (freeItemRedeemed) {
    if (!customerId) throw new ReservationError('No free coffee available')
    const rows = await tx.$executeRaw`
      UPDATE "Customer"
      SET "stampsRedeemed" = "stampsRedeemed" + 1
      WHERE id = ${customerId}
      AND "stampsRedeemed" < FLOOR("stampsCollected"::numeric / 9)
    `
    if (rows === 0) throw new ReservationError('No free coffee available')
  }

  for (const item of items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: { stock: true, name: true },
    })
    if (!product || product.stock == null) continue
    const held = await tx.product.updateMany({
      where: { id: item.productId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    })
    if (held.count === 0) {
      throw new ReservationError(`${product.name} is out of stock`)
    }
  }
}

export async function releaseOnlineReservations(order) {
  if (!order?.onlineReservationsHeld) return

  if (order.voucherId) {
    await prisma.voucher.updateMany({
      where: { id: order.voucherId, timesUsed: { gt: 0 } },
      data: { timesUsed: { decrement: 1 } },
    }).catch((err) => console.error('[online reservation] voucher release:', err.message))
  }

  if (order.freeItemRedeemed && order.customerId) {
    await prisma.customer.updateMany({
      where: { id: order.customerId, stampsRedeemed: { gt: 0 } },
      data: { stampsRedeemed: { decrement: 1 } },
    }).catch((err) => console.error('[online reservation] stamp release:', err.message))
  }

  for (const item of order.items ?? []) {
    await prisma.product.updateMany({
      where: { id: item.productId, stock: { not: null } },
      data: { stock: { increment: item.quantity } },
    }).catch((err) => console.error('[online reservation] stock release:', err.message))
  }
}

export class ReservationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ReservationError'
  }
}
