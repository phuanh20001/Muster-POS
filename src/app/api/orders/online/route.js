import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateVoucher } from '@/lib/voucher'
import { fulfillPaidOrder } from '@/lib/fulfillment'
import { resolveOnlineLoyaltyRedemption } from '@/lib/loyalty'
import { getFeatureSettings } from '@/lib/featureSettings'
import { getOnlineOrderStatus, DAY_NAMES } from '@/lib/onlineOrderSettings'
import { getPaymentSettings, computeCardSurcharge } from '@/lib/paymentSettings'
import { getOnlineProviderName } from '@/lib/paymentProvider'
import { createOnlineCheckout, verifyOnlinePayment, deactivateOnlineCheckout } from '@/lib/onlineCheckout'
import { completeSquareOnlineFulfillment } from '@/lib/square'
import { resolveOnlineOrderItems, subtotalFromItems } from '@/lib/onlineOrderItems'
import {
  claimOnlineReservations,
  releaseOnlineReservations,
  ReservationError,
  resolveReturnBase,
} from '@/lib/onlineReservations'
import { isValidAuPhone, normalizeAuPhone } from '@/lib/phone'
import { D, roundCents, gt, isZero, toDb } from '@/lib/money'
import { rateLimit, clientIp } from '@/lib/ratelimit'

const MAX_INFLIGHT = 8
let inFlight = 0

const STALE_ORDER_MS = 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
let lastSweep = 0

async function sweepStaleOrders() {
  const now = Date.now()
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now

  const cutoff = new Date(now - STALE_ORDER_MS)
  const stale = await prisma.order.findMany({
    where: {
      source: 'ONLINE',
      status: 'AWAITING_PAYMENT',
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      status: true,
      checkoutRef: true,
      paymentProvider: true,
      voucherId: true,
      freeItemRedeemed: true,
      customerId: true,
      onlineReservationsHeld: true,
      items: { select: { productId: true, quantity: true } },
    },
  })

  for (const order of stale) {
    try {
      // The checkout may have been paid after the last poll but before the
      // webhook landed — rescue it instead of deleting a paid order.
      if (order.checkoutRef) {
        const { paid, paymentRef, provider, squareOrderId } = await verifyOnlinePayment(order.paymentProvider, {
          checkoutRef: order.checkoutRef,
          order,
        })
        if (paid) {
          await fulfillPaidOrder(order.id, { paymentRef, paymentProvider: provider })
          await completeSquareOnlineFulfillment(squareOrderId)
          continue
        }
      }

      // Square links never expire — kill the link before deleting the order,
      // or a late payment would charge the customer with no order on record.
      // Throws on failure, keeping the order for a retry next sweep.
      await deactivateOnlineCheckout(order.paymentProvider, order.checkoutRef)

      // Delete first, release after: a payment racing the sweep either flips
      // the status (delete no-ops, holds kept) or loses cleanly. A failed
      // delete can't double-release stock.
      const deleted = await prisma.order.deleteMany({
        where: { id: order.id, status: 'AWAITING_PAYMENT' },
      })
      if (deleted.count === 1) {
        await releaseOnlineReservations(order)
      }
    } catch (err) {
      console.error(`[online order] stale sweep failed for order ${order.id}:`, err.message)
    }
  }
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`
}

function closedError(shop) {
  if (shop.closedMessage) return shop.closedMessage
  if (shop.reason !== 'PAUSED' && shop.nextOpen) {
    const { daysAway, dayOfWeek, openTime } = shop.nextOpen
    const when = daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : DAY_NAMES[dayOfWeek]
    return `We're closed right now. Online orders open ${when} at ${formatTime12h(openTime)}.`
  }
  return "We're not taking online orders right now. Please try again later."
}

async function findOnlineOrder(ref) {
  if (!ref) return null
  return prisma.order.findFirst({
    where: {
      OR: [
        { checkoutRef: ref },
        { trackingToken: ref },
      ],
    },
    select: {
      id: true,
      status: true,
      trackingToken: true,
      checkoutRef: true,
      paymentProvider: true,
    },
  })
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const checkoutRef = searchParams.get('checkoutRef') || searchParams.get('sessionId')
    if (!checkoutRef) {
      return NextResponse.json({ error: 'checkoutRef required' }, { status: 400 })
    }

    let order = await findOnlineOrder(checkoutRef)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    if (order.status === 'AWAITING_PAYMENT') {
      try {
        const providerName = order.paymentProvider || await getOnlineProviderName()
        const verifyRef = order.checkoutRef || checkoutRef
        const { paid, paymentRef, provider, squareOrderId } = await verifyOnlinePayment(providerName, {
          checkoutRef: verifyRef,
          order,
        })
        if (paid) {
          await fulfillPaidOrder(order.id, {
            checkoutRef: order.checkoutRef || verifyRef,
            paymentRef,
            paymentProvider: provider,
          })
          // Online orders often confirm via this poll fallback rather than the
          // webhook, so the Square-side auto-complete must run here too — else
          // the order lingers in the dashboard's "Active" tab. Best-effort.
          await completeSquareOnlineFulfillment(squareOrderId)
          order = await prisma.order.findUnique({
            where: { id: order.id },
            select: { id: true, status: true, trackingToken: true },
          })
        }
      } catch (err) {
        console.error('[online order] payment verify failed:', err.message)
      }
    }

    return NextResponse.json(order)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

export async function POST(request) {
  const rl = rateLimit(`order-create:${clientIp(request)}`, { limit: 5, windowMs: 60000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many orders. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }
  if (inFlight >= MAX_INFLIGHT) {
    return NextResponse.json(
      { error: 'We are busy right now. Please try again in a moment.' },
      { status: 503, headers: { 'Retry-After': '3' } },
    )
  }

  // The shop is closed / paused: refuse before any order row, stock hold or
  // payment link exists. The customer page hides checkout too, but that's
  // cosmetic — this is the authoritative gate (never trust the client).
  const shop = await getOnlineOrderStatus()
  if (!shop.open) {
    return NextResponse.json(
      { error: closedError(shop), closed: true, reason: shop.reason },
      { status: 409 },
    )
  }

  inFlight += 1
  let order = null
  try {
    await sweepStaleOrders()

    const body = await request.json()
    const { name, phone: rawPhone, items: rawItems } = body

    if (!name?.trim() || !rawPhone?.trim() || !rawItems?.length) {
      return NextResponse.json({ error: 'Name, phone, and items are required' }, { status: 400 })
    }
    if (!isValidAuPhone(rawPhone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit Australian phone number (e.g. 0412 345 678).' }, { status: 400 })
    }
    const phone = normalizeAuPhone(rawPhone)
    // The pickup note is "Pickup: name | phone" — a pipe in the name would
    // corrupt parsePickupNote's split and store a junk phone on fulfillment.
    const pickupName = name.trim().replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()

    const resolved = await resolveOnlineOrderItems(rawItems)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    const items = resolved.items

    const customer = await prisma.customer.findUnique({ where: { phone } })

    const subtotal = subtotalFromItems(items)

    if (body.redeemFree && body.voucherCode) {
      return NextResponse.json({ error: 'Cannot combine voucher and free coffee' }, { status: 400 })
    }

    let discountAmount = D(0)
    let voucherId = null
    let voucher = null
    let freeItemRedeemed = false
    let discountLabel = 'Voucher'

    if (body.redeemFree) {
      if (!customer) {
        return NextResponse.json({ error: 'No free coffee available' }, { status: 400 })
      }
      const loyalty = await resolveOnlineLoyaltyRedemption({
        customer,
        items,
        redeemRequested: true,
      })
      if (loyalty.error) return NextResponse.json({ error: loyalty.error }, { status: 400 })
      discountAmount = loyalty.discountAmount
      freeItemRedeemed = loyalty.freeItemRedeemed
      discountLabel = 'Free coffee'
    } else if (body.voucherCode) {
      const { vouchersEnabled } = await getFeatureSettings()
      if (!vouchersEnabled) return NextResponse.json({ error: 'Voucher codes are not accepted' }, { status: 400 })
      const code = body.voucherCode.trim().toUpperCase()
      voucher = await prisma.voucher.findUnique({ where: { code } })
      const result = evaluateVoucher(voucher, subtotal, items, customer?.id ?? null)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      discountAmount = result.discount
      voucherId = voucher.id
    }

    const paymentSettings = await getPaymentSettings()
    const providerName = await getOnlineProviderName()
    const surchargeBase = roundCents(D(subtotal).minus(discountAmount))
    const surchargeAmount = computeCardSurcharge(paymentSettings, surchargeBase)
    const total = roundCents(surchargeBase.plus(surchargeAmount))
    const hasSurcharge = gt(surchargeAmount, 0)

    const trackingToken = crypto.randomUUID()

    try {
      order = await prisma.$transaction(async (tx) => {
        await claimOnlineReservations(tx, {
          voucher,
          voucherId,
          customerId: customer?.id ?? null,
          freeItemRedeemed,
          items,
        })

        return tx.order.create({
          data: {
            total: toDb(total),
            paymentMethod: 'ONLINE',
            amountPaid: toDb(0),
            change: toDb(0),
            trackingToken,
            discountAmount: toDb(discountAmount),
            freeItemRedeemed,
            surchargeType: hasSurcharge ? paymentSettings.cardSurchargeType : '',
            surchargeValue: hasSurcharge ? toDb(paymentSettings.cardSurchargeValue) : toDb(0),
            surchargeAmount: toDb(surchargeAmount),
            voucherId,
            note: `Pickup: ${pickupName} | ${phone}`,
            status: 'AWAITING_PAYMENT',
            source: 'ONLINE',
            customerId: customer?.id ?? null,
            paymentProvider: providerName,
            onlineReservationsHeld: true,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                productName: item.productName ?? '',
                quantity: item.quantity,
                unitPrice: toDb(item.unitPrice),
                size: item.size ?? '',
                notes: item.notes ?? '',
                modifiers: item.modifiers?.length
                  ? {
                      create: item.modifiers.map((m) => ({
                        name: m.name,
                        price: toDb(m.price),
                        ...(m.source === 'category'
                          ? { categoryModifierId: m.id }
                          : { modifierId: m.id }),
                      })),
                    }
                  : undefined,
              })),
            },
          },
          include: { items: { select: { productId: true, quantity: true } } },
        })
      })
    } catch (err) {
      if (err instanceof ReservationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }

    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(request.url).origin

    const returnBase = resolveReturnBase(body.returnBase)

    // A voucher covering the whole order leaves nothing to charge. Stripe/Square
    // both reject a $0 checkout, so fulfil the free order directly (marks it PENDING,
    // commits voucher/stamp/stock exactly like a paid order) and send the customer
    // straight to the success/track page — no payment redirect.
    if (isZero(total)) {
      await fulfillPaidOrder(order.id, { paymentProvider: providerName })
      return NextResponse.json({
        checkoutUrl: `${origin}${returnBase}/success?checkoutRef=${trackingToken}`,
        orderId: order.id,
      })
    }

    let checkoutUrl
    let checkoutRef
    try {
      ;({ checkoutUrl, checkoutRef } = await createOnlineCheckout(providerName, {
        orderId: order.id,
        items,
        surchargeAmount,
        discountAmount,
        discountLabel,
        paymentSettings,
        origin,
        returnBase,
        trackingToken,
        phone,
      }))
    } catch (checkoutErr) {
      const deleted = await prisma.order.deleteMany({
        where: { id: order.id, status: 'AWAITING_PAYMENT' },
      })
      if (deleted.count === 1) {
        await releaseOnlineReservations(order)
      }
      throw checkoutErr
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { checkoutRef },
    })

    return NextResponse.json({ checkoutUrl, orderId: order.id })
  } catch (err) {
    console.error('[online order]', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  } finally {
    inFlight -= 1
  }
}
