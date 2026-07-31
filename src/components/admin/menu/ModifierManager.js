'use client'

import ModifierListManager from './ModifierListManager'

export default function ModifierManager({ productId }) {
  if (!productId) return null
  return (
    <ModifierListManager
      apiBase={`/api/products/${productId}/modifiers`}
      title="Add-ons / Modifiers"
    />
  )
}
