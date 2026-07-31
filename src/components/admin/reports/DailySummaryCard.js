import { formatCurrency } from '@/lib/formatters'

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold tracking-tight text-gray-900">{value}</div>
    </div>
  )
}

export default function DailySummaryCard({ data }) {
  if (!data) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="Gross sales (completed)" value={formatCurrency(data.revenue)} />
      <StatCard label="Orders" value={data.orderCount} />
      <StatCard label="Avg Order Value" value={formatCurrency(data.avgOrderValue)} />
    </div>
  )
}
