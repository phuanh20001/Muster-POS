import { prisma } from '@/lib/prisma'
import { printOrderDockets, shouldAutoPrintDockets } from '@/lib/printer'
import { parsePickupNote } from '@/lib/onlineOrderItems'
import { nextDailyNumber } from '@/lib/orderNumber'
import { toDb } from '@/lib/money'

// Promotes a paid online order from AWAITING_PAYMENT to PENDING and runs the
// one-time side effects (loyalty stamps, voucher usage, stock, printing).
//
// Idempotent: the status flip is an atomic conditional update, so whichever
// caller wins the race (webhook OR the success-page fallback) runs the side
// effects exactly once; later callers are no-ops.
export async function fulfillPaidOrder(orderId, { checkoutRef, paymentRef, paymentProvider } = {}) {
  // Online orders are created with amountPaid/change = 0 while AWAITING_PAYMENT
  // (no money has moved yet). Now that payment is confirmed, backfill
  // amountPaid = total (exact-charge card payment, no change) so the receipt and
  // order detail read "$X paid" like an in-person card tap, not "$0.00 paid".
  // updateMany can't copy the row's own total into amountPaid, so read it first;
  // the status-flip in `where` still makes the claim atomic and exactly-once.
  const pending = await prisma.order.findUnique({
    where: { id: orderId },
    select: { total: true },
  })
  if (!pending) return false

  const claim = await prisma.order.updateMany({
    where: { id: orderId, status: 'AWAITING_PAYMENT' },
    data: {
      status: 'PENDING',
      amountPaid: toDb(pending.total),
      change: toDb(0),
      ...(checkoutRef ? { checkoutRef } : {}),
      ...(paymentRef ? { paymentIntentId: paymentRef } : {}),
      ...(paymentProvider ? { paymentProvider } : {}),
    },
  })
  if (claim.count === 0) return false

  // Ticket number is drawn here, not when the checkout row was created: an online
  // order only joins the queue once it is paid, so abandoned checkouts must not
  // burn numbers, and the ticket should be dated by the day it is actually made and
  // printed. Riding on the status-flip claim above means this runs exactly once per
  // order, whichever caller wins the race. Never fatal — an unnumbered docket falls
  // back to the order id, so a hiccup here must not cost the customer their stamps
  // or leave a paid order sitting unprinted.
  try {
    const { businessDate, dailyNumber } = await nextDailyNumber(prisma)
    await prisma.order.update({
      where: { id: orderId },
      data: { businessDate, dailyNumber },
    })
  } catch (err) {
    console.error('[order] daily number assign failed for order %s: %s', orderId, err.message)
  }

  let order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true, modifiers: true } },
      table: true,
      user: { select: { id: true, name: true } },
    },
  })
  if (!order) return false

  let customerId = order.customerId

  if (!customerId && order.source === 'ONLINE') {
    const pickup = parsePickupNote(order.note)
    if (pickup) {
      let customer = await prisma.customer.findUnique({ where: { phone: pickup.phone } })
      if (!customer) {
        // Two orders from the same new phone can fulfil concurrently (each wins
        // its own status-flip), racing this create. Customer.phone is unique, so
        // the loser would throw P2002 and abort fulfillment (losing that order's
        // stamps). Treat a lost race as "already created" and re-fetch the winner.
        try {
          customer = await prisma.customer.create({
            data: { name: pickup.name, phone: pickup.phone },
          })
        } catch (err) {
          if (err?.code !== 'P2002') throw err
          customer = await prisma.customer.findUnique({ where: { phone: pickup.phone } })
        }
      }
      if (customer) {
        customerId = customer.id
        await prisma.order.update({
          where: { id: order.id },
          data: { customerId },
        })
        order = { ...order, customerId }
      }
    }
  }

  const stampEarned = order.items.reduce(
    (sum, item) => sum + (item.product.loyaltyEnabled ? item.quantity : 0),
    0
  )
  if (customerId && stampEarned > 0) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { stampsCollected: { increment: stampEarned } },
    })
    await prisma.order.update({ where: { id: order.id }, data: { stampEarned } })
  }

  if (!order.onlineReservationsHeld) {
    if (order.freeItemRedeemed && customerId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { stampsRedeemed: { increment: 1 } },
      })
    }

    if (order.voucherId) {
      await prisma.voucher.update({
        where: { id: order.voucherId },
        data: { timesUsed: { increment: 1 } },
      }).catch((err) => console.error('[voucher] usage increment error:', err))
    }

    // Floor at 0 via GREATEST so an oversell can't drive stock negative (stock 1,
    // qty 3 -> 0, not -2) — matches POST /api/orders. Reached only if an order was
    // ever created without pre-held reservations; today all online orders pre-hold.
    Promise.all(
      order.items.map((item) =>
        prisma.$executeRaw`
          UPDATE "Product"
          SET "stock" = GREATEST("stock" - ${item.quantity}, 0)
          WHERE id = ${item.productId} AND "stock" IS NOT NULL
        `
      )
    ).catch((err) => console.error('[stock] decrement error:', err))
  }

  // Fire-and-forget: printOrderDockets never throws (it queues a failed docket per
  // station for reprint), but awaiting it would block the webhook ack for up to
  // PRINT_TIMEOUT_MS per offline station. A slow ack invites the payment provider
  // to retry-deliver the webhook (harmless — the status-flip above is idempotent —
  // but pointless). The order is already fulfilled; printing is a pure side effect.
  if (await shouldAutoPrintDockets()) {
    printOrderDockets(order).catch((err) => console.error('[printer] docket error:', err))
  }

  return true
}
