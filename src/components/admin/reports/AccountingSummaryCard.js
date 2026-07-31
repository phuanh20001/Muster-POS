'use client'

import { formatCurrency } from '@/lib/formatters'
import { D, sum, gt } from '@/lib/money'

function Stat({ label, value, large }) {
  return (
    <div className={large ? '' : ''}>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold text-gray-900 ${large ? 'text-2xl' : 'text-base'}`}>
        {value}
      </div>
    </div>
  )
}

function SplitBar({ label, amount, total, color }) {
  const pct = gt(total, 0) ? D(amount).div(total).times(100).toNumber() : 0
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono font-semibold text-gray-900">{formatCurrency(amount)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AccountingSummaryCard({ data }) {
  if (!data) return null

  const payTotal = sum([data.byPaymentMethod.CASH, data.byPaymentMethod.CARD, data.byPaymentMethod.SPLIT])
  const srcTotal = sum([data.bySource.POS, data.bySource.ONLINE])
  const cardTotal = sum([data.byCardProvider.STRIPE, data.byCardProvider.SQUARE])
  const gstPct = Math.round((data.gst?.rate ?? 0) * 100)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">Accounting summary</h3>
        <p className="text-xs text-gray-400">
          Net revenue after refunds. GST from env (GST_RATE / GST_INCLUSIVE).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-gray-100">
        <Stat label="Net revenue" value={formatCurrency(data.netRevenue)} large />
        <Stat label="Gross sales (completed)" value={formatCurrency(data.grossRevenue)} />
        <Stat label="Refunds" value={formatCurrency(data.refundsTotal)} />
        <Stat label="Orders" value={`${data.orderCountCompleted} completed · ${data.refundCount} refunded`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment method</h4>
          <SplitBar label="Cash" amount={data.byPaymentMethod.CASH} total={payTotal} color="bg-emerald-500" />
          <SplitBar label="Card" amount={data.byPaymentMethod.CARD} total={payTotal} color="bg-blue-500" />
          <SplitBar label="Split" amount={data.byPaymentMethod.SPLIT} total={payTotal} color="bg-amber-500" />
          <p className="text-xs text-gray-400">
            Split orders show as one total; per-leg cash vs card is not stored on the order.
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Channel</h4>
          <SplitBar label="In-store (POS)" amount={data.bySource.POS} total={srcTotal} color="bg-gray-800" />
          <SplitBar label="Online" amount={data.bySource.ONLINE} total={srcTotal} color="bg-violet-500" />
          {cardTotal > 0 && (
            <>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider pt-2">Card processor</h4>
              <SplitBar label="Stripe" amount={data.byCardProvider.STRIPE} total={cardTotal} color="bg-indigo-500" />
              <SplitBar label="Square" amount={data.byCardProvider.SQUARE} total={cardTotal} color="bg-slate-600" />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-gray-100 text-sm">
        <Stat label="Tips" value={formatCurrency(data.tipsTotal)} />
        <Stat label="Surcharges" value={formatCurrency(data.surchargeTotal)} />
        <Stat label="Manual discounts" value={formatCurrency(data.manualDiscountTotal)} />
        <Stat label="Loyalty discounts" value={formatCurrency(data.loyaltyDiscountTotal)} />
      </div>

      <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4">
        <Stat label={`GST (${gstPct}%${data.gst?.inclusive ? ' incl.' : ' excl.'})`} value={formatCurrency(data.gst?.gstAmount ?? 0)} />
        <Stat label="Ex-GST" value={formatCurrency(data.gst?.exGst ?? 0)} />
        <Stat label="GST-inclusive total" value={formatCurrency(data.gst?.inclusiveTotal ?? data.netRevenue)} />
      </div>

      {data.pnl && (
        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profit &amp; loss</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Net revenue</span>
              <span className="font-mono font-semibold text-gray-900">{formatCurrency(data.netRevenue)}</span>
            </div>
            {data.pnl.purchasingEnabled && (
              <div className="flex justify-between">
                <span className="text-gray-600">− Purchases (stock)</span>
                <span className="font-mono text-gray-700">{formatCurrency(data.pnl.purchasesTotal)}</span>
              </div>
            )}
            {data.pnl.expensesEnabled && (
              <div className="flex justify-between">
                <span className="text-gray-600">− Expenses</span>
                <span className="font-mono text-gray-700">{formatCurrency(data.pnl.expensesTotal)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Net profit</span>
              <span className={`font-mono font-bold ${gt(data.pnl.netProfit, 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(data.pnl.netProfit)}
              </span>
            </div>
          </div>
          {data.pnl.expensesEnabled && data.pnl.expensesByCategory?.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-400 mb-1.5">Expenses by category</div>
              <div className="space-y-1">
                {data.pnl.expensesByCategory.map((c) => (
                  <div key={c.category} className="flex justify-between text-sm">
                    <span className="text-gray-600">{c.category}</span>
                    <span className="font-mono text-gray-700">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400">Net profit = net revenue − purchases − expenses for the selected range.</p>
        </div>
      )}
    </div>
  )
}
