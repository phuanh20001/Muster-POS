'use client'

import ModifierListManager from './ModifierListManager'

export default function CategoryModifierManager({ categoryId, categoryName }) {
  if (!categoryId) return null
  return (
    <ModifierListManager
      apiBase={`/api/categories/${categoryId}/modifiers`}
      title={<>Default Add-ons for <span className="font-semibold">{categoryName}</span></>}
      description="These add-ons appear for every product in this category at the POS."
      namePlaceholder="Add-on name"
      className="border-t border-gray-100 pt-4 mt-4"
    />
  )
}
