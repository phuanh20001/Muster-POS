'use client'

import { useState } from 'react'

// Buffered add-on editor used while creating a product that has no id yet.
// Modifiers live in the parent form's state and are persisted in the product
// create call (nested `modifiers` on POST /api/products). For existing
// products the live, API-backed ModifierManager is used instead.
export default function DraftModifierManager({ modifiers, onChange, title = 'Add-ons / Modifiers' }) {
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')

  function handleAdd() {
    if (!newName.trim() || !newPrice) return
    onChange([...modifiers, { name: newName.trim(), price: parseFloat(newPrice), available: true }])
    setNewName('')
    setNewPrice('')
  }

  function handleRemove(idx) {
    onChange(modifiers.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-3">{title}</p>

      {modifiers.length > 0 && (
        <div className="space-y-2 mb-3">
          {modifiers.map((mod, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50">
              <span className="text-sm font-medium flex-1 text-gray-800">{mod.name}</span>
              <span className="w-20 text-sm font-mono text-right text-gray-600">${mod.price.toFixed(2)}</span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                title="Remove"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-red-400 hover:bg-red-50 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Modifier name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="number"
          step="0.50"
          min="0"
          placeholder="$0.00"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim() || !newPrice}
          className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  )
}
