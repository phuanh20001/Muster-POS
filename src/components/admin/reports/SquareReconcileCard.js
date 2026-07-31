'use client'

import { formatCurrency } from '@/lib/formatters'
import { BRAND_NAME } from '@/lib/brand'

function Stat({ label, value, large }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold text-gray-900 ${large ? 'text-2xl' : 'text-base'}`}>
        {value}
      </div>
    </div>
  )
}

export default function SquareReconcileCard({ data }) {
  // Hidden for shops that don't use Square (keeps the Reports page Stripe-clean).
  if (!data || data.configured === false) return null
  if (data.ordersChecked === 0 && data.payouts.length === 0 && !data.payoutError) return null

  const salesMatch = data.mismatches.length === 0 && data.missing.length === 0
  const feeRate = data.squareGross > 0 ? (data.squareFees / data.squareGross) * 100 : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">Square reconciliation</h3>
          <p className="text-xs text-gray-400">
            Card sales recorded in {BRAND_NAME} vs Square&rsquo;s own records. Cash and online-Stripe sales are excluded.
          </p>
        </div>
        {data.ordersChecked > 0 && (
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              salesMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {salesMatch ? 'Sales match Square' : 'Needs review'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-gray-100">
        <Stat label="Recorded card sales" value={formatCurrency(data.recordedTotal)} large />
        <Stat label="Square gross" value={formatCurrency(data.squareGross)} />
        <Stat label={`Processing fees (${feeRate.toFixed(2)}%)`} value={formatCurrency(data.squareFees)} />
        <Stat label="Square net" value={formatCurrency(data.squareNet)} />
      </div>

      {data.feesPending > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {formatCurrency(data.feesPending)} of gross hasn&rsquo;t settled yet, so its fee isn&rsquo;t counted. Re-run after the next payout for final fees.
        </p>
      )}

      {data.mismatches.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Amount mismatches</h4>
          <div className="space-y-1">
            {data.mismatches.map((m) => (
              <div key={`mm-${m.orderId}`} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-700">Order #{m.orderId} <span className="text-gray-400">[{m.method}/{m.status}]</span></span>
                <span className="font-mono text-gray-900">
                  {formatCurrency(m.recorded)} <span className="text-gray-400">vs Square</span> {formatCurrency(m.squareGross)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.missing.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Payments not found on Square</h4>
          <div className="space-y-1">
            {data.missing.map((m) => (
              <div key={`ms-${m.orderId}-${m.paymentId}`} className="text-sm text-gray-600 py-1">
                Order #{m.orderId} — <span className="font-mono text-xs">{m.paymentId}</span> <span className="text-gray-400">({m.reason})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payouts to bank</h4>
          {data.payouts.length > 0 && (
            <span className="text-sm font-mono font-semibold text-gray-900">{formatCurrency(data.payoutTotal)}</span>
          )}
        </div>
        {data.payoutError ? (
          <p className="text-xs text-gray-400">
            Payouts unavailable ({data.payoutError}). Add <span className="font-mono">PAYOUTS_READ</span> to the Square token to show bank deposits.
          </p>
        ) : data.payouts.length === 0 ? (
          <p className="text-xs text-gray-400">No SENT/PAID payouts in this range.</p>
        ) : (
          <div className="space-y-1">
            {data.payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 tabular-nums">{(p.arrivalDate || p.createdAt || '').slice(0, 10)}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                    {p.status}
                  </span>
                </div>
                <span className="font-mono text-gray-900">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-1">
              Payouts trail sales by 1&ndash;2 business days. Match each PAID payout to your bank statement.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
