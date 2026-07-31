import { prisma } from '@/lib/prisma'
import { getSquare, squareLocationId } from '@/lib/square'
import { D, roundCents, sub, max, gt } from '@/lib/money'

// In-app Square fee/payout reconciliation (the feature version of
// scripts/reconcile-square.js). Read-only: confirms that orders recorded against
// Square match Square's own payment records, sums the ACTUAL processing fees and
// net, and lists payouts (money to bank). Cash + online-Stripe sales never touch
// Square, so they are excluded by design — DreamyCafe stays the system of record.

function round2(n) {
  return roundCents(n).toNumber()
}

// Square money is BigInt minor units (cents); the app works in dollars.
// Returns a Decimal.
function toDollars(money) {
  if (!money || money.amount == null) return D(0)
  return D(money.amount.toString()).div(100)
}

// Mirror parseSquareRef in src/lib/paymentProvider.js: "pay:<id>", a bare id, or
// "chk:<id>" (checkout that never resolved to a payment — skip it).
function paymentIdFromRef(ref) {
  if (!ref) return null
  if (ref.startsWith('chk:')) return null
  if (ref.startsWith('pay:')) return ref.slice(4)
  return ref
}

function recordedCardAmount(order) {
  if (order.paymentMethod === 'SPLIT') return max(sub(order.total, order.cashAmount), D(0))
  return D(order.total)
}

// The SDK pager serializes omitted enum params as empty strings (400
// INVALID_ENUM_VALUE), so status + sortOrder must always be passed; query each
// relevant status and merge.
async function listPayouts(square, start, end) {
  const locationId = squareLocationId()
  if (!locationId) return { payouts: [], payoutTotal: 0, payoutError: 'SQUARE_LOCATION_ID not set' }
  try {
    const payouts = []
    let total = D(0)
    for (const status of ['SENT', 'PAID']) {
      const page = await square.payouts.list({
        locationId,
        status,
        sortOrder: 'DESC',
        beginTime: start.toISOString(),
        endTime: end.toISOString(),
      })
      for await (const p of page) {
        const amount = toDollars(p.amountMoney)
        total = total.plus(amount)
        payouts.push({
          id: p.id,
          status: p.status,
          amount: round2(amount),
          arrivalDate: p.arrivalDate || null,
          createdAt: p.createdAt || null,
        })
      }
    }
    payouts.sort((a, b) => (b.arrivalDate || b.createdAt || '').localeCompare(a.arrivalDate || a.createdAt || ''))
    return { payouts, payoutTotal: round2(total), payoutError: null }
  } catch (e) {
    return { payouts: [], payoutTotal: 0, payoutError: String(e.message || e).split('\n')[0] }
  }
}

export async function reconcileSquare({ start, end }) {
  const empty = {
    ordersChecked: 0,
    recordedTotal: 0,
    squareGross: 0,
    squareFees: 0,
    squareNet: 0,
    feesPending: 0,
    mismatches: [],
    missing: [],
    payouts: [],
    payoutTotal: 0,
    payoutError: null,
  }

  if (!process.env.SQUARE_ACCESS_TOKEN) {
    return { configured: false, ...empty }
  }

  const square = getSquare()

  const orders = await prisma.order.findMany({
    where: {
      paymentProvider: 'SQUARE',
      paymentIntentId: { not: null },
      createdAt: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'REFUNDED'] },
    },
    orderBy: { createdAt: 'asc' },
  })

  let recordedTotal = D(0)
  let squareGross = D(0)
  let squareFees = D(0)
  let feesPending = D(0)
  const mismatches = []
  const missing = []

  for (const order of orders) {
    const ids = order.paymentIntentId.split(',').map(paymentIdFromRef).filter(Boolean)
    let orderGross = D(0)
    for (const pid of ids) {
      let payment
      try {
        const res = await square.payments.get({ paymentId: pid })
        payment = res.payment || res.result?.payment
      } catch (e) {
        missing.push({ orderId: order.id, paymentId: pid, reason: String(e.message || e).split('\n')[0] })
        continue
      }
      if (!payment) {
        missing.push({ orderId: order.id, paymentId: pid, reason: 'not found' })
        continue
      }
      orderGross = orderGross.plus(toDollars(payment.amountMoney))
      const fees = payment.processingFee || []
      if (fees.length === 0 && payment.status === 'COMPLETED') feesPending = feesPending.plus(toDollars(payment.amountMoney))
      for (const fee of fees) squareFees = squareFees.plus(toDollars(fee.amountMoney))
    }
    const recorded = recordedCardAmount(order)
    recordedTotal = recordedTotal.plus(recorded)
    squareGross = squareGross.plus(orderGross)
    if (gt(orderGross.minus(recorded).abs(), 0.01)) {
      mismatches.push({
        orderId: order.id,
        method: order.paymentMethod,
        status: order.status,
        recorded: round2(recorded),
        squareGross: round2(orderGross),
      })
    }
  }

  const payoutResult = await listPayouts(square, start, end)

  return {
    configured: true,
    ordersChecked: orders.length,
    recordedTotal: round2(recordedTotal),
    squareGross: round2(squareGross),
    squareFees: round2(squareFees),
    squareNet: round2(squareGross.minus(squareFees)),
    feesPending: round2(feesPending),
    mismatches,
    missing,
    ...payoutResult,
  }
}
