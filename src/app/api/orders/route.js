import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { printOrderDockets, kickCashDrawer, printReceipt, shouldAutoPrintCardReceipt, shouldAutoPrintDockets, shouldAutoOpenDrawer } from '@/lib/printer'
import { getActiveProvider, getActiveProviderName } from '@/lib/paymentProvider'
import { setTableStatus } from '@/lib/tables'
import { evaluateVoucher } from '@/lib/voucher'
import { getFeatureSettings } from '@/lib/featureSettings'
import { itemsSubtotal } from '@/lib/orderTotals'
import { startOfLocalDay, endOfLocalDay } from '@/lib/accounting'
import { nextDailyNumber } from '@/lib/orderNumber'
import { D, roundCents, max, gt, toDb } from '@/lib/money'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const date = searchParams.get('date')
    const countOnly = searchParams.get('count') === '1'

    const source = searchParams.get('source')
    const where = {}

    if (source) where.source = source

    if (status) {
      const statuses = status.split(',')
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses }
    }

    if (date) {
      where.createdAt = { gte: startOfLocalDay(date), lte: endOfLocalDay(date) }
    }

    if (countOnly) {
      const count = await prisma.order.count({ where })
      return NextResponse.json({ count })
    }

    // Safety cap: every UI caller passes a date (one day's orders), but without
    // one this would return the ENTIRE order history + items in a single payload -
    // fine at hundreds of rows, a multi-MB response that lags the tablet after
    // years of trading. Cap unfiltered/broad queries at the most recent 500.
    const orders = await prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true, modifiers: true } },
        table: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return NextResponse.json(orders)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Order must have at least one item' }, { status: 400 })
    }

    // Idempotency: a card charge produces a payment ref, then this order is
    // recorded. If the recording POST is retried (lost response on a flaky
    // tablet, double-submit), we must NOT create a second order for the same
    // charge. Return the already-recorded order instead of ringing it twice.
    if (body.paymentIntentId) {
      const existing = await prisma.order.findFirst({
        where: { paymentIntentId: body.paymentIntentId },
        include: { items: { include: { product: true, modifiers: true } }, table: true, user: { select: { id: true, name: true } } },
      })
      if (existing) return NextResponse.json(existing, { status: 200 })
    }

    const orderItemsSubtotal = itemsSubtotal(body.items)
    const surchargeAmount = D(body.surchargeAmount ?? 0)
    const manualDiscount = D(body.manualDiscount ?? 0)
    const loyaltyDiscount = D(body.discountAmount ?? 0)

    // Voucher: recompute the discount server-side (never trust a client amount)
    // and atomically claim a use so usage limits/expiry hold even on the LAN path.
    // Claimed here; on any later failure we release it before returning.
    let voucherId = null
    let voucherDiscount = D(0)
    if (body.voucherCode) {
      const { vouchersEnabled } = await getFeatureSettings()
      if (!vouchersEnabled) return NextResponse.json({ error: 'Vouchers are disabled' }, { status: 400 })
      const code = String(body.voucherCode).trim().toUpperCase()
      const voucher = await prisma.voucher.findUnique({ where: { code } })
      const result = evaluateVoucher(voucher, orderItemsSubtotal, body.items, body.customerId ?? null)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

      const claimed = await prisma.voucher.updateMany({
        where: {
          id: voucher.id,
          active: true,
          ...(voucher.expiresAt ? { expiresAt: { gt: new Date() } } : {}),
          ...(voucher.usageLimit != null ? { timesUsed: { lt: voucher.usageLimit } } : {}),
        },
        data: { timesUsed: { increment: 1 } },
      })
      if (claimed.count === 0) {
        return NextResponse.json({ error: 'This voucher is no longer available' }, { status: 400 })
      }
      voucherId = voucher.id
      voucherDiscount = result.discount
    }

    // Floor at zero: an over-discount or bad line makes a free order, never a
    // negative-total one that would corrupt the till and reports.
    const total = max(
      roundCents(orderItemsSubtotal.plus(surchargeAmount).minus(manualDiscount).minus(loyaltyDiscount).minus(voucherDiscount)),
      D(0)
    )

    const userId = body.userId ?? null

    // When a card was charged via the terminal, confirm the payment(s) actually
    // succeeded with the active provider before recording the order as paid. A
    // split order may carry several comma-joined card-leg payment refs — verify
    // each. The provider that just charged is the active one; record it on the
    // order so refunds always route back to the same processor.
    // Release a claimed voucher use when we bail out before the order is recorded.
    const releaseVoucher = () => voucherId
      ? prisma.voucher.updateMany({ where: { id: voucherId, timesUsed: { gt: 0 } }, data: { timesUsed: { decrement: 1 } } }).catch(() => {})
      : Promise.resolve()

    const paymentIntentId = body.paymentIntentId ?? null
    const paymentProvider = await getActiveProviderName()
    if (paymentIntentId) {
      try {
        const provider = await getActiveProvider()
        const ids = paymentIntentId.split(',').filter(Boolean)
        for (const pid of ids) {
          const ok = await provider.verify(pid)
          if (!ok) {
            // The card may well be charged while we refuse the order, so leave a
            // trail — staff are told to check the terminal and refund manually.
            console.error('[order] card verify REJECTED payment %s (provider %s) — order not saved; card may be charged', pid, paymentProvider)
            await releaseVoucher()
            return NextResponse.json({ error: 'Card payment not completed' }, { status: 402 })
          }
        }
      } catch (err) {
        console.error('[order] card verify FAILED for %s (provider %s): %s — order not saved; card may be charged', paymentIntentId, paymentProvider, err.message)
        await releaseVoucher()
        return NextResponse.json({ error: 'Could not verify card payment' }, { status: 402 })
      }
    }

    const paymentMethod = body.paymentMethod ?? 'CASH'
    let cashAmount = D(0)
    if (paymentMethod === 'CASH') {
      cashAmount = total
    } else if (paymentMethod === 'SPLIT') {
      cashAmount = max(roundCents(body.cashAmount ?? 0), D(0))
    }

    const amountPaid = body.amountPaid != null ? D(body.amountPaid) : total
    const change = roundCents(amountPaid.minus(total))

    // In manual mode the number is whatever stand the cashier handed over — there
    // is no Table row behind it, so any tableId the client sent is stale.
    const { manualTableNumbers } = await getFeatureSettings()
    const tableId = manualTableNumbers ? null : (body.tableId ?? null)
    const tableManual = manualTableNumbers && Boolean(body.tableManual)

    let order
    try {
      // The ticket number is drawn inside the same transaction as the insert, so a
      // failed order hands its number back instead of leaving a hole in the day's
      // sequence. The counter row is locked for the length of this transaction —
      // milliseconds — which is what serialises two tills onto distinct numbers.
      order = await prisma.$transaction(async (tx) => {
        const { businessDate, dailyNumber } = await nextDailyNumber(tx)
        return tx.order.create({
          data: {
            businessDate,
            dailyNumber,
            total: toDb(total),
            paymentMethod,
            cashAmount: toDb(cashAmount),
            amountPaid: toDb(amountPaid),
            change: toDb(change),
            note: body.note ?? '',
            // In-store orders skip the prep workflow — done at checkout (docket prints
            // for staff to make & run). Status lifecycle is only used by ONLINE orders.
            status: 'COMPLETED',
            tableId,
            tableNumber: body.tableNumber ?? '',
            tableManual,
            userId,
            customerId: body.customerId ?? null,
            paymentIntentId,
            paymentProvider,
            voucherId,
            stampEarned: body.stampEarned ?? 0,
            freeItemRedeemed: body.freeItemRedeemed ?? false,
            discountAmount: toDb(loyaltyDiscount.plus(voucherDiscount)),
            tipAmount: toDb(0),
            surchargeType: body.surchargeType ?? '',
            surchargeValue: toDb(body.surchargeValue ?? 0),
            surchargeAmount: toDb(surchargeAmount),
            manualDiscount: toDb(manualDiscount),
            items: {
              create: body.items.map((item) => ({
                productId: item.productId,
                productName: item.productName ?? '',
                quantity: item.quantity,
                unitPrice: toDb(item.unitPrice),
                size: item.size ?? '',
                notes: item.notes ?? '',
                priceAdjustment: toDb(item.priceAdjustment ?? 0),
                priceAdjustmentNote: item.priceAdjustmentNote ?? '',
                modifiers: item.modifiers?.length
                  ? {
                      create: item.modifiers.map((m) => ({
                        name: m.name,
                        price: toDb(m.price),
                        // Combo component lines are pure snapshots (their id is a
                        // Product id, not a modifier) — store no modifier FK.
                        ...(m.source === 'category'
                          ? { categoryModifierId: m.id }
                          : m.source === 'combo'
                            ? {}
                            : { modifierId: m.id }),
                      })),
                    }
                  : undefined,
              })),
            },
          },
          include: { items: { include: { product: true, modifiers: true } }, table: true, user: { select: { id: true, name: true } } },
        })
      })
    } catch (err) {
      await releaseVoucher()
      // Two recordings of the same charge raced past the idempotency check above;
      // the unique index rejected this one. Return the order that won, not a 500.
      if (err?.code === 'P2002' && body.paymentIntentId) {
        const winner = await prisma.order.findFirst({
          where: { paymentIntentId: body.paymentIntentId },
          include: { items: { include: { product: true, modifiers: true } }, table: true, user: { select: { id: true, name: true } } },
        })
        if (winner) return NextResponse.json(winner, { status: 200 })
      }
      throw err
    }

    if (tableId) {
      await setTableStatus(tableId, 'OCCUPIED')
    }

    // Fire-and-forget like the receipt/drawer below: printOrderDockets never
    // throws (it enqueues a failed docket per station for reprint), but awaiting
    // it would block the checkout response for up to PRINT_TIMEOUT_MS *per* offline
    // station — a 10s till hang when a printer is unplugged, for dockets that are
    // already saved and queued. The order is recorded either way.
    if (await shouldAutoPrintDockets()) {
      printOrderDockets(order).catch((err) => console.error('[printer] docket error:', err))
    }

    if (await shouldAutoPrintCardReceipt()) {
      printReceipt(order).catch((err) => console.error('[printer] receipt error:', err))
    }

    if ((paymentMethod === 'CASH' || (paymentMethod === 'SPLIT' && gt(cashAmount, 0))) && await shouldAutoOpenDrawer()) {
      kickCashDrawer().catch((err) => console.error('[printer] drawer kick error:', err))
    }

    // Update loyalty stamps (fire-and-forget).
    if (body.customerId) {
      const stampsToAdd = body.stampEarned ?? 0
      if (stampsToAdd > 0) {
        prisma.customer.update({
          where: { id: body.customerId },
          data: { stampsCollected: { increment: stampsToAdd } },
        }).catch((err) => console.error('[loyalty] stamp earn error:', err))
      }
      // Redeem only if a free item is actually available — conditional so two
      // tills ringing the same customer's last free coffee can't both redeem it
      // (guard: stampsRedeemed < floor(stampsCollected/9)).
      if (body.freeItemRedeemed) {
        prisma.$executeRaw`
          UPDATE "Customer"
          SET "stampsRedeemed" = "stampsRedeemed" + 1
          WHERE id = ${body.customerId}
          AND "stampsRedeemed" < FLOOR("stampsCollected"::numeric / 9)
        `.catch((err) => console.error('[loyalty] redeem error:', err))
      }
    }

    // Auto-decrement stock for tracked products (fire-and-forget). Floor at 0 via
    // GREATEST so an oversell (or a race between two tills) can't drive stock
    // negative — the count stops at 0 rather than blocking the sale.
    Promise.all(
      body.items.map((item) =>
        prisma.$executeRaw`
          UPDATE "Product"
          SET "stock" = GREATEST("stock" - ${item.quantity}, 0)
          WHERE id = ${item.productId} AND "stock" IS NOT NULL
        `
      )
    ).catch((err) => console.error('[stock] decrement error:', err))

    return NextResponse.json(order, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
