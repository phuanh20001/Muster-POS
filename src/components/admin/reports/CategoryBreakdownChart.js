import { formatCurrency } from '@/lib/formatters'
import EmptyState from '@/components/shared/EmptyState'

export default function CategoryBreakdownChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Category Breakdown</h3>
        <EmptyState icon="📊" title="No sales data" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Category Breakdown</h3>
      <div className="space-y-3">
        {data.map((cat) => (
          <div key={cat.categoryId}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 font-medium text-gray-800">
                <span>{cat.emoji}</span>
                <span>{cat.name}</span>
              </span>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{cat.quantity} sold</span>
                <span className="font-mono font-semibold text-gray-900">{formatCurrency(cat.revenue)}</span>
                <span className="w-10 text-right text-gray-400">{cat.percentage.toFixed(1)}%</span>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-800 rounded-full transition-all"
                style={{ width: `${cat.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
