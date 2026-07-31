'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '@/components/shared/Modal'
import Button from '@/components/shared/Button'
import ProductThumb from '@/components/shared/ProductThumb'
import ModifierManager from './ModifierManager'
import DraftModifierManager from './DraftModifierManager'
import { MENU_EMOJI_OPTIONS } from '@/lib/constants'

const SIZE_SUGGESTIONS = ['Small', 'Medium', 'Large', 'Regular', 'XL']

export default function ProductForm({ isOpen, onClose, onSave, categories, product, imagesEnabled = true }) {
  const [form, setForm] = useState({
    name: '', price: '', description: '', imageEmoji: '☕', imageUrl: '', available: true, categoryId: '', printer: 'FRONT', loyaltyEnabled: false,
  })
  const [sizes, setSizes] = useState([])
  const [draftModifiers, setDraftModifiers] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // Seed the form when the modal opens (or switches to a different product).
  // Gated on `isOpen` + `product?.id` — NOT on the `product`/`categories`
  // object identity — so an in-progress edit (e.g. an emoji pick) is never
  // wiped by an unrelated parent re-render, while reopening always shows the
  // latest saved values (the open transition re-runs this).
  useEffect(() => {
    if (!isOpen) return
    if (product) {
      setForm({
        name: product.name,
        price: String(product.price),
        description: product.description,
        imageEmoji: product.imageEmoji,
        imageUrl: product.imageUrl ?? '',
        available: product.available,
        categoryId: String(product.categoryId),
        printer: product.printer ?? 'FRONT',
        loyaltyEnabled: product.loyaltyEnabled ?? false,
      })
      setSizes(product.sizes?.map((s) => ({ label: s.label, price: String(s.price) })) ?? [])
      setDraftModifiers([])
    } else {
      setForm({
        name: '', price: '', description: '', imageEmoji: '☕', imageUrl: '', available: true,
        categoryId: categories[0]?.id ? String(categories[0].id) : '', printer: 'FRONT', loyaltyEnabled: false,
      })
      setSizes([])
      setDraftModifiers([])
    }
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id])

  function addSize(label = '') {
    setSizes((prev) => [...prev, { label, price: '' }])
  }

  function removeSize(idx) {
    setSizes((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateSize(idx, field, value) {
    setSizes((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/uploads/product-image', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to upload image')
        return
      }
      setForm((prev) => ({ ...prev, imageUrl: data.url }))
    } catch {
      setError('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return setError('Name is required')
    if (!form.price || isNaN(parseFloat(form.price))) return setError('Valid base price is required')
    if (!form.categoryId) return setError('Category is required')
    for (const s of sizes) {
      if (!s.label.trim()) return setError('Each size must have a name')
      if (!s.price || isNaN(parseFloat(s.price))) return setError(`Price for "${s.label}" is required`)
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        price: parseFloat(form.price),
        categoryId: parseInt(form.categoryId),
        imageUrl: form.imageUrl || null,
        loyaltyEnabled: form.loyaltyEnabled,
        sizes: sizes.map((s) => ({ label: s.label.trim(), price: parseFloat(s.price) })),
        ...(product?.id ? {} : { modifiers: draftModifiers }),
      })
    } catch (err) {
      setError(err.message ?? 'Failed to save product')
      setSaving(false)
      return
    }
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($) *</label>
            <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              min="0" step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
              <option value="">Select...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Sizes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
          </div>

          {sizes.length > 0 && (
            <div className="space-y-2 mb-3">
              {sizes.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => updateSize(idx, 'label', e.target.value)}
                    placeholder="Size name"
                    className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <span className="text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={s.price}
                    onChange={(e) => updateSize(idx, 'price', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button type="button" onClick={() => removeSize(idx)}
                    aria-label={`Remove ${s.label || 'this'} size`}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {SIZE_SUGGESTIONS.filter((s) => !sizes.find((x) => x.label === s)).map((s) => (
              <button key={s} type="button" onClick={() => addSize(s)}
                className="px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
                + {s}
              </button>
            ))}
            <button type="button" onClick={() => addSize('')}
              className="px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
              + Custom
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          {product?.id ? (
            <ModifierManager productId={product.id} />
          ) : (
            <DraftModifierManager modifiers={draftModifiers} onChange={setDraftModifiers} />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Short description" />
        </div>

        <div>
          {imagesEnabled && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Image</label>
              <div className="flex items-center gap-3 mb-3">
                <ProductThumb
                  product={form}
                  emojiClassName="text-4xl"
                  imgClassName="w-16 h-16 rounded-xl object-cover border border-gray-200"
                />
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : form.imageUrl ? 'Replace Image' : 'Upload Image'}
                  </Button>
                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, imageUrl: '' }))}
                      className="text-xs text-red-500 hover:text-red-600 text-left"
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-2">JPEG, PNG, WebP, or GIF up to 2 MB. Emoji below is used when no image is set.</p>
            </>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">{imagesEnabled ? 'Emoji Fallback' : 'Icon'}</label>
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
          <input id="available" type="checkbox" checked={form.available} onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))} className="w-4 h-4 accent-gray-900" />
          <label htmlFor="available" className="text-sm text-gray-700">Available for sale</label>
        </div>
        <div className="flex items-center gap-3">
          <input id="loyalty" type="checkbox" checked={form.loyaltyEnabled ?? false} onChange={(e) => setForm((f) => ({ ...f, loyaltyEnabled: e.target.checked }))} className="w-4 h-4 accent-amber-500" />
          <label htmlFor="loyalty" className="text-sm text-gray-700">Count toward stamp card <span className="text-gray-400 text-xs">(loyalty program)</span></label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Printer Station</label>
          <div className="flex gap-2">
            {[
              { value: 'FRONT', label: '☕ Front (Barista)' },
              { value: 'KITCHEN', label: '🍳 Kitchen' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, printer: value }))}
                className={`flex-1 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                  form.printer === value
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving || uploading} className="flex-1">
            {saving ? 'Saving...' : 'Save Product'}
          </Button>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
