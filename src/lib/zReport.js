import { D, sum, add } from '@/lib/money'

function fmtMoney(amount) {
  return `$${D(amount).toFixed(2)}`
}

function fmtDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function buildZReportLines({ session, summary, expectedCash, movements }) {
  const brandName = process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'
  const gstPct = Math.round((summary.gst?.rate ?? 0) * 100)
  const totalIn = sum(movements.filter((m) => m.type === 'IN'), (m) => m.amount)
  const totalOut = sum(movements.filter((m) => m.type === 'OUT'), (m) => m.amount)
  const isFinal = !!session.closedAt

  const lines = [
    { type: 'title', text: brandName },
    { type: 'text', text: isFinal ? 'Z-REPORT (FINAL)' : 'Z-REPORT (INTERIM)', align: 'ct', bold: true },
    { type: 'divider' },
    { type: 'text', text: `Session #${session.id}`, align: 'lt' },
    { type: 'text', text: `Opened: ${fmtDateTime(session.openedAt)}`, align: 'lt' },
    { type: 'text', text: `Closed: ${fmtDateTime(session.closedAt)}`, align: 'lt' },
    { type: 'divider' },
    { type: 'row', left: 'Orders completed', right: String(summary.orderCountCompleted) },
    { type: 'row', left: 'Orders refunded', right: String(summary.refundCount) },
    { type: 'row', left: 'Gross sales', right: fmtMoney(summary.grossRevenue) },
    { type: 'row', left: 'Refunds', right: fmtMoney(summary.refundsTotal) },
    { type: 'row', left: 'Net revenue', right: fmtMoney(summary.netRevenue) },
    { type: 'divider' },
    { type: 'row', left: 'Cash sales', right: fmtMoney(summary.byPaymentMethod.CASH) },
    { type: 'row', left: 'Card sales', right: fmtMoney(summary.byPaymentMethod.CARD) },
    { type: 'row', left: 'Split sales', right: fmtMoney(summary.byPaymentMethod.SPLIT) },
    { type: 'row', left: 'In-store', right: fmtMoney(summary.bySource.POS) },
    { type: 'row', left: 'Online', right: fmtMoney(summary.bySource.ONLINE) },
    { type: 'divider' },
    { type: 'row', left: 'Tips', right: fmtMoney(summary.tipsTotal) },
    { type: 'row', left: 'Surcharges', right: fmtMoney(summary.surchargeTotal) },
    { type: 'row', left: 'Discounts', right: fmtMoney(add(summary.manualDiscountTotal, summary.loyaltyDiscountTotal)) },
  ]

  if (gstPct > 0) {
    lines.push({ type: 'divider' })
    lines.push({ type: 'row', left: 'Ex-GST', right: fmtMoney(summary.gst.exGst) })
    lines.push({ type: 'row', left: `GST (${gstPct}%)`, right: fmtMoney(summary.gst.gstAmount) })
    lines.push({ type: 'row', left: 'Incl GST', right: fmtMoney(summary.gst.inclusiveTotal) })
  }

  lines.push({ type: 'divider' })
  lines.push({ type: 'row', left: 'Opening float', right: fmtMoney(session.openingFloat) })
  lines.push({ type: 'row', left: 'Money in', right: fmtMoney(totalIn) })
  lines.push({ type: 'row', left: 'Money out', right: fmtMoney(totalOut) })
  lines.push({ type: 'row', left: 'Expected cash', right: fmtMoney(expectedCash) })

  if (isFinal && session.closingCash != null) {
    lines.push({ type: 'row', left: 'Counted cash', right: fmtMoney(session.closingCash) })
    lines.push({ type: 'row', left: 'Variance', right: fmtMoney(session.variance ?? 0) })
  }

  lines.push({ type: 'feed', lines: 1 })
  lines.push({ type: 'text', text: fmtDateTime(new Date()), align: 'ct' })
  return lines
}
