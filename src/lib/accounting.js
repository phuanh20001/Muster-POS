// A date-only string "YYYY-MM-DD" parses as UTC midnight via new Date(str); append
// a time so it parses as LOCAL midnight instead. The shop PC runs in shop-local
// time, so "today" means the wall-clock day — these keep filters/grouping aligned.
export function startOfLocalDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfLocalDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setHours(23, 59, 59, 999)
  return d
}

export function localDayKey(date) {
  return formatDateForApi(date)
}

export function todayApiDate() {
  return formatDateForApi(new Date())
}

export function parseReportDateRange(searchParams) {
  const date = searchParams.get('date')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  let from = fromParam || date || todayApiDate()
  let to = toParam || date || from

  if (from > to) {
    const swap = from
    from = to
    to = swap
  }

  const start = startOfLocalDay(from)
  const end = endOfLocalDay(to)

  return { from, to, start, end }
}

export function getGstConfig() {
  const rate = Math.max(0, parseFloat(process.env.GST_RATE ?? '0.1') || 0)
  const inclusive = (process.env.GST_INCLUSIVE ?? 'true').toLowerCase() !== 'false'
  return { rate, inclusive }
}

export function gstBreakdown(amount) {
  const { rate, inclusive } = getGstConfig()
  const total = max(D(amount), D(0))
  if (rate <= 0) {
    return { inclusiveTotal: total, exGst: total, gstAmount: D(0), rate, inclusive }
  }
  const dRate = D(rate)
  if (inclusive) {
    const gstAmount = roundCents(total.times(dRate).div(D(1).plus(dRate)))
    return { inclusiveTotal: total, exGst: roundCents(total.minus(gstAmount)), gstAmount, rate, inclusive }
  }
  const gstAmount = roundCents(total.times(dRate))
  return { inclusiveTotal: roundCents(total.plus(gstAmount)), exGst: total, gstAmount, rate, inclusive }
}

import { itemsSubtotal } from '@/lib/orderTotals'
import { D, roundCents, max, neg, sum } from '@/lib/money'
import { getFeatureSettings } from '@/lib/featureSettings'
import { formatDateForApi } from '@/lib/formatters'

export function orderItemsSubtotal(order) {
  return itemsSubtotal(order.items)
}

function emptyBucket() {
  return { CASH: D(0), CARD: D(0), SPLIT: D(0) }
}

function emptySource() {
  return { POS: D(0), ONLINE: D(0) }
}

function emptyProvider() {
  return { STRIPE: D(0), SQUARE: D(0) }
}

export function aggregateAccounting(orders) {
  let grossRevenue = D(0)
  let refundsTotal = D(0)
  let orderCountCompleted = 0
  let refundCount = 0
  let tipsTotal = D(0)
  let surchargeTotal = D(0)
  let manualDiscountTotal = D(0)
  let loyaltyDiscountTotal = D(0)

  const byPaymentMethod = emptyBucket()
  const bySource = emptySource()
  const byCardProvider = emptyProvider()
  const dailyMap = {}

  for (const order of orders) {
    const dayKey = localDayKey(order.createdAt)
    if (!dailyMap[dayKey]) dailyMap[dayKey] = { date: dayKey, gross: D(0), refunds: D(0), net: D(0) }

    if (order.status === 'COMPLETED') {
      grossRevenue = grossRevenue.plus(D(order.total))
      orderCountCompleted += 1
      dailyMap[dayKey].gross = dailyMap[dayKey].gross.plus(D(order.total))

      const method = order.paymentMethod
      if (method in byPaymentMethod) byPaymentMethod[method] = byPaymentMethod[method].plus(D(order.total))
      else byPaymentMethod.CASH = byPaymentMethod.CASH.plus(D(order.total))

      const source = order.source === 'ONLINE' ? 'ONLINE' : 'POS'
      bySource[source] = bySource[source].plus(D(order.total))

      if ((method === 'CARD' || method === 'SPLIT') && order.paymentIntentId) {
        const provider = order.paymentProvider === 'SQUARE' ? 'SQUARE' : 'STRIPE'
        byCardProvider[provider] = byCardProvider[provider].plus(D(order.total))
      }

      tipsTotal = tipsTotal.plus(D(order.tipAmount ?? 0))
      surchargeTotal = surchargeTotal.plus(D(order.surchargeAmount ?? 0))
      manualDiscountTotal = manualDiscountTotal.plus(D(order.manualDiscount ?? 0))
      loyaltyDiscountTotal = loyaltyDiscountTotal.plus(D(order.discountAmount ?? 0))
    } else if (order.status === 'REFUNDED') {
      refundsTotal = refundsTotal.plus(D(order.total))
      refundCount += 1
      dailyMap[dayKey].refunds = dailyMap[dayKey].refunds.plus(D(order.total))
    }
  }

  const netRevenue = roundCents(grossRevenue.minus(refundsTotal))
  const dailyBreakdown = Object.values(dailyMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      gross: roundCents(d.gross),
      refunds: roundCents(d.refunds),
      net: roundCents(d.gross.minus(d.refunds)),
    }))

  const gst = gstBreakdown(netRevenue)

  return {
    grossRevenue: roundCents(grossRevenue),
    refundsTotal: roundCents(refundsTotal),
    netRevenue,
    orderCountCompleted,
    refundCount,
    byPaymentMethod: {
      CASH: roundCents(byPaymentMethod.CASH),
      CARD: roundCents(byPaymentMethod.CARD),
      SPLIT: roundCents(byPaymentMethod.SPLIT),
    },
    bySource: {
      POS: roundCents(bySource.POS),
      ONLINE: roundCents(bySource.ONLINE),
    },
    byCardProvider: {
      STRIPE: roundCents(byCardProvider.STRIPE),
      SQUARE: roundCents(byCardProvider.SQUARE),
    },
    tipsTotal: roundCents(tipsTotal),
    surchargeTotal: roundCents(surchargeTotal),
    manualDiscountTotal: roundCents(manualDiscountTotal),
    loyaltyDiscountTotal: roundCents(loyaltyDiscountTotal),
    gst,
    dailyBreakdown,
  }
}

export function aggregateExpenses(expenses) {
  let total = D(0)
  const byCategoryMap = {}
  for (const e of expenses ?? []) {
    total = total.plus(D(e.amount))
    const key = e.category || 'Other'
    byCategoryMap[key] = (byCategoryMap[key] ?? D(0)).plus(D(e.amount))
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([category, amount]) => ({ category, amount: roundCents(amount) }))
    .sort((a, b) => b.amount.minus(a.amount).toNumber())
  return { total: roundCents(total), byCategory }
}

export function sumReceivings(receivings) {
  return roundCents(sum(receivings ?? [], (r) => r.totalCost))
}

// Profit & loss block, gated by the feature toggles. Returns null when both
// features are off so callers can omit the P&L section entirely.
export async function buildPnl(prisma, start, end, netRevenue) {
  const flags = await getFeatureSettings()
  if (!flags.expensesEnabled && !flags.purchasingEnabled) return null

  const expenses = flags.expensesEnabled
    ? await prisma.expense.findMany({ where: { spentAt: { gte: start, lte: end } } })
    : []
  const receivings = flags.purchasingEnabled
    ? await prisma.stockReceiving.findMany({ where: { receivedAt: { gte: start, lte: end } } })
    : []

  const { total: expensesTotal, byCategory: expensesByCategory } = aggregateExpenses(expenses)
  const purchasesTotal = sumReceivings(receivings)
  const netProfit = roundCents(D(netRevenue).minus(expensesTotal).minus(purchasesTotal))

  return {
    expensesEnabled: flags.expensesEnabled,
    purchasingEnabled: flags.purchasingEnabled,
    expensesTotal,
    expensesByCategory,
    purchasesTotal,
    netProfit,
  }
}

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells) {
  return cells.map(csvEscape).join(',')
}

export function buildSummaryCsv(summary, from, to) {
  const { gst } = summary
  const lines = [
    csvRow([`${process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'} accounting summary`]),
    csvRow(['from', from, 'to', to]),
    csvRow(['gst_rate', gst.rate, 'gst_inclusive', gst.inclusive]),
    '',
    csvRow(['metric', 'amount']),
    csvRow(['gross_sales_completed', summary.grossRevenue]),
    csvRow(['refunds', summary.refundsTotal]),
    csvRow(['net_revenue', summary.netRevenue]),
    csvRow(['orders_completed', summary.orderCountCompleted]),
    csvRow(['orders_refunded', summary.refundCount]),
    csvRow(['cash', summary.byPaymentMethod.CASH]),
    csvRow(['card', summary.byPaymentMethod.CARD]),
    csvRow(['split', summary.byPaymentMethod.SPLIT]),
    csvRow(['in_store_pos', summary.bySource.POS]),
    csvRow(['online', summary.bySource.ONLINE]),
    csvRow(['card_stripe', summary.byCardProvider.STRIPE]),
    csvRow(['card_square', summary.byCardProvider.SQUARE]),
    csvRow(['tips', summary.tipsTotal]),
    csvRow(['surcharges', summary.surchargeTotal]),
    csvRow(['manual_discounts', summary.manualDiscountTotal]),
    csvRow(['loyalty_discounts', summary.loyaltyDiscountTotal]),
    csvRow(['gst_amount', gst.gstAmount]),
    csvRow(['ex_gst', gst.exGst]),
  ]

  if (summary.pnl) {
    if (summary.pnl.purchasingEnabled) lines.push(csvRow(['purchases_total', summary.pnl.purchasesTotal]))
    if (summary.pnl.expensesEnabled) lines.push(csvRow(['expenses_total', summary.pnl.expensesTotal]))
    lines.push(csvRow(['net_profit', summary.pnl.netProfit]))
  }

  lines.push('', csvRow(['date', 'gross', 'refunds', 'net']))

  for (const day of summary.dailyBreakdown) {
    lines.push(csvRow([day.date, day.gross, day.refunds, day.net]))
  }

  return lines.join('\r\n')
}

export function buildOrdersCsv(orders) {
  const header = csvRow([
    'date', 'time', 'orderId', 'ticket', 'status', 'source', 'paymentMethod', 'paymentProvider',
    'subtotal', 'surcharge', 'manualDiscount', 'loyaltyDiscount', 'tip', 'total',
    'gstAmount', 'exGst', 'refundNote',
  ])
  const rows = orders.map((order) => {
    const d = new Date(order.createdAt)
    const refunded = order.status === 'REFUNDED'
    const gst = gstBreakdown(refunded ? neg(order.total) : order.total)
    const gstAmt = refunded ? neg(gst.gstAmount) : gst.gstAmount
    const exGst = refunded ? neg(gst.exGst) : gst.exGst
    return csvRow([
      localDayKey(d),
      d.toTimeString().slice(0, 8),
      order.id,
      order.dailyNumber ?? '',
      order.status,
      order.source,
      order.paymentMethod,
      order.paymentProvider,
      orderItemsSubtotal(order).toFixed(2),
      D(order.surchargeAmount ?? 0).toFixed(2),
      D(order.manualDiscount ?? 0).toFixed(2),
      D(order.discountAmount ?? 0).toFixed(2),
      D(order.tipAmount ?? 0).toFixed(2),
      D(order.total).toFixed(2),
      gstAmt.toFixed(2),
      exGst.toFixed(2),
      order.refundNote ?? '',
    ])
  })
  return [header, ...rows].join('\r\n')
}

export async function fetchAccountingOrders(prisma, start, end) {
  return prisma.order.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'REFUNDED'] },
    },
    include: {
      items: { include: { modifiers: true, product: { include: { category: true } } } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}
