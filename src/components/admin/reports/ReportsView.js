'use client'

import { useState, useEffect } from 'react'
import DailySummaryCard from '@/components/admin/reports/DailySummaryCard'
import AccountingSummaryCard from '@/components/admin/reports/AccountingSummaryCard'
import TopItemsChart from '@/components/admin/reports/TopItemsChart'
import HourlySalesChart from '@/components/admin/reports/HourlySalesChart'
import CategoryBreakdownChart from '@/components/admin/reports/CategoryBreakdownChart'
import SquareReconcileCard from '@/components/admin/reports/SquareReconcileCard'
import { formatCurrency, formatDateForApi } from '@/lib/formatters'
import { getClientDateRange } from '@/lib/clientDateRange'

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7days', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
]

const VIEWS = [
  { key: 'sales', label: 'Sales report' },
  { key: 'square', label: 'Square reconcile' },
]

export default function ReportsView() {
  const [view, setView] = useState('sales')
  const [preset, setPreset] = useState('today')
  const [from, setFrom] = useState(formatDateForApi(new Date()))
  const [to, setTo] = useState(formatDateForApi(new Date()))
  const [report, setReport] = useState(null)
  const [accounting, setAccounting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [squareRecon, setSquareRecon] = useState(null)
  const [squareLoading, setSquareLoading] = useState(false)

  useEffect(() => {
    if (preset !== 'custom') {
      const range = getClientDateRange(preset)
      if (range) {
        setFrom(range.from)
        setTo(range.to)
      }
    }
  }, [preset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const q = `from=${from}&to=${to}`
      const [reportRes, acctRes] = await Promise.all([
        fetch(`/api/reports?${q}`),
        fetch(`/api/reports/accounting?${q}`),
      ])
      setReport(await reportRes.json())
      setAccounting(acctRes.ok ? await acctRes.json() : null)
      setLoading(false)
    }
    if (from && to) load()
  }, [from, to])

  // Reconcile hits the Square API, so only fetch it while that tab is open.
  useEffect(() => {
    if (view !== 'square' || !from || !to) return
    async function load() {
      setSquareLoading(true)
      const res = await fetch(`/api/reports/square-reconcile?from=${from}&to=${to}`)
      setSquareRecon(res.ok ? await res.json() : null)
      setSquareLoading(false)
    }
    load()
  }, [view, from, to])

  function exportCsv(type) {
    window.location.href = `/api/reports/export?type=${type}&from=${from}&to=${to}`
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                view === v.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              preset === p.key
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm">
          <span className="block text-xs text-gray-500 mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPreset('custom') }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-gray-500 mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPreset('custom') }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </label>
        {view === 'sales' && (
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => exportCsv('summary')}
              className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-gray-400 text-gray-700"
            >
              Export summary CSV
            </button>
            <button
              type="button"
              onClick={() => exportCsv('orders')}
              className="px-3 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Export orders CSV
            </button>
          </div>
        )}
      </div>

      {view === 'square' ? (
        squareLoading ? (
          <div className="text-gray-400 text-sm">Checking Square…</div>
        ) : squareRecon?.configured === false ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
            Square is not configured as a payment provider, so there is nothing to reconcile.
            Card sales taken on Stripe appear in the Sales report.
          </div>
        ) : squareRecon && (squareRecon.ordersChecked > 0 || squareRecon.payouts.length > 0 || squareRecon.payoutError) ? (
          <SquareReconcileCard data={squareRecon} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
            No Square card sales or payouts in this date range.
          </div>
        )
      ) : loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-6">
          <AccountingSummaryCard data={accounting} />
          <DailySummaryCard data={report} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopItemsChart items={report?.topItems} />
            <CategoryBreakdownChart data={report?.categoryBreakdown} />
          </div>
          <HourlySalesChart data={report?.hourlySales} />

          {report?.staffBreakdown?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Staff Activity</h3>
              <div className="space-y-2">
                {report.staffBreakdown.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                        {s.name[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{s.orderCount} order{s.orderCount !== 1 ? 's' : ''}</span>
                      <span className="font-mono font-semibold text-gray-900">{formatCurrency(s.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
