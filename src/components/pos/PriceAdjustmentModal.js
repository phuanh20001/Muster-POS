'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/formatters'

export default function PriceAdjustmentModal({ item, onSave, onClose }) {
  const [adjustment, setAdjustment] = useState(
    item.priceAdjustment !== 0 ? String(item.priceAdjustment) : ''
  )
  const [note, setNote] = useState(item.priceAdjustmentNote ?? '')

  if (!item) return null

  function handleApply() {
    const val = parseFloat(adjustment) || 0
    onSave(val, note.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Price Adjustment</h2>
        <p className="text-sm text-gray-500 mb-5">{item.product.name}</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Adjustment Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono">$</span>
            <input
              type="number"
              step="0.50"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="0.00 (use negative to discount)"
              className="w-full border border-gray-200 rounded-xl pl-7 pr-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Negative = discount, positive = surcharge</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Staff meal discount"
            maxLength={100}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleApply}
            className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
