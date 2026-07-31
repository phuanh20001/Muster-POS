'use client'

import { formatCurrency } from '@/lib/formatters'
import { D, sum, gt } from '@/lib/money'

export const DENOMS = [
  { label: '$100', value: 100 },
  { label: '$50', value: 50 },
  { label: '$20', value: 20 },
  { label: '$10', value: 10 },
  { label: '$5', value: 5 },
  { label: '$2', value: 2 },
  { label: '$1', value: 1 },
  { label: '50¢', value: 0.5 },
  { label: '20¢', value: 0.2 },
  { label: '10¢', value: 0.1 },
  { label: '5¢', value: 0.05 },
]

export function denomTotal(denoms) {
  return sum(DENOMS, (d) => D(parseFloat(denoms[d.value]) || 0).times(d.value))
}

export default function DenomCounter({ denoms, onChange, totalLabel = 'Counted Total' }) {
  const total = denomTotal(denoms)
  const hasCounted = Object.values(denoms).some((v) => v && parseFloat(v) > 0)

  return (
    <div>
      <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
        {DENOMS.map((d, i) => {
          const qty = parseFloat(denoms[d.value]) || 0
          const lineTotal = D(qty).times(d.value)
          return (
            <div key={d.value} className={`flex items-center gap-3 px-4 py-2 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
              <span className="w-10 text-sm font-semibold text-gray-700 shrink-0">{d.label}</span>
              <span className="text-gray-300 text-xs shrink-0">×</span>
              <input
                type="number" min="0" step="1" placeholder="0"
                value={denoms[d.value] ?? ''}
                onChange={(e) => onChange({ ...denoms, [d.value]: e.target.value })}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <span className="ml-auto text-sm font-mono text-gray-500 w-16 text-right">
                {gt(lineTotal, 0) ? formatCurrency(lineTotal) : '—'}
              </span>
            </div>
          )
        })}
        <div className={`flex items-center justify-between px-4 py-3 ${hasCounted ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
          <span className="text-sm font-semibold">{totalLabel}</span>
          <span className="text-lg font-black font-mono">{hasCounted ? formatCurrency(total) : '—'}</span>
        </div>
      </div>
    </div>
  )
}
