'use client'

import { useState, useEffect } from 'react'

export default function ModifierListManager({
  apiBase,
  title,
  description,
  namePlaceholder = 'Modifier name',
  className = '',
}) {
  const [modifiers, setModifiers] = useState([])
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!apiBase) return
    fetch(apiBase)
      .then((r) => r.json())
      .then((d) => setModifiers(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [apiBase])

  async function handleAdd() {
    if (!newName.trim() || !newPrice) return
    setAdding(true)
    setError('')
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), price: parseFloat(newPrice) }),
    })
    if (res.ok) {
      const mod = await res.json()
      setModifiers((prev) => [...prev, mod])
      setNewName('')
      setNewPrice('')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to add')
    }
    setAdding(false)
  }

  async function handleToggle(mod) {
    const res = await fetch(`${apiBase}/${mod.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !mod.available }),
    })
    if (res.ok) {
      const updated = await res.json()
      setModifiers((prev) => prev.map((m) => (m.id === mod.id ? updated : m)))
    }
  }

  async function handleDelete(mod) {
    const res = await fetch(`${apiBase}/${mod.id}`, { method: 'DELETE' })
    if (res.ok) {
      setModifiers((prev) => prev.filter((m) => m.id !== mod.id))
    }
  }

  async function handlePriceEdit(mod, price) {
    const val = parseFloat(price)
    if (isNaN(val)) return
    const res = await fetch(`${apiBase}/${mod.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: val }),
    })
    if (res.ok) {
      const updated = await res.json()
      setModifiers((prev) => prev.map((m) => (m.id === mod.id ? updated : m)))
    }
  }

  return (
    <div className={className}>
      <p className={`text-sm font-medium text-gray-700 ${description ? 'mb-1' : 'mb-3'}`}>{title}</p>
      {description && <p className="text-xs text-gray-400 mb-3">{description}</p>}

      {modifiers.length > 0 && (
        <div className="space-y-2 mb-3">
          {modifiers.map((mod) => (
            <div key={mod.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 bg-gray-50">
              <span className={`text-sm font-medium flex-1 ${!mod.available ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {mod.name}
              </span>
              <input
                type="number"
                step="0.50"
                defaultValue={mod.price}
                onBlur={(e) => handlePriceEdit(mod, e.target.value)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={() => handleToggle(mod)}
                title={mod.available ? 'Disable' : 'Enable'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors ${
                  mod.available ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {mod.available ? '✓' : '○'}
              </button>
              <button
                onClick={() => handleDelete(mod)}
                title="Delete"
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
          placeholder={namePlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="number"
          step="0.50"
          min="0"
          placeholder="$0.00"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim() || !newPrice}
          className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
