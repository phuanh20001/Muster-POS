import { formatCurrency } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'
import ProductThumb from '@/components/shared/ProductThumb'

export default function TopItemsChart({ items }) {
  if (!items || items.length === 0) {
    return <EmptyState icon="📊" title="No sales data" description="Place some orders to see top items." />
  }

  const max = Math.max(...items.map((i) => i.quantity))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold tracking-tight text-gray-900 mb-4">Top Items</h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.product.id} className="flex items-center gap-3">
            <span className="text-gray-400 text-sm w-4">{i + 1}</span>
            <ProductThumb product={item.product} emojiClassName="text-xl" imgClassName="w-8 h-8 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-800 truncate">{item.product.name}</span>
                <span className="text-gray-500 ml-2">{item.quantity} sold · {formatCurrency(item.revenue)}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded-full transition-all"
                  style={{ width: `${(item.quantity / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
