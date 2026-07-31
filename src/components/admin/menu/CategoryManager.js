'use client'

import { useState } from 'react'
import Button from '@/components/shared/Button'
import CategoryModifierManager from './CategoryModifierManager'
import { usePromptDialog } from '@/hooks/usePromptDialog'
import { MENU_EMOJI_OPTIONS } from '@/lib/constants'

const COLOR_OPTIONS = ['#92400E', '#065F46', '#1E40AF', '#7C3AED', '#B45309', '#DC2626', '#059669', '#6B7280']

export default function CategoryManager({ categories, onRefresh }) {
  const { confirm, alert, dialog } = usePromptDialog()
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', color: COLOR_OPTIONS[0], emoji: '☕' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function startAdd() {
    setAdding(true)
    setEditId(null)
    setForm({ name: '', color: COLOR_OPTIONS[0], emoji: '☕' })
    setError('')
  }

  function startEdit(cat) {
    setEditId(cat.id)
    setAdding(false)
    setForm({ name: cat.name, color: cat.color, emoji: cat.emoji })
    setError('')
  }

  function cancel() {
    setAdding(false)
    setEditId(null)
    setError('')
  }

  async function save() {
    if (!form.name.trim()) return setError('Name is required')
    setSaving(true)
    const res = adding
      ? await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      : await fetch(`/api/categories/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to save category')
      return
    }
    cancel()
    onRefresh()
  }

  async function deleteCategory(id) {
    if (!await confirm('This will fail if the category still has products.', { title: 'Delete category?' })) return
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      await alert(data.error, { title: 'Could not delete' })
      return
    }
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800">Categories</h2>
        {!adding && !editId && (
          <Button variant="primary" size="sm" onClick={startAdd}>+ Add Category</Button>
        )}
      </div>

      {/* Form */}
      {(adding || editId) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. Pastries"
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emoji</label>
            <div className="flex gap-2 flex-wrap">
              {MENU_EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                  className={`text-xl p-1.5 rounded-lg border-2 ${form.emoji === e ? 'border-gray-900 bg-gray-100' : 'border-transparent hover:bg-gray-100'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-4 ${form.color === c ? 'border-gray-800' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {editId && (
            <CategoryModifierManager
              categoryId={editId}
              categoryName={form.name}
            />
          )}

          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
            <span className="text-2xl">{cat.emoji}</span>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            <div className="flex-1">
              <div className="font-medium text-gray-800">{cat.name}</div>
              <div className="text-xs text-gray-400">{cat._count?.products ?? 0} products</div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => startEdit(cat)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => deleteCategory(cat.id)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
      {dialog}
    </div>
  )
}
