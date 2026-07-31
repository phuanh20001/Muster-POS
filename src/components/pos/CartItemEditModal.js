'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { D, sum, gt } from '@/lib/money'

export default function CartItemEditModal({ item, onClose, onApply, onRemove }) {
  const [qty, setQty] = useState(item.quantity)
  const [modifiers, setModifiers] = useState(item.modifiers ?? [])
  const [notes, setNotes] = useState(item.notes ?? '')
  const [adjustment, setAdjustment] = useState(
    item.priceAdjustment ? String(item.priceAdjustment) : ''
  )
  const [adjustmentNote, setAdjustmentNote] = useState(item.priceAdjustmentNote ?? '')
  const [showAdjustment, setShowAdjustment] = useState(!!item.priceAdjustment)

  const modsTotal = sum(modifiers, (m) => m.price)
  const adjValue = parseFloat(adjustment) || 0
  const lineTotal = D(item.unitPrice).plus(modsTotal).plus(adjValue).times(qty)

  const sizeLabel = item.size ? ` – ${item.size}` : ''

  function handleApply() {
    onApply({
      quantity: qty,
      modifiers,
      notes: notes.trim(),
      priceAdjustment: adjValue,
      priceAdjustmentNote: adjustmentNote.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-gray-900 text-center flex-1 mx-2 truncate">
            Edit: {item.product.name}{sizeLabel}
          </h2>
          <button
            onClick={() => onRemove(item.cartItemId)}
            className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors shrink-0"
          >
            Remove
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl text-gray-600 hover:bg-gray-50 transition-colors"
              >
                −
              </button>
              <span className="text-2xl font-bold text-gray-900 w-8 text-center">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl text-gray-600 hover:bg-gray-50 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Modifiers */}
          {modifiers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Modifiers</label>
              <div className="space-y-1.5">
                {modifiers.map((m, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-700 truncate">{m.name}</span>
                      {gt(m.price, 0) && (
                        <span className="text-xs font-mono text-gray-400 shrink-0">{formatCurrency(m.price)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setModifiers((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-3 shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={`Remove ${m.name}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unit Price + Line Total */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Unit Price</span>
              <span className="font-mono text-gray-700">{formatCurrency(item.unitPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Line Total</span>
              <span className="text-lg font-bold font-mono text-gray-900">{formatCurrency(lineTotal)}</span>
            </div>
          </div>

          {/* Price Adjustment */}
          {showAdjustment ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Adjustment</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">$</span>
                <input
                  type="number"
                  step="0.50"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="0.00  (negative = discount)"
                  className="w-full border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <input
                type="text"
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
                placeholder="Reason (e.g. staff discount)"
                maxLength={100}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAdjustment(true)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Add Adjustment
            </button>
          )}

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter a note or description"
              rows={3}
              maxLength={200}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
        </div>

        {/* Apply button */}
        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100">
          <button
            onClick={handleApply}
            className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  )
}
