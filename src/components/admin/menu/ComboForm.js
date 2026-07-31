'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/shared/Modal'
import Button from '@/components/shared/Button'
import { formatCurrency } from '@/lib/formatters'
import { MENU_EMOJI_OPTIONS } from '@/lib/constants'

// A combo bundles products into ordered slots at a fixed price. One option in a
// slot = a fixed item; several = a choose-from-group the cashier resolves at
// sale time. Components never earn per-item stamps or stock (POS-only feature).
export default function ComboForm({ isOpen, onClose, onSave, products, combo }) {
  const [form, setForm] = useState({
    name: '', price: '', description: '', imageEmoji: '🍔', available: true,
  })
  const [slots, setSlots] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (combo) {
      setForm({
        name: combo.name,
        price: String(combo.price),
        description: combo.description ?? '',
        imageEmoji: combo.imageEmoji ?? '🍔',
        available: combo.available,
      })
      setSlots((combo.comboSlots ?? []).map((s) => ({
        label: s.label ?? '',
        options: s.options.map((o) => o.productId),
      })))
    } else {
      setForm({
        name: '', price: '', description: '', imageEmoji: '🍔', available: true,
      })
      setSlots([{ label: '', options: [] }])
    }
    setError('')
  }, [combo, isOpen])

  function productName(id) {
    const p = products.find((x) => x.id === id)
    return p ? `${p.imageEmoji} ${p.name}` : `#${id}`
  }

  function addSlot() {
    setSlots((prev) => [...prev, { label: '', options: [] }])
  }
  function removeSlot(idx) {
    setSlots((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateSlotLabel(idx, label) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s)))
  }
  function addOption(idx, productId) {
    const pid = parseInt(productId)
    if (!pid) return
    setSlots((prev) => prev.map((s, i) =>
      i === idx && !s.options.includes(pid) ? { ...s, options: [...s.options, pid] } : s
    ))
  }
  function removeOption(idx, pid) {
    setSlots((prev) => prev.map((s, i) =>
      i === idx ? { ...s, options: s.options.filter((o) => o !== pid) } : s
    ))
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('Name is required')
    if (!form.price || isNaN(parseFloat(form.price))) return setError('Valid combo price is required')
    const cleanSlots = slots.filter((s) => s.options.length > 0)
    if (cleanSlots.length === 0) return setError('Add at least one slot with an item')

    setSaving(true)
    try {
      await onSave({
        ...form,
        price: parseFloat(form.price),
        slots: cleanSlots.map((s) => ({ label: s.label.trim(), options: s.options })),
      })
    } catch (err) {
      setError(err.message ?? 'Failed to save combo')
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={combo ? 'Edit Combo' : 'Add Combo'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Lunch Deal"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Combo Price ($) *</label>
            <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              min="0" step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
        </div>
        <p className="text-xs text-gray-400">Combos are filed under their own <span className="font-medium text-gray-500">Combos</span> category in the POS.</p>

        {/* Slots */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Items in this combo <span className="text-gray-400 font-normal">(one option = fixed, several = customer choice)</span>
          </label>
          <div className="space-y-3">
            {slots.map((slot, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input value={slot.label} onChange={(e) => updateSlotLabel(idx, e.target.value)}
                    placeholder={`Slot ${idx + 1} label (e.g. Drink)`}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <button type="button" onClick={() => removeSlot(idx)}
                    aria-label="Remove slot"
                    className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors px-1">×</button>
                </div>

                {slot.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {slot.options.map((pid) => (
                      <span key={pid} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-lg px-2 py-1 text-xs">
                        {productName(pid)}
                        <button type="button" onClick={() => removeOption(idx, pid)}
                          aria-label="Remove item" className="text-gray-400 hover:text-red-500 leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}

                <select value="" onChange={(e) => { addOption(idx, e.target.value); e.target.value = '' }}
                  className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">+ Add item…</option>
                  {products
                    .filter((p) => !slot.options.includes(p.id))
                    .map((p) => <option key={p.id} value={p.id}>{p.imageEmoji} {p.name} — {formatCurrency(p.price)}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" onClick={addSlot}
            className="mt-3 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
            + Add slot
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Short description" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
          <div className="flex gap-2 flex-wrap">
            {MENU_EMOJI_OPTIONS.map((e) => (
              <button key={e} type="button" onClick={() => setForm((f) => ({ ...f, imageEmoji: e }))}
                className={`text-xl p-1.5 rounded-lg border-2 ${form.imageEmoji === e ? 'border-gray-900 bg-gray-100' : 'border-transparent hover:bg-gray-100'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input id="combo-available" type="checkbox" checked={form.available} onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))} className="w-4 h-4 accent-gray-900" />
          <label htmlFor="combo-available" className="text-sm text-gray-700">Available for sale</label>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Save Combo'}
          </Button>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
