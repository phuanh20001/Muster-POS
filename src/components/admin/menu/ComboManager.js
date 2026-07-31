'use client'

import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import EmptyState from '@/components/shared/EmptyState'
import ProductThumb from '@/components/shared/ProductThumb'
import { formatCurrency } from '@/lib/formatters'

export default function ComboManager({ combos, onEdit, onDelete, onAdd }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-semibold text-gray-800 flex-1">Combos / Meal Deals</h2>
        <Button variant="primary" size="sm" onClick={onAdd}>+ Add Combo</Button>
      </div>

      {combos.length === 0 ? (
        <EmptyState icon="🍔" title="No combos" description="Bundle items at a set price — add your first combo." />
      ) : (
        <div className="space-y-2">
          {combos.map((c) => (
            <div key={c.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
              <ProductThumb product={c} emojiClassName="text-2xl" imgClassName="w-10 h-10 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  {!c.available && <Badge className="bg-red-100 text-red-600">Unavailable</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">
                    {c.comboSlots?.length ?? 0} item{(c.comboSlots?.length ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="font-mono font-semibold text-gray-900 text-sm">{formatCurrency(c.price)}</div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(c.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
