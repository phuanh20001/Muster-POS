'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/formatters'

export default function HourlySalesChart({ data }) {
  const [mode, setMode] = useState('revenue')

  if (!data || data.length === 0) return null

  const peak = data.reduce((max, h) => (Number(h[mode]) > Number(max[mode]) ? h : max), data[0])
  const maxVal = Math.max(...data.map((h) => Number(h[mode])), 1)

  function label(hour) {
    if (hour === 0) return '12am'
    if (hour === 12) return '12pm'
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Hourly Sales</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Peak: {label(peak.hour)} —{' '}
            {mode === 'revenue' ? formatCurrency(peak.revenue) : `${peak.count} order${peak.count !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[{ key: 'revenue', label: '$' }, { key: 'count', label: '#' }].map(({ key, label: lbl }) => (
            <button key={key} onClick={() => setMode(key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                mode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-0.5 h-32">
        {data.map((h) => {
          const heightPct = maxVal > 0 ? (h[mode] / maxVal) * 100 : 0
          const isPeak = h.hour === peak.hour && h[mode] > 0
          return (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t transition-all ${isPeak ? 'bg-gray-900' : 'bg-gray-200 group-hover:bg-gray-400'} min-h-0`}
                />
              </div>
              {/* Tooltip */}
              {h[mode] > 0 && (
                <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                  <div className="bg-gray-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap">
                    {label(h.hour)}: {mode === 'revenue' ? formatCurrency(h.revenue) : `${h.count} orders`}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* X-axis labels every 3 hours */}
      <div className="flex mt-1">
        {data.map((h) => (
          <div key={h.hour} className="flex-1 text-center">
            {h.hour % 3 === 0 ? (
              <span className="text-xs text-gray-400">{label(h.hour)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
