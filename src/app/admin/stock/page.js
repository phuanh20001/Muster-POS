'use client'

import { useState, useEffect, useContext } from 'react'
import { AdminSessionContext } from '@/app/admin/layout'
import PrintReport from '@/components/shared/PrintReport'

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

const EMPTY_NEW = { name: '', unit: 'units', quantity: '', threshold: '5' }

export default function StockPage() {
  const session = useContext(AdminSessionContext)
  const isAdmin = session?.role === 'ADMIN'
  const [items, setItems] = useState([])
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState(EMPTY_NEW)
  const [addSaving, setAddSaving] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [printedAt, setPrintedAt] = useState(null)

  function handlePrint() {
    setPrintedAt(new Date())
    requestAnimationFrame(() => window.print())
  }

  async function loadItems() {
    const data = await fetch('/api/stock-items').then((r) => r.json())
    if (Array.isArray(data)) setItems(data)
  }

  useEffect(() => { loadItems() }, [])

  function handleEdit(id, field, value) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    await Promise.all(
      Object.keys(edits).map((id) => {
        const e = edits[id]
        const body = {}
        if ('name' in e) body.name = e.name
        if ('unit' in e) body.unit = e.unit
        if ('quantity' in e) body.quantity = e.quantity === '' ? null : parseInt(e.quantity)
        if ('threshold' in e && e.threshold !== '') body.lowStockThreshold = parseInt(e.threshold)
        return fetch(`/api/stock-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      })
    )
    await loadItems()
    setEdits({})
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDelete(id) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setEdits((prev) => { const next = { ...prev }; delete next[id]; return next })
    await fetch(`/api/stock-items/${id}`, { method: 'DELETE' })
  }

  async function handleAdd() {
    if (!newItem.name.trim()) return
    setAddSaving(true)
    await fetch('/api/stock-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newItem.name.trim(),
        unit: newItem.unit.trim() || 'units',
        quantity: newItem.quantity === '' ? null : parseInt(newItem.quantity),
        lowStockThreshold: newItem.threshold === '' ? 5 : parseInt(newItem.threshold),
      }),
    })
    await loadItems()
    setNewItem(EMPTY_NEW)
    setAdding(false)
    setAddSaving(false)
  }

  const hasEdits = Object.keys(edits).length > 0

  const getVal = (item, field) => {
    const e = edits[item.id] ?? {}
    if (field === 'quantity') return 'quantity' in e ? e.quantity : (item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '')
    if (field === 'threshold') return 'threshold' in e ? e.threshold : String(item.lowStockThreshold ?? 5)
    if (field === 'name') return 'name' in e ? e.name : item.name
    if (field === 'unit') return 'unit' in e ? e.unit : item.unit
    return ''
  }

  const getStatus = (item) => {
    const rawQty = getVal(item, 'quantity')
    const rawThreshold = getVal(item, 'threshold')
    const qty = rawQty === '' ? null : parseInt(rawQty)
    const threshold = rawThreshold === '' ? 5 : parseInt(rawThreshold)
    return stockStatus(qty, threshold)
  }

  const reportItems = items
    .filter((i) => i.quantity !== null && i.quantity !== undefined)
    .sort((a, b) => (a.quantity ?? 999) - (b.quantity ?? 999))

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Count</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track raw ingredients and supplies</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowReport((v) => !v)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {showReport ? 'Hide Report' : 'Stock Report'}
          </button>
          {isAdmin && !adding && (
            <button
              onClick={() => { setAdding(true); setNewItem(EMPTY_NEW) }}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              + Add Item
            </button>
          )}
          {hasEdits && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
          {saved && !hasEdits && (
            <span className="px-4 py-2 text-sm text-green-600 font-medium">Saved</span>
          )}
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 mb-6">
        {['out', 'low', 'ok'].map((s) => {
          const count = items.filter((i) => getStatus(i) === s).length
          return (
            <div key={s} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${STATUS_STYLES[s]}`}>
              {STATUS_LABELS[s]}: {count}
            </div>
          )
        })}
        <div className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold">
          Untracked: {items.filter((i) => getVal(i, 'quantity') === '').length}
        </div>
      </div>

      {/* Stock Report */}
      {showReport && (
        <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
            <div>
              <span className="font-semibold text-gray-900 text-sm">Stock Report</span>
              <span className="text-gray-400 text-xs ml-2">{new Date().toLocaleDateString()}</span>
            </div>
            <button onClick={handlePrint} className="text-xs text-gray-500 hover:text-gray-800 underline">Print</button>
          </div>
          <div className="p-4">
            {reportItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No quantities set. Add items and enter quantities to generate a report.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="text-left pb-2 font-semibold">Item</th>
                    <th className="text-left pb-2 font-semibold">Unit</th>
                    <th className="text-right pb-2 font-semibold">Quantity</th>
                    <th className="text-right pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportItems.map((i) => {
                    const status = stockStatus(i.quantity, i.lowStockThreshold)
                    return (
                      <tr key={i.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-gray-800">{i.name}</td>
                        <td className="py-2 text-gray-500">{i.unit}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{i.quantity}</td>
                        <td className="py-2 text-right">
                          {status && (
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_STYLES[status]}`}>
                              {STATUS_LABELS[status]}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {reportItems.length > 0 && (
        <PrintReport orientation="portrait" title="Stock Report" range={new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })} printedAt={printedAt}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th className="num">Quantity</th>
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {reportItems.map((i) => {
                const status = stockStatus(i.quantity, i.lowStockThreshold)
                return (
                  <tr key={i.id}>
                    <td className="staff">{i.name}</td>
                    <td className="role">{i.unit}</td>
                    <td className="num pr-hrs">{i.quantity}</td>
                    <td className="num">{status ? <span className="pr-badge">{STATUS_LABELS[status]}</span> : <span className="pr-dash">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </PrintReport>
      )}

      {/* Items table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-500">
              <th className="text-left px-4 py-2.5 font-semibold">Item Name</th>
              <th className="text-left px-4 py-2.5 font-semibold w-28">Unit</th>
              <th className="text-right px-4 py-2.5 font-semibold w-32">Quantity</th>
              <th className="text-right px-4 py-2.5 font-semibold w-28">Alert Below</th>
              <th className="text-right px-4 py-2.5 font-semibold w-20">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const status = getStatus(item)
              return (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <input
                        type="text"
                        value={getVal(item, 'name')}
                        onChange={(e) => handleEdit(item.id, 'name', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-transparent hover:border-gray-300"
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {isAdmin ? (
                      <input
                        type="text"
                        value={getVal(item, 'unit')}
                        onChange={(e) => handleEdit(item.id, 'unit', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-transparent hover:border-gray-300"
                      />
                    ) : (
                      <span className="text-sm text-gray-500">{item.unit}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number" min="0" placeholder="-"
                      value={getVal(item, 'quantity')}
                      onChange={(e) => handleEdit(item.id, 'quantity', e.target.value)}
                      className="w-24 border border-gray-200 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900 hover:border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number" min="0" placeholder="5"
                      value={getVal(item, 'threshold')}
                      onChange={(e) => handleEdit(item.id, 'threshold', e.target.value)}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900 hover:border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {status ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${STATUS_STYLES[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                        title="Delete item"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {/* Add new item row */}
            {isAdmin && adding && (
              <tr className="border-b border-gray-100 bg-gray-50">
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    placeholder="e.g. Coffee beans"
                    value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    placeholder="bags"
                    value={newItem.unit}
                    onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="number" min="0" placeholder="-"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <input
                    type="number" min="0" placeholder="5"
                    value={newItem.threshold}
                    onChange={(e) => setNewItem((p) => ({ ...p, threshold: e.target.value }))}
                    className="w-20 border border-gray-300 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </td>
                <td className="px-4 py-2.5" colSpan={2}>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setAdding(false); setNewItem(EMPTY_NEW) }}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={addSaving || !newItem.name.trim()}
                      className="px-3 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
                    >
                      {addSaving ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {items.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  No stock items yet. Click <span className="font-medium text-gray-600">+ Add Item</span> to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
