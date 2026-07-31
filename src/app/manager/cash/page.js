'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatTime, formatDate } from '@/lib/formatters'
import { D, sum, neg, gte } from '@/lib/money'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export default function CashPage() {
  const [session, setSession] = useState(undefined)
  const [shiftRoutineEnabled, setShiftRoutineEnabled] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [zReportLoading, setZReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [movements, setMovements] = useState([])
  const [movementDate, setMovementDate] = useState(todayString())

  async function load() {
    const [sessionRes, histRes, settingsRes] = await Promise.all([
      fetch('/api/cash').then((r) => r.json()),
      fetch('/api/cash/history').then((r) => r.json()).catch(() => []),
      fetch('/api/shift-settings').then((r) => r.json()).catch(() => null),
    ])
    setSession(sessionRes)
    setHistory(Array.isArray(histRes) ? histRes : [])
    if (settingsRes && typeof settingsRes.shiftRoutineEnabled === 'boolean') {
      setShiftRoutineEnabled(settingsRes.shiftRoutineEnabled)
    }
    setSettingsLoading(false)
  }

  async function loadMovements(date) {
    const res = await fetch(`/api/cash/movements?date=${date}`).then((r) => r.json()).catch(() => [])
    setMovements(Array.isArray(res) ? res : [])
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadMovements(movementDate) }, [movementDate])

  async function handlePrintZReport(sessionId) {
    setZReportLoading(true)
    setError('')
    const res = await fetch(`/api/cash/${sessionId}/z-report`, { method: 'POST' })
    setZReportLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to print Z-report')
    }
  }

  if (session === undefined || settingsLoading) {
    return <div className="p-6 text-gray-400 text-sm">Loading...</div>
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cash Drawer</h1>

      {!shiftRoutineEnabled && !session && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 mb-6">
          <p className="font-semibold text-gray-900 mb-1">No active till session</p>
          <p className="text-sm text-gray-600">
            Routine is off — cash sales work without opening the till.
          </p>
        </div>
      )}

      {shiftRoutineEnabled && !session && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
          <p className="font-semibold text-amber-900 mb-1">Till not open</p>
          <p className="text-sm text-amber-800">
            Owner must open the till from Admin → Shift.
          </p>
        </div>
      )}

      {session && (
        <div className="mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-600">Till Open</span>
                </div>
                <p className="text-xs text-gray-400">Opened {formatTime(session.openedAt)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePrintZReport(session.id)} disabled={zReportLoading}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  {zReportLoading ? 'Printing…' : 'Print Z-Report'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Opening Float</p>
                <p className="text-xl font-black font-mono text-gray-900">{formatCurrency(session.openingFloat)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Expected in Till</p>
                <p className="text-xl font-black font-mono text-gray-900">{formatCurrency(session.expectedCash ?? 0)}</p>
              </div>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>
      )}

      {/* Cash Movements */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Cash Movements</h2>
          <input
            type="date"
            value={movementDate}
            onChange={(e) => setMovementDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        {movements.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            No cash movements recorded for this date.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs text-gray-500">
                  <th className="text-left px-4 py-2.5 font-semibold">Time</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                  <th className="text-left px-4 py-2.5 font-semibold">By</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Note</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{formatTime(m.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {m.type === 'IN' ? '+ In' : '− Out'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.user?.name ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500">{m.note || <span className="text-gray-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${m.type === 'IN' ? 'text-green-600' : 'text-red-500'}`}>
                      {m.type === 'IN' ? '+' : '−'}{formatCurrency(m.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-500">Net</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                    {(() => {
                      const net = sum(movements, (m) => (m.type === 'IN' ? D(m.amount) : neg(m.amount)))
                      return `${gte(net, 0) ? '+' : ''}${formatCurrency(net.abs())}`
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs text-gray-500">
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Float</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Expected</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Counted</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Variance</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Z-Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((h) => {
                  const v = h.variance ?? 0
                  return (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{formatDate(h.openedAt)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{formatCurrency(h.openingFloat)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{h.expectedCash != null ? formatCurrency(h.expectedCash) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{h.closingCash != null ? formatCurrency(h.closingCash) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${Math.abs(v) <= 2 ? 'text-green-600' : 'text-red-600'}`}>
                        {h.variance != null ? `${v >= 0 ? '+' : ''}${formatCurrency(v)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handlePrintZReport(h.id)} disabled={zReportLoading}
                          className="text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50">
                          Print
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
