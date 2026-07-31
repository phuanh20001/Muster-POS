'use client'

import { useState } from 'react'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import EmptyState from '@/components/shared/EmptyState'
import ProductThumb from '@/components/shared/ProductThumb'
import { formatCurrency } from '@/lib/formatters'

export default function ProductTable({ products, categories, onEdit, onDelete, onAdd }) {
  const [filterCatId, setFilterCatId] = useState('')

  const filtered = filterCatId
    ? products.filter((p) => p.categoryId === parseInt(filterCatId))
    : products

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-semibold text-gray-800 flex-1">Products</h2>
        <select
          value={filterCatId}
          onChange={(e) => setFilterCatId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={onAdd}>+ Add Product</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🍽️" title="No products" description="Add your first product below." />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200"
            >
              <ProductThumb product={p} emojiClassName="text-2xl" imgClassName="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{p.name}</span>
                  {!p.available && (
                    <Badge className="bg-red-100 text-red-600">Unavailable</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{p.category?.name}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    p.printer === 'KITCHEN' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {p.printer === 'KITCHEN' ? '🍳 Kitchen' : '☕ Front'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold text-gray-900 text-sm">{formatCurrency(p.price)}</div>
                {p.sizes?.length > 0 && (
                  <div className="flex gap-1 mt-1 justify-end">
                    {p.sizes.map((s) => (
                      <span key={s.id} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">
                        {s.label[0]} {formatCurrency(s.price)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(p)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(p.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
