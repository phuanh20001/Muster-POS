'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { D, sum } from '@/lib/money'
import { effectiveModifiers } from '@/lib/productModifiers'
import ProductThumb from '@/components/shared/ProductThumb'

export default function ProductOptionsModal({ product, onConfirm, onClose }) {
  const hasSizes = product?.sizes?.length > 0

  const allModifiers = effectiveModifiers(product)
  const hasModifiers = allModifiers.length > 0
  const [selectedSize, setSelectedSize] = useState(null)
  const [selectedModifiers, setSelectedModifiers] = useState([])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!product) return
    const sizes = product.sizes ?? []
    setSelectedSize(sizes.length > 0 ? (sizes[1]?.label ?? sizes[0]?.label) : null)
    setSelectedModifiers([])
    setNotes('')
  }, [product?.id])

  if (!product) return null

  const activeSizeObj = hasSizes ? product.sizes.find((s) => s.label === selectedSize) : null
  const displayPrice = activeSizeObj?.price ?? product.price
  const modifiersTotal = sum(selectedModifiers, (m) => m.price)
  const totalPrice = D(displayPrice).plus(modifiersTotal)

  function toggleModifier(mod) {
    setSelectedModifiers((prev) => {
      const exists = prev.find((m) => m.id === mod.id && m.source === mod.source)
      return exists
        ? prev.filter((m) => !(m.id === mod.id && m.source === mod.source))
        : [...prev, mod]
    })
  }

  function handleConfirm() {
    onConfirm(hasSizes ? selectedSize : null, notes.trim(), activeSizeObj?.price ?? null, selectedModifiers)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="mb-3 flex justify-center">
            <ProductThumb product={product} emojiClassName="text-5xl" imgClassName="w-20 h-20 rounded-xl object-cover" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 text-center">{product.name}</h2>
          {product.description && (
            <p className="text-sm text-gray-400 text-center mt-1">{product.description}</p>
          )}
          <p className="text-center font-mono font-semibold text-gray-700 mt-1">
            {formatCurrency(totalPrice)}
          </p>
        </div>

        {/* Size selector */}
        {hasSizes && (
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">Size</p>
            <div className="flex gap-3">
              {product.sizes.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSelectedSize(s.label)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all flex flex-col items-center gap-0.5 ${
                    selectedSize === s.label
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span>{s.label}</span>
                  <span className={`text-xs font-mono ${selectedSize === s.label ? 'text-gray-300' : 'text-gray-400'}`}>
                    {formatCurrency(s.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modifiers */}
        {hasModifiers && (
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">Add-ons</p>
            <div className="flex flex-wrap gap-2">
              {allModifiers.map((mod) => {
                const isSelected = selectedModifiers.some((m) => m.id === mod.id && m.source === mod.source)
                return (
                  <button
                    key={`${mod.source}-${mod.id}`}
                    onClick={() => toggleModifier(mod)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span>{mod.name}</span>
                    <span className={`font-mono text-xs ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                      +{formatCurrency(mod.price)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Special Instructions</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="e.g. extra shot, oat milk, less ice…"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm}
            className="flex-1 py-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all">
            Add to Order — {formatCurrency(totalPrice)}
          </button>
        </div>
      </div>
    </div>
  )
}
