'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { D, roundCents, max, gt } from '@/lib/money'

const TYPES = [
  { key: 'PERCENT', label: '% Percent' },
  { key: 'FLAT', label: '$ Flat' },
]

function TypeToggle({ value, onChange }) {
  return (
    <div className="flex gap-2 mb-2">
      {TYPES.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            value === t.key
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function AmountInput({ type, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
        {type === 'PERCENT' ? '%' : '$'}
      </span>
      <input
        type="number"
        min="0"
        step={type === 'PERCENT' ? '1' : '0.50'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl pl-7 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )
}

export default function OrderAdjustmentModal({
  isOpen, onClose, onApply, subtotal,
  initialActiveTab = 'discount',
  initialDiscountType = 'PERCENT', initialDiscountValue = 0,
  initialSurchargeType = 'PERCENT', initialSurchargeValue = 0,
}) {
  const [activeTab, setActiveTab] = useState(initialActiveTab)
  const [discountType, setDiscountType] = useState(initialDiscountType)
  const [discountValue, setDiscountValue] = useState(initialDiscountValue ? String(initialDiscountValue) : '')
  const [surchargeType, setSurchargeType] = useState(initialSurchargeType)
  const [surchargeValue, setSurchargeValue] = useState(initialSurchargeValue ? String(initialSurchargeValue) : '')

  if (!isOpen) return null

  const parsedDiscount = parseFloat(discountValue) || 0
  const parsedSurcharge = parseFloat(surchargeValue) || 0

  const discountAmount = activeTab === 'discount'
    ? roundCents(discountType === 'PERCENT' ? D(subtotal).times(D(parsedDiscount).div(100)) : D(parsedDiscount))
    : D(0)
  const surchargeAmount = activeTab === 'surcharge'
    ? roundCents(surchargeType === 'PERCENT' ? D(subtotal).times(D(parsedSurcharge).div(100)) : D(parsedSurcharge))
    : D(0)

  const previewTotal = max(D(0), D(subtotal).plus(surchargeAmount).minus(discountAmount))

  const activeValue = activeTab === 'discount' ? parsedDiscount : parsedSurcharge
  const hasValue = activeValue > 0

  function handleApply() {
    onApply({
      activeTab,
      discountType,
      discountValue: activeTab === 'discount' ? parsedDiscount : 0,
      discount: discountAmount,
      surchargeType,
      surchargeValue: activeTab === 'surcharge' ? parsedSurcharge : 0,
      surchargeAmount,
    })
  }

  function handleClear() {
    setDiscountValue('')
    setSurchargeValue('')
    onApply({ activeTab, discountType, discountValue: 0, discount: 0, surchargeType, surchargeValue: 0, surchargeAmount: 0 })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Order Adjustment</h2>

        {/* Tabs */}
        <div className="flex border border-gray-200 rounded-xl overflow-hidden mb-5">
          {['discount', 'surcharge'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tab === 'discount' ? 'Discount' : 'Surcharge'}
            </button>
          ))}
        </div>

        {/* Discount tab */}
        {activeTab === 'discount' && (
          <div className="mb-5">
            <TypeToggle value={discountType} onChange={setDiscountType} />
            <AmountInput
              type={discountType}
              value={discountValue}
              onChange={setDiscountValue}
              placeholder={discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 5.00'}
            />
          </div>
        )}

        {/* Surcharge tab */}
        {activeTab === 'surcharge' && (
          <div className="mb-5">
            <TypeToggle value={surchargeType} onChange={setSurchargeType} />
            <AmountInput
              type={surchargeType}
              value={surchargeValue}
              onChange={setSurchargeValue}
              placeholder={surchargeType === 'PERCENT' ? 'e.g. 10' : 'e.g. 2.50'}
            />
          </div>
        )}

        {/* Preview */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 space-y-1">
          <div className="flex justify-between text-sm text-gray-500">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          {gt(discountAmount, 0) && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount{discountType === 'PERCENT' && parsedDiscount > 0 ? ` (${parsedDiscount}%)` : ''}</span>
              <span className="font-mono">−{formatCurrency(discountAmount)}</span>
            </div>
          )}
          {gt(surchargeAmount, 0) && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Surcharge{surchargeType === 'PERCENT' && parsedSurcharge > 0 ? ` (${parsedSurcharge}%)` : ''}</span>
              <span className="font-mono">+{formatCurrency(surchargeAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(previewTotal)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {hasValue && (
            <button onClick={handleClear} className="py-3 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
              Clear
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleApply} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
