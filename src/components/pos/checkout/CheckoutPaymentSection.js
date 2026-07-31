'use client'

import Button from '@/components/shared/Button'
import { formatCurrency } from '@/lib/formatters'
import { D, gte, lt, neg } from '@/lib/money'
import { QUICK_AMOUNTS } from './constants'

export default function CheckoutPaymentSection({
  paymentOptions,
  paymentMethod,
  setPaymentMethod,
  onStartSplit,
  amountPaid,
  setAmountPaid,
  paid,
  change,
  grandTotal,
  note,
  setNote,
  loading,
  canConfirm,
  onClose,
  onConfirm,
}) {
  return (
    <>
      <div className="flex gap-2">
        {paymentOptions.map(({ value, label }) => (
          <button key={value} onClick={() => setPaymentMethod(value)}
            className={`flex-1 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
              paymentMethod === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}>
            {label}
          </button>
        ))}
        <button onClick={onStartSplit}
          className="flex-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-400 transition-colors">
          ✂ Split
        </button>
      </div>

      {paymentMethod === 'CASH' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received</label>
          <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
            placeholder="0.00" min={0} step="0.01"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-mono font-bold text-right focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <div className="flex gap-2 mt-2 flex-wrap">
            {QUICK_AMOUNTS.map((amt) => (
              <button key={amt} onClick={() => setAmountPaid(String(amt))}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium border border-gray-200 transition-colors">
                ${amt}
              </button>
            ))}
            <button onClick={() => setAmountPaid(D(grandTotal).toFixed(2))}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors">
              Exact
            </button>
          </div>
          {paid > 0 && (
            <div className={`mt-3 rounded-xl p-3 text-center ${gte(change, 0) ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-500 mb-0.5">Change</div>
              <div className={`text-2xl font-bold font-mono ${gte(change, 0) ? 'text-green-700' : 'text-red-600'}`}>
                {gte(change, 0) ? formatCurrency(change) : `Need ${formatCurrency(neg(change))} more`}
              </div>
            </div>
          )}
        </div>
      )}

      <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Order note (optional)"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />

      <div className="flex gap-3 pt-1">
        <button onClick={onClose}
          className="px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <Button variant="primary" size="lg" className="flex-1"
          disabled={loading || !canConfirm || (paymentMethod === 'CASH' && lt(D(paid), grandTotal))}
          onClick={onConfirm}>
          {loading ? 'Processing...' : `✓ Confirm Order — ${formatCurrency(grandTotal)}`}
        </Button>
      </div>
    </>
  )
}
