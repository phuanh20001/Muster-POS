'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { D, sum, roundCents, gt, lt, max } from '@/lib/money'
import { effectiveModifiers } from '@/lib/productModifiers'
import ProductThumb from '@/components/shared/ProductThumb'

// Resolves a combo's slots into a single fixed-price line. Each slot picks one
// component product and can customize it (size + add-ons); customizations add
// their upcharge on top of the combo's fixed price. Components and add-ons are
// emitted as snapshot modifiers (source 'combo') so they print but never earn
// per-component stamps/stock.

function cheapestSize(full) {
  if (!full?.sizes?.length) return null
  return full.sizes.reduce((min, s) => (lt(s.price, min.price) ? s : min))
}

function modsFor(full) {
  return effectiveModifiers(full)
}

function sizeDeltaFor(full, sizeLabel) {
  if (!full?.sizes?.length || !sizeLabel) return D(0)
  const chosen = full.sizes.find((s) => s.label === sizeLabel)
  const cheap = cheapestSize(full)
  if (!chosen || !cheap) return D(0)
  return max(D(0), D(chosen.price).minus(cheap.price))
}

export default function ComboBuilderModal({ combo, products = [], initialSelections, initialNotes, editKey = null, onConfirm, onClose }) {
  const slots = combo?.comboSlots ?? []
  const [picks, setPicks] = useState({})
  const [notes, setNotes] = useState('')

  const findProduct = (id) => products.find((p) => p.id === id)

  useEffect(() => {
    if (!combo) return
    const initial = {}
    if (initialSelections?.length) {
      for (const sel of initialSelections) {
        initial[sel.slotId] = {
          productId: sel.productId,
          size: sel.size ?? null,
          modifiers: sel.modifiers ?? [],
        }
      }
    } else {
      for (const slot of slots) {
        const productId = slot.options[0]?.productId
        const full = findProduct(productId)
        initial[slot.id] = {
          productId,
          size: cheapestSize(full)?.label ?? null,
          modifiers: [],
        }
      }
    }
    setPicks(initial)
    setNotes(initialNotes ?? '')
  }, [combo?.id, editKey])

  if (!combo) return null

  function selectOption(slotId, productId) {
    const full = findProduct(productId)
    setPicks((prev) => ({
      ...prev,
      [slotId]: { productId, size: cheapestSize(full)?.label ?? null, modifiers: [] },
    }))
  }

  function setSize(slotId, sizeLabel) {
    setPicks((prev) => ({ ...prev, [slotId]: { ...prev[slotId], size: sizeLabel } }))
  }

  function toggleMod(slotId, mod) {
    setPicks((prev) => {
      const cur = prev[slotId]
      const exists = cur.modifiers.some((m) => m.id === mod.id && m.source === mod.source)
      const modifiers = exists
        ? cur.modifiers.filter((m) => !(m.id === mod.id && m.source === mod.source))
        : [...cur.modifiers, { id: mod.id, name: mod.name, price: mod.price, source: mod.source }]
      return { ...prev, [slotId]: { ...cur, modifiers } }
    })
  }

  const allChosen = slots.every((slot) => picks[slot.id]?.productId != null)

  const upchargeTotal = slots.reduce((acc, slot) => {
    const pick = picks[slot.id]
    if (!pick) return acc
    const full = findProduct(pick.productId)
    return acc.plus(sizeDeltaFor(full, pick.size)).plus(sum(pick.modifiers, (m) => m.price))
  }, D(0))
  const previewTotal = roundCents(D(combo.price).plus(upchargeTotal))

  function handleConfirm() {
    const selections = []
    const snapshots = []
    for (const slot of slots) {
      const pick = picks[slot.id]
      if (!pick) continue
      const full = findProduct(pick.productId)
      const name = full?.name ?? slot.options.find((o) => o.productId === pick.productId)?.product?.name ?? 'Item'
      const delta = roundCents(sizeDeltaFor(full, pick.size))
      snapshots.push({
        id: `c${slot.id}`,
        source: 'combo',
        name: `${name}${pick.size ? ` (${pick.size})` : ''}`,
        price: delta.toNumber(),
      })
      for (const m of pick.modifiers) {
        snapshots.push({ id: `c${slot.id}m${m.source}${m.id}`, source: 'combo', name: m.name, price: m.price })
      }
      selections.push({ slotId: slot.id, productId: pick.productId, size: pick.size, modifiers: pick.modifiers })
    }
    onConfirm({ modifiers: snapshots, notes: notes.trim(), selections })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="mb-3 flex justify-center">
            <ProductThumb product={combo} emojiClassName="text-5xl" imgClassName="w-20 h-20 rounded-xl object-cover" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 text-center">{combo.name}</h2>
          {combo.description && (
            <p className="text-sm text-gray-400 text-center mt-1">{combo.description}</p>
          )}
          <p className="text-center font-mono font-semibold text-gray-700 mt-1">
            {formatCurrency(previewTotal)}
          </p>
        </div>

        <div className="overflow-y-auto">
          {slots.map((slot) => {
            const pick = picks[slot.id]
            const single = slot.options.length === 1
            const full = pick ? findProduct(pick.productId) : null
            const sizes = full?.sizes ?? []
            const addOns = modsFor(full)
            const cheap = cheapestSize(full)
            return (
              <div key={slot.id} className="px-6 py-5 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {slot.label || (single ? 'Included' : 'Choose one')}
                </p>

                {/* Option picker */}
                {single ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <ProductThumb product={slot.options[0].product} emojiClassName="text-xl" imgClassName="w-7 h-7 rounded object-cover" />
                    <span>{slot.options[0].product.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slot.options.map((opt) => {
                      const selected = pick?.productId === opt.productId
                      return (
                        <button
                          key={opt.id}
                          onClick={() => selectOption(slot.id, opt.productId)}
                          className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all flex items-center gap-1.5 ${
                            selected
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <span>{opt.product.imageEmoji}</span>
                          <span>{opt.product.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Size selector (upcharge above the cheapest size) */}
                {sizes.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">Size</p>
                    <div className="flex flex-wrap gap-2">
                      {sizes.map((s) => {
                        const selected = pick?.size === s.label
                        const delta = max(D(0), D(s.price).minus(cheap?.price ?? s.price))
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSize(slot.id, s.label)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all flex items-center gap-1.5 ${
                              selected
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <span>{s.label}</span>
                            {gt(delta, 0) && (
                              <span className={`font-mono text-xs ${selected ? 'text-gray-300' : 'text-gray-400'}`}>
                                +{formatCurrency(delta)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Add-ons */}
                {addOns.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">Add-ons</p>
                    <div className="flex flex-wrap gap-2">
                      {addOns.map((mod) => {
                        const selected = pick?.modifiers.some((m) => m.id === mod.id && m.source === mod.source)
                        return (
                          <button
                            key={`${mod.source}-${mod.id}`}
                            onClick={() => toggleMod(slot.id, mod)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all flex items-center gap-1.5 ${
                              selected
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <span>{mod.name}</span>
                            {gt(mod.price, 0) && (
                              <span className={`font-mono text-xs ${selected ? 'text-gray-300' : 'text-gray-400'}`}>
                                +{formatCurrency(mod.price)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Notes */}
          <div className="px-6 py-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Special Instructions</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="e.g. no onions, extra napkins…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!allChosen}
            className="flex-1 py-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-40">
            {editKey ? 'Update' : 'Add to Order'} — {formatCurrency(previewTotal)}
          </button>
        </div>
      </div>
    </div>
  )
}
