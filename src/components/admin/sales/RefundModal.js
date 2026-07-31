'use client'

import { useState } from 'react'
import { formatCurrency, orderTicketWithId } from '@/lib/formatters'
import { D, gt } from '@/lib/money'
import ManagerPinModal from '@/components/shared/ManagerPinModal'

export default function RefundModal({ order, onClose, onRefunded }) {
  const isSplit = order.paymentMethod === 'SPLIT'
  const isCash = order.paymentMethod === 'CASH'
  const [refundNote, setRefundNote] = useState('')
  // Split orders don't store the per-leg cash share, so default to the full total
  // and let the cashier reduce it by whatever went back to the card.
  const [cashReturned, setCashReturned] = useState(
    isSplit ? D(gt(order.cashAmount, 0) ? order.cashAmount : order.total).toFixed(2) : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)

  async function handleRefund() {
    if (!refundNote.trim()) return setError('Please enter a reason for the refund')
    if (isSplit) {
      const amt = parseFloat(cashReturned)
      if (isNaN(amt) || amt < 0 || amt > order.total) {
        return setError(`Enter the cash returned (0 – ${formatCurrency(order.total)})`)
      }
    }
    setLoading(true)
    setError('')
    const res = await fetch(`/api/orders/${order.id}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refundNote: refundNote.trim(),
        ...(isSplit ? { cashReturned: parseFloat(cashReturned) } : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 403) {
        // Manager session lapsed (1h TTL) — don't dead-end on a raw "Forbidden".
        // Prompt for the PIN in place and retry the refund once re-authenticated.
        setError('Your manager session expired — please re-enter your PIN.')
        setAuthOpen(true)
      } else {
        setError(data.error ?? 'Refund failed')
      }
      setLoading(false)
      return
    }
    onRefunded(data)
    onClose()
  }

  function handleReauth() {
    setAuthOpen(false)
    setError('')
    // Keep the manager layout's session state in sync with the fresh cookie.
    window.dispatchEvent(new Event('session-changed'))
    handleRefund()
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Process Refund</h2>
        <p className="text-sm text-gray-500 mb-4">Order {orderTicketWithId(order)} — {formatCurrency(order.total)}</p>

        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 max-h-32 overflow-y-auto">
          {order.items?.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-700">
                {item.product?.name ?? item.productName}{item.size ? ` (${item.size})` : ''} × {item.quantity}
              </span>
              <span className="font-mono text-gray-600">{formatCurrency(D(item.unitPrice).times(item.quantity))}</span>
            </div>
          ))}
        </div>

        {isCash && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-4">
            {formatCurrency(order.total)} will be removed from the cash drawer (logged as a cash-out movement).
          </p>
        )}

        {isSplit && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cash returned from drawer ($)</label>
            <input
              type="number" min="0" max={order.total} step="0.01"
              value={cashReturned}
              onChange={(e) => setCashReturned(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-mono text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">
              Card legs are refunded to the card automatically. Enter only the cash portion handed back from the till.
            </p>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Refund *</label>
          <textarea
            value={refundNote}
            onChange={(e) => setRefundNote(e.target.value)}
            rows={3}
            placeholder="e.g. Customer complaint, wrong order, item unavailable..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleRefund} disabled={loading}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors">
            {loading ? 'Processing...' : 'Process Refund'}
          </button>
        </div>
      </div>
    </div>
    <ManagerPinModal
      isOpen={authOpen}
      onClose={() => setAuthOpen(false)}
      onSuccess={handleReauth}
    />
    </>
  )
}
