'use client'

import { useState, useEffect } from 'react'
import CategoryManager from '@/components/admin/menu/CategoryManager'
import ProductTable from '@/components/admin/menu/ProductTable'
import ProductForm from '@/components/admin/menu/ProductForm'
import ComboManager from '@/components/admin/menu/ComboManager'
import ComboForm from '@/components/admin/menu/ComboForm'
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext'
import { usePromptDialog } from '@/hooks/usePromptDialog'

export default function AdminMenuPage() {
  const { confirm, alert, dialog } = usePromptDialog()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [comboFormOpen, setComboFormOpen] = useState(false)
  const [editCombo, setEditCombo] = useState(null)
  const { settings: flags } = useFeatureSettings()
  const imagesEnabled = flags?.productImagesEnabled ?? true

  const realProducts = products.filter((p) => !p.isCombo)
  const combos = products.filter((p) => p.isCombo)

  async function loadData() {
    // The menu GET routes send a cacheable Cache-Control (for the customer
    // edge/CDN), so the manager must bypass the browser HTTP cache or a
    // refetch right after a save returns the pre-save list (looks unsaved).
    const [catRes, prodRes] = await Promise.all([
      fetch('/api/categories', { cache: 'no-store' }),
      fetch('/api/products', { cache: 'no-store' }),
    ])
    const catData = await catRes.json()
    const prodData = await prodRes.json()
    setCategories(Array.isArray(catData) ? catData : [])
    setProducts(Array.isArray(prodData) ? prodData : [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function openAdd() {
    setEditProduct(null)
    setFormOpen(true)
  }

  function openEdit(product) {
    setEditProduct(product)
    setFormOpen(true)
  }

  async function handleSave(data) {
    const res = editProduct
      ? await fetch(`/api/products/${editProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      : await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Failed to save product')
    }
    await loadData()
  }

  async function handleDelete(id) {
    if (!await confirm('Delete this product?', { title: 'Delete product' })) return
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      await alert(data.error ?? 'Failed to delete product', { title: 'Could not delete' })
      return
    }
    loadData()
  }

  function openAddCombo() {
    setEditCombo(null)
    setComboFormOpen(true)
  }

  function openEditCombo(combo) {
    setEditCombo(combo)
    setComboFormOpen(true)
  }

  async function handleSaveCombo(data) {
    const res = editCombo
      ? await fetch(`/api/combos/${editCombo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      : await fetch('/api/combos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Failed to save combo')
    }
    await loadData()
  }

  async function handleDeleteCombo(id) {
    if (!await confirm('Delete this combo?', { title: 'Delete combo' })) return
    const res = await fetch(`/api/combos/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      await alert(data.error ?? 'Failed to delete combo', { title: 'Could not delete' })
      return
    }
    loadData()
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-8">
          <CategoryManager categories={categories} onRefresh={loadData} />
          <ProductTable
            products={realProducts}
            categories={categories}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openAdd}
          />
          <ComboManager
            combos={combos}
            onEdit={openEditCombo}
            onDelete={handleDeleteCombo}
            onAdd={openAddCombo}
          />
        </div>
      )}

      {formOpen && (
        <ProductForm
          key={editProduct?.id ?? 'new'}
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
          categories={categories}
          product={editProduct}
          imagesEnabled={imagesEnabled}
        />
      )}
      {comboFormOpen && (
        <ComboForm
          key={editCombo?.id ?? 'new'}
          isOpen={comboFormOpen}
          onClose={() => setComboFormOpen(false)}
          onSave={handleSaveCombo}
          products={realProducts}
          combo={editCombo}
        />
      )}
      {dialog}
    </div>
  )
}
