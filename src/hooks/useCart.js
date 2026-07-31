'use client'

import { useState } from 'react'
import { itemsSubtotal } from '@/lib/orderTotals'
import { randomId } from '@/lib/randomId'

export function useCart() {
  const [items, setItems] = useState([])

  function addItem(product, size = '', notes = '', sizePrice = null, modifiers = []) {
    const unitPrice = sizePrice ?? product.price
    const modKey = modifiers.map((m) => `${m.source ?? 'p'}-${m.id}`).sort().join(',')
    const cartItemId = `${product.id}-${size}-${modKey}`
    setItems((prev) => {
      const existing = prev.find((i) => i.cartItemId === cartItemId)
      if (existing) {
        return prev.map((i) =>
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { cartItemId, product, size, notes, unitPrice, quantity: 1, modifiers, priceAdjustment: 0, priceAdjustmentNote: '' }]
    })
  }

  // A combo is one fixed-price line (unitPrice = combo price) plus snapshot
  // modifiers carrying any per-component upcharges. Each add gets its own unique
  // id (never merges with another combo); editing in place uses updateItem.
  // comboSelections is client-only state kept for re-opening the builder.
  function addComboItem(combo, { modifiers = [], notes = '', selections = [] } = {}) {
    const cartItemId = `combo-${combo.id}-${randomId()}`
    setItems((prev) => [
      ...prev,
      {
        cartItemId,
        product: combo,
        size: '',
        notes,
        unitPrice: combo.price,
        quantity: 1,
        modifiers,
        comboSelections: selections,
        priceAdjustment: 0,
        priceAdjustmentNote: '',
      },
    ])
  }

  function removeItem(cartItemId) {
    setItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId))
  }

  function updateQty(cartItemId, qty) {
    if (qty <= 0) return removeItem(cartItemId)
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === cartItemId ? { ...i, quantity: qty } : i))
    )
  }

  function updateItemAdjustment(cartItemId, adjustment, note) {
    setItems((prev) =>
      prev.map((i) =>
        i.cartItemId === cartItemId ? { ...i, priceAdjustment: adjustment, priceAdjustmentNote: note } : i
      )
    )
  }

  function updateItem(cartItemId, patches) {
    setItems((prev) =>
      prev.map((i) => (i.cartItemId === cartItemId ? { ...i, ...patches } : i))
    )
  }

  function clearCart() {
    setItems([])
  }

  const total = itemsSubtotal(items)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return { items, total, itemCount, addItem, addComboItem, removeItem, updateQty, updateItemAdjustment, updateItem, clearCart }
}
