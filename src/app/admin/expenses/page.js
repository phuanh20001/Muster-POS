'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { sum, gt, D } from '@/lib/money'
import { usePromptDialog } from '@/hooks/usePromptDialog'

const CATEGORY_SUGGESTIONS = ['Rent', 'Utilities', 'Wages', 'Milk & supplies', 'Equipment', 'Marketing', 'Other']

function monthRange(monthStr) {
  // monthStr = 'YYYY-MM'
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

const EMPTY = { amount: '', category: 'Rent', customCategory: '', spentAt: new Date().toISOString().slice(0, 10), supplierId: '', note: '' }

export default function ExpensesPage() {
  const { confirm, dialog } = usePromptDialog()
  const [month, setMonth] = useState(currentMonth())
  const [expenses, setExpenses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { from, to } = monthRange(month)
    const data = await fetch(`/api/expenses?from=${from}&to=${to}`).then((r) => r.json()).catch(() => null)
    if (data?.expenses) setExpenses(data.expenses)
  }, [month])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then((d) => Array.isArray(d) && setSuppliers(d)).catch(() => {})
  }, [])

  const total = sum(expenses, (e) => e.amount)

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    const category = form.category === 'Other' ? form.customCategory.trim() : form.category
    if (!category) { setError('Category is required'); return }
    if (!gt(D(form.amount), 0)) { setError('Amount must be greater than 0'); return }
    setSaving(true)
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: form.amount,
        category,
        spentAt: form.spentAt,
        supplierId: form.supplierId || null,
        note: form.note,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to add expense')
      return
    }
    setForm({ ...EMPTY, spentAt: form.spentAt })
    load()
  }

  async function handleDelete(exp) {
    const ok = await confirm(`Delete the ${formatCurrency(exp.amount)} ${exp.category} expense?`)
    if (!ok) return
    setExpenses((prev) => prev.filter((x) => x.id !== exp.id))
    await fetch(`/api/expenses/${exp.id}`, { method: 'DELETE' })
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <p className="text-sm text-gray-500 mb-6">Accounting only — expenses feed the Reports P&L. They are not deducted from the cash drawer.</p>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div className="col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Amount</label>
          <input
            type="number" step="0.01" min="0" placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {form.category === 'Other' && (
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Custom</label>
            <input
              type="text" placeholder="Category"
              value={form.customCategory}
              onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        )}
        <div className="col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={form.spentAt}
            onChange={(e) => setForm((f) => ({ ...f, spentAt: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Supplier</label>
          <select
            value={form.supplierId}
            onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Note</label>
          <input
            type="text" placeholder="Optional"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="col-span-2 md:col-span-6 flex items-center gap-3">
          <button
            type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Adding…' : '+ Add Expense'}
          </button>
          {error && <span className="text-sm text-red-600 font-medium">{error}</span>}
        </div>
      </form>

      {/* Total */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{expenses.length} expense{expenses.length === 1 ? '' : 's'}</span>
        <span className="text-sm font-semibold text-gray-900">Total: {formatCurrency(total)}</span>
      </div>

      {/* List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-500">
              <th className="text-left px-4 py-2.5 font-semibold">Date</th>
              <th className="text-left px-4 py-2.5 font-semibold">Category</th>
              <th className="text-left px-4 py-2.5 font-semibold">Supplier</th>
              <th className="text-left px-4 py-2.5 font-semibold">Note</th>
              <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp) => (
              <tr key={exp.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-600">{new Date(exp.spentAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{exp.category}</td>
                <td className="px-4 py-2.5 text-gray-500">{exp.supplier?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{exp.note || '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(exp.amount)}</td>
                <td className="px-2 py-2.5 text-center">
                  <button
                    onClick={() => handleDelete(exp)}
                    className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                    title="Delete expense"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  No expenses this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog}
    </div>
  )
}
