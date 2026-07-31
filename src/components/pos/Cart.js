'use client'

import { useState } from 'react'
import CartItem from './CartItem'
import CartSummary from './CartSummary'
import Button from '@/components/shared/Button'
import EmptyState from '@/components/shared/EmptyState'
import CartItemEditModal from './CartItemEditModal'

export default function Cart({ items, total, onUpdateQty, onRemove, onClear, onCheckout, onUpdateItem, onEditCombo, onOpenAdjustment, orderDiscount, orderSurchargeAmount, orderSurchargeType, orderSurchargeValue }) {
  const [editingItemId, setEditingItemId] = useState(null)
  const editingItem = items.find((i) => i.cartItemId === editingItemId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold tracking-tight text-gray-900">
          Order
          {items.length > 0 && (
            <span className="ml-2 bg-gray-900 text-white text-xs rounded-full px-2 py-0.5">
              {items.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </h2>
        {items.length > 0 && (
          <button
            onClick={onClear}
            aria-label="Clear all items from order"
            className="text-xs text-red-400 hover:text-red-600 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100">
        {items.length === 0 ? (
          <EmptyState
            icon="🛒"
            title="Cart is empty"
            description="Tap a product to add it"
          />
        ) : (
          items.map((item) => (
            <CartItem
              key={item.cartItemId}
              item={item}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
              onEdit={(id) => {
                const it = items.find((i) => i.cartItemId === id)
                if (it?.product?.isCombo) { onEditCombo?.(it); return }
                setEditingItemId(id)
              }}
            />
          ))
        )}
      </div>

      {/* Summary + checkout */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <CartSummary
            total={total}
            discount={orderDiscount}
            surchargeAmount={orderSurchargeAmount}
            surchargeType={orderSurchargeType}
            surchargeValue={orderSurchargeValue}
            onOpenAdjustment={onOpenAdjustment}
          />
          <Button
            variant="primary"
            size="xl"
            className="w-full mt-3"
            onClick={onCheckout}
          >
            Checkout
          </Button>
        </div>
      )}

      {editingItem && (
        <CartItemEditModal
          item={editingItem}
          onClose={() => setEditingItemId(null)}
          onApply={(patches) => { onUpdateItem(editingItem.cartItemId, patches); setEditingItemId(null) }}
          onRemove={(id) => { onRemove(id); setEditingItemId(null) }}
        />
      )}
    </div>
  )
}
