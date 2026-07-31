'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/shared/Modal'
import Button from '@/components/shared/Button'
import { usePromptDialog } from '@/hooks/usePromptDialog'
import { formatCurrency } from '@/lib/formatters'
import { D } from '@/lib/money'

const TYPE_LABELS = { PERCENT: '% off', FIXED: '$ off', FREE_ITEM: 'Free item' }

function voucherStatus(v) {
  if (!v.active) return { label: 'Inactive', cls: 'bg-gray-100 text-gray-500' }
  if (v.expiresAt && new Date(v.expiresAt) < new Date()) return { label: 'Expired', cls: 'bg-red-50 text-red-600' }
  if (v.usageLimit != null && v.timesUsed >= v.usageLimit) return { label: 'Used up', cls: 'bg-amber-50 text-amber-700' }
  return { label: 'Active', cls: 'bg-green-50 text-green-700' }
}

function describeValue(v) {
  if (v.type === 'PERCENT') return `${D(v.value).toFixed(0)}% off`
  if (v.type === 'FIXED') return `${formatCurrency(v.value)} off`
  return 'Cheapest item free'
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState(null)
  const [editing, setEditing] = useState(null)
  const { confirm, dialog } = usePromptDialog()

  const load = useCallback(async () => {
    const data = await fetch('/api/vouchers', { cache: 'no-store' }).then((r) => r.json()).catch(() => [])
    setVouchers(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(v) {
    const ok = await confirm(`Delete voucher ${v.code}? Past orders that used it are kept.`, {
      title: 'Delete voucher',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await fetch(`/api/vouchers/${v.id}`, { method: 'DELETE' })
    load()
  }

  if (!vouchers) return <div className="p-6 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
          <p className="text-sm text-gray-500 mt-1">Discount codes for online and in-store orders.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({})}>+ New voucher</Button>
      </div>

      {vouchers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No vouchers yet. Create one to offer a discount at checkout.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Rules</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => {
                const st = voucherStatus(v)
                return (
                  <tr key={v.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{v.code}</td>
                    <td className="px-4 py-3 text-gray-700">{describeValue(v)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {D(v.minSubtotal).gt(0) && <div>Min {formatCurrency(v.minSubtotal)}</div>}
                      {v.expiresAt && <div>Exp {new Date(v.expiresAt).toLocaleDateString()}</div>}
                      {v.customer && <div>Only {v.customer.name || v.customer.phone}</div>}
                      {D(v.minSubtotal).lte(0) && !v.expiresAt && !v.customer && '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{v.timesUsed}{v.usageLimit != null ? ` / ${v.usageLimit}` : ''}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(v)} className="text-gray-600 hover:text-gray-900 text-sm font-medium mr-3">Edit</button>
                      <button onClick={() => handleDelete(v)} className="text-red-500 hover:text-red-700 text-sm font-medium">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <VoucherModal
          voucher={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      {dialog}
    </div>
  )
}

function toDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function VoucherModal({ voucher, onClose, onSaved }) {
  const isEdit = Boolean(voucher.id)
  const [code, setCode] = useState(voucher.code ?? '')
  const [type, setType] = useState(voucher.type ?? 'PERCENT')
  const [value, setValue] = useState(voucher.value != null ? String(D(voucher.value).toFixed(2)) : '')
  const [minSubtotal, setMinSubtotal] = useState(voucher.minSubtotal != null ? String(D(voucher.minSubtotal).toFixed(2)) : '')
  const [usageLimit, setUsageLimit] = useState(voucher.usageLimit != null ? String(voucher.usageLimit) : '')
  const [expiresAt, setExpiresAt] = useState(toDateInput(voucher.expiresAt))
  const [active, setActive] = useState(voucher.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    setSaving(true)
    const payload = {
      code, type, active,
      value: type === 'FREE_ITEM' ? 0 : value,
      minSubtotal: minSubtotal || 0,
      usageLimit: usageLimit === '' ? null : usageLimit,
      expiresAt: expiresAt === '' ? null : expiresAt,
    }
    const res = await fetch(isEdit ? `/api/vouchers/${voucher.id}` : '/api/vouchers', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to save voucher')
      return
    }
    onSaved()
  }

  return (
    <Modal isOpen title={isEdit ? 'Edit voucher' : 'New voucher'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">2–32 letters, numbers, or dashes.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TYPE_LABELS).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setType(val)}
                className={`py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                  type === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {type !== 'FREE_ITEM' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {type === 'PERCENT' ? 'Percentage off' : 'Amount off ($)'}
            </label>
            <input
              type="number" min="0" step={type === 'PERCENT' ? '1' : '0.01'} max={type === 'PERCENT' ? '100' : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'PERCENT' ? '10' : '5.00'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {type === 'PERCENT' && <p className="text-xs text-gray-400 mt-1">Max 100%.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. subtotal ($)</label>
            <input type="number" min="0" step="0.01" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)}
              placeholder="0.00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usage limit</label>
            <input type="number" min="1" step="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="Unlimited"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Expiry date</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <p className="text-xs text-gray-400 mt-1">Leave blank for no expiry.</p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-gray-900" />
          <span className="text-sm font-medium text-gray-700">Active</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <Button variant="primary" className="flex-1" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create voucher'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
