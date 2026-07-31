'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

function stockStatus(quantity, threshold = 5) {
  if (quantity === null || quantity === undefined) return null
  if (quantity === 0) return 'out'
  if (quantity <= threshold) return 'low'
  return 'ok'
}

const STATUS_STYLES = {
  out: 'bg-red-100 text-red-700 border-red-200',
  low: 'bg-amber-100 text-amber-700 border-amber-200',
  ok: 'bg-green-100 text-green-700 border-green-200',
}

const STATUS_LABELS = { out: 'Out', low: 'Low', ok: 'OK' }

export default function StockCountStep({ onContinue, onBack }) {
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/stock-items')
      .then((r) => r.json())
      .then((data) => {
        const tracked = Array.isArray(data) ? data.filter((i) => i.quantity !== null && i.quantity !== undefined) : []
        setItems(tracked)
        const initial = {}
        for (const item of tracked) {
          initial[item.id] = String(item.quantity)
        }
        setCounts(initial)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load stock items')
        setLoading(false)
      })
  }, [])

  function handleChange(id, value) {
    setCounts((prev) => ({ ...prev, [id]: value }))
  }

  const allCounted = items.length === 0 || items.every((item) => {
    const val = counts[item.id]
    return val !== '' && val !== undefined && !isNaN(parseInt(val))
  })

  async function handleContinue() {
    if (!allCounted) return setError('Enter a quantity for every tracked item')
    setSaving(true)
    setError('')

    const updates = items.map((item) => {
      const qty = parseInt(counts[item.id])
      if (qty === item.quantity) return Promise.resolve()
      return fetch(`/api/stock-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      })
    })

    const results = await Promise.all(updates)
    const failed = results.find((r) => r && !r.ok)
    setSaving(false)
    if (failed) return setError('Failed to save stock counts')
    onContinue()
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading stock items…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Count remaining stock. These levels carry forward as opening stock for the next shift.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
          No tracked stock items. Add items with quantities in Admin → Stock.
        </p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => {
            const qty = counts[item.id] === '' ? null : parseInt(counts[item.id])
            const status = stockStatus(qty, item.lowStockThreshold)
            return (
              <li key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.unit}</p>
                </div>
                {status && (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border shrink-0 ${STATUS_STYLES[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                )}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[item.id] ?? ''}
                  onChange={(e) => handleChange(item.id, e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </li>
            )
          })}
        </ul>
      )}

      <Link href="/admin/stock" className="text-sm font-semibold text-gray-500 hover:text-gray-900">
        Manage stock items →
      </Link>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600">
          Back
        </button>
        <button onClick={handleContinue} disabled={saving || (items.length > 0 && !allCounted)}
          className="flex-1 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-40">
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
