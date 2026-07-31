'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { D, mul, sum, gt } from '@/lib/money'
import { usePromptDialog } from '@/hooks/usePromptDialog'

function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number)
  const from = `${monthStr}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${monthStr}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_SUPPLIER = { name: '', contact: '', note: '' }
const EMPTY_LINE = { stockItemId: '', name: '', quantity: '', unitCost: '' }

export default function PurchasingPage() {
  const { confirm, dialog } = usePromptDialog()
  const [suppliers, setSuppliers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [receivings, setReceivings] = useState([])
  const [month, setMonth] = useState(currentMonth())

  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER)
  const [supplierSaving, setSupplierSaving] = useState(false)

  const [recv, setRecv] = useState({ supplierId: '', receivedAt: new Date().toISOString().slice(0, 10), note: '' })
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [recvSaving, setRecvSaving] = useState(false)
  const [recvError, setRecvError] = useState('')

  const loadSuppliers = useCallback(async () => {
    const d = await fetch('/api/suppliers').then((r) => r.json()).catch(() => null)
    if (Array.isArray(d)) setSuppliers(d)
  }, [])

  const loadReceivings = useCallback(async () => {
    const { from, to } = monthRange(month)
    const d = await fetch(`/api/stock-receivings?from=${from}&to=${to}`).then((r) => r.json()).catch(() => null)
    if (d?.receivings) setReceivings(d.receivings)
  }, [month])

  useEffect(() => { loadSuppliers() }, [loadSuppliers])
  useEffect(() => { loadReceivings() }, [loadReceivings])
  useEffect(() => {
    fetch('/api/stock-items').then((r) => r.json()).then((d) => Array.isArray(d) && setStockItems(d)).catch(() => {})
  }, [])

  async function addSupplier(e) {
    e.preventDefault()
    if (!supplierForm.name.trim()) return
    setSupplierSaving(true)
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(supplierForm),
    })
    setSupplierForm(EMPTY_SUPPLIER)
    setSupplierSaving(false)
    loadSuppliers()
  }

  async function deleteSupplier(s) {
    const ok = await confirm(`Delete supplier "${s.name}"? Past receivings and expenses keep their record but lose the link.`)
    if (!ok) return
    setSuppliers((prev) => prev.filter((x) => x.id !== s.id))
    await fetch(`/api/suppliers/${s.id}`, { method: 'DELETE' })
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [field]: value }
      if (field === 'stockItemId' && value) {
        const item = stockItems.find((s) => String(s.id) === String(value))
        if (item) next.name = item.name
      }
      return next
    }))
  }

  function addLineRow() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }])
  }

  function removeLineRow(idx) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  const lineCost = (l) => (gt(D(l.quantity || 0), 0) && gt(D(l.unitCost || 0), 0) ? mul(l.unitCost, l.quantity) : D(0))
  const recvTotal = sum(lines, lineCost)

  async function saveReceiving(e) {
    e.preventDefault()
    setRecvError('')
    const validLines = lines.filter((l) => l.name.trim() && gt(D(l.quantity || 0), 0))
    if (validLines.length === 0) { setRecvError('Add at least one line with a name and quantity'); return }
    setRecvSaving(true)
    const res = await fetch('/api/stock-receivings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: recv.supplierId || null,
        receivedAt: recv.receivedAt,
        note: recv.note,
        lines: validLines.map((l) => ({
          stockItemId: l.stockItemId || null,
          name: l.name.trim(),
          quantity: l.quantity,
          unitCost: l.unitCost || 0,
        })),
      }),
    })
    setRecvSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setRecvError(d.error ?? 'Failed to save receiving')
      return
    }
    setRecv({ supplierId: '', receivedAt: recv.receivedAt, note: '' })
    setLines([{ ...EMPTY_LINE }])
    loadReceivings()
    // Stock counts changed — refresh the picker quantities.
    fetch('/api/stock-items').then((r) => r.json()).then((d) => Array.isArray(d) && setStockItems(d)).catch(() => {})
  }

  async function deleteReceiving(r) {
    const ok = await confirm(`Delete this ${formatCurrency(r.totalCost)} receiving? Stock quantities it added will be reversed.`)
    if (!ok) return
    setReceivings((prev) => prev.filter((x) => x.id !== r.id))
    await fetch(`/api/stock-receivings/${r.id}`, { method: 'DELETE' })
    fetch('/api/stock-items').then((res) => res.json()).then((d) => Array.isArray(d) && setStockItems(d)).catch(() => {})
  }

  const purchasesTotal = sum(receivings, (r) => r.totalCost)

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Purchasing</h1>
      <p className="text-sm text-gray-500 mb-6">Record suppliers and stock receivings. Receiving stock bumps the stock count and counts as Purchases in the Reports P&L.</p>

      {/* Suppliers */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Suppliers</h2>
        <form onSubmit={addSupplier} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
            <input
              type="text" placeholder="e.g. Bean Bros"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Contact</label>
            <input
              type="text" placeholder="Phone / email"
              value={supplierForm.contact}
              onChange={(e) => setSupplierForm((f) => ({ ...f, contact: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Note</label>
            <input
              type="text" placeholder="Optional"
              value={supplierForm.note}
              onChange={(e) => setSupplierForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <button
            type="submit" disabled={supplierSaving || !supplierForm.name.trim()}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {supplierSaving ? 'Adding…' : '+ Add Supplier'}
          </button>
        </form>
        {suppliers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suppliers.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                {s.contact && <span className="text-xs text-gray-400">{s.contact}</span>}
                <button onClick={() => deleteSupplier(s)} className="text-gray-300 hover:text-red-500 text-base leading-none" title="Delete supplier">×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New receiving */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-gray-900 mb-3">New Receiving</h2>
        <form onSubmit={saveReceiving} className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Supplier</label>
              <select
                value={recv.supplierId}
                onChange={(e) => setRecv((r) => ({ ...r, supplierId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date received</label>
              <input
                type="date"
                value={recv.receivedAt}
                onChange={(e) => setRecv((r) => ({ ...r, receivedAt: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Note</label>
              <input
                type="text" placeholder="Optional"
                value={recv.note}
                onChange={(e) => setRecv((r) => ({ ...r, note: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={l.stockItemId}
                  onChange={(e) => updateLine(idx, 'stockItemId', e.target.value)}
                  className="col-span-4 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Custom (no stock link)</option>
                  {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name}{s.quantity != null ? ` (${s.quantity})` : ''}</option>)}
                </select>
                <input
                  type="text" placeholder="Item name"
                  value={l.name}
                  onChange={(e) => updateLine(idx, 'name', e.target.value)}
                  className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="number" min="0" placeholder="Qty"
                  value={l.quantity}
                  onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
                  onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                  className="col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="number" step="0.01" min="0" placeholder="Unit $"
                  value={l.unitCost}
                  onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
                  onChange={(e) => updateLine(idx, 'unitCost', e.target.value)}
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <div className="col-span-1 text-right text-sm font-medium text-gray-700">{formatCurrency(lineCost(l))}</div>
                <button
                  type="button" onClick={() => removeLineRow(idx)}
                  className="col-span-1 text-gray-300 hover:text-red-500 text-base leading-none"
                  title="Remove line"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={addLineRow} className="text-sm text-gray-600 hover:text-gray-900 font-medium">+ Add line</button>
            <span className="text-sm font-semibold text-gray-900">Total: {formatCurrency(recvTotal)}</span>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit" disabled={recvSaving}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {recvSaving ? 'Saving…' : 'Save Receiving'}
            </button>
            {recvError && <span className="text-sm text-red-600 font-medium">{recvError}</span>}
          </div>
        </form>
      </section>

      {/* Recent receivings */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Receivings</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">Purchases: {formatCurrency(purchasesTotal)}</span>
            <input
              type="month" value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <div className="space-y-3">
          {receivings.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-semibold text-gray-900">{r.supplier?.name ?? 'No supplier'}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(r.receivedAt).toLocaleDateString()}</span>
                  {r.note && <span className="text-xs text-gray-400 ml-2">· {r.note}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(r.totalCost)}</span>
                  <button onClick={() => deleteReceiving(r)} className="text-gray-300 hover:text-red-500 text-base leading-none" title="Delete receiving">×</button>
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id} className="text-gray-600">
                      <td className="py-0.5">{l.name}</td>
                      <td className="py-0.5 text-right w-20">{l.quantity} ×</td>
                      <td className="py-0.5 text-right w-24">{formatCurrency(l.unitCost)}</td>
                      <td className="py-0.5 text-right w-24 font-medium text-gray-800">{formatCurrency(l.lineCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {receivings.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10 border border-gray-200 rounded-xl">No receivings this month.</p>
          )}
        </div>
      </section>
      {dialog}
    </div>
  )
}
