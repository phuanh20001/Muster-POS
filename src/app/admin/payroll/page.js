'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDateForApi } from '@/lib/formatters'
import { formatHalfHourDisplay } from '@/lib/clockTime'
import PrintReport from '@/components/shared/PrintReport'

function getWeekRange() {
  const today = new Date()
  const day = today.getDay()
  const mon = new Date(today)
  mon.setDate(today.getDate() - ((day + 6) % 7))
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: formatDateForApi(mon), to: formatDateForApi(sun) }
}

function formatHours(h) {
  if (!h && h !== 0) return '—'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
}

function toLocalHhmm(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatShiftRange(shift) {
  const start = formatHalfHourDisplay(toLocalHhmm(shift.start))
  if (!shift.end) return `${start} – …`
  return `${start} – ${formatHalfHourDisplay(toLocalHhmm(shift.end))}`
}

function dayHours(day) {
  if (!day) return 0
  return typeof day === 'number' ? day : day.hours
}

function DayCell({ day }) {
  if (!day || !dayHours(day)) {
    return <span className="text-gray-200">—</span>
  }
  const shifts = typeof day === 'object' && day.shifts ? day.shifts : []
  return (
    <div className="space-y-0.5">
      <div className="font-medium text-gray-700">{formatHours(dayHours(day))}</div>
      {shifts.map((s, i) => (
        <div key={i} className="text-[10px] text-gray-400 leading-tight whitespace-nowrap">
          {formatShiftRange(s)}
        </div>
      ))}
    </div>
  )
}

export default function PayrollPage() {
  const today = formatDateForApi(new Date())
  const week = getWeekRange()
  const [from, setFrom] = useState(week.from)
  const [to, setTo] = useState(week.to)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [printedAt, setPrintedAt] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/reports/payroll?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setData(Array.isArray(d) ? d : null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [from, to])

  useEffect(() => { load() }, [load])

  const dates = []
  const start = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDateForApi(new Date(d)))
  }

  function setPreset(preset) {
    if (preset === 'today') {
      setFrom(today); setTo(today)
    } else {
      setFrom(week.from); setTo(week.to)
    }
  }

  const colTotals = {}
  if (data) {
    for (const dateKey of dates) {
      colTotals[dateKey] = data.reduce((s, u) => s + dayHours(u.days[dateKey]), 0)
    }
  }
  const grandTotal = data ? Math.round(data.reduce((s, u) => s + u.totalHours, 0) * 100) / 100 : 0

  const dayLabel = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const rangeLabel = from === to
    ? new Date(from + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${new Date(from + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(to + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`

  function handlePrint() {
    if (!data || data.length === 0) return
    setPrintedAt(new Date())
    requestAnimationFrame(() => window.print())
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Payroll</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          <button onClick={() => setPreset('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${from === today && to === today ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            Today
          </button>
          <button onClick={() => setPreset('week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${from === week.from && to === week.to ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            This Week
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <span className="text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <button onClick={handlePrint} disabled={!data || data.length === 0}
          className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Print
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : !data || data.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-gray-400 text-sm">No clock records in this date range</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs text-gray-500">
                <th className="text-left px-4 py-2.5 font-semibold">Staff</th>
                <th className="text-left px-4 py-2.5 font-semibold">Role</th>
                {dates.map((d) => (
                  <th key={d} className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">
                    {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </th>
                ))}
                <th className="text-right px-4 py-2.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{u.role}</td>
                  {dates.map((d) => (
                    <td key={d} className="px-3 py-2.5 text-right text-gray-600 align-top min-w-[5.5rem]">
                      <DayCell day={u.days[d]} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatHours(u.totalHours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr className="text-xs font-semibold text-gray-500">
                <td className="px-4 py-2.5" colSpan={2}>Total</td>
                {dates.map((d) => (
                  <td key={d} className="px-3 py-2.5 text-right text-gray-700">
                    {colTotals[d] ? formatHours(Math.round(colTotals[d] * 100) / 100) : <span className="text-gray-200">—</span>}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-bold text-gray-900">{formatHours(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && data.length > 0 && (
        <PrintReport orientation="landscape" title="Payroll Report" range={rangeLabel} printedAt={printedAt}>
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Role</th>
                {dates.map((d) => <th key={d} className="num">{dayLabel(d)}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td className="staff">{u.name}</td>
                  <td className="role">{u.role}</td>
                  {dates.map((d) => {
                    const day = u.days[d]
                    if (!day || !dayHours(day)) return <td key={d} className="num"><span className="pr-dash">—</span></td>
                    const shifts = typeof day === 'object' && day.shifts ? day.shifts : []
                    return (
                      <td key={d} className="num">
                        <div className="pr-hrs">{formatHours(dayHours(day))}</div>
                        {shifts.map((s, i) => <div key={i} className="pr-shift">{formatShiftRange(s)}</div>)}
                      </td>
                    )
                  })}
                  <td className="num total">{formatHours(u.totalHours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                {dates.map((d) => (
                  <td key={d} className="num">
                    {colTotals[d] ? formatHours(Math.round(colTotals[d] * 100) / 100) : <span className="pr-dash">—</span>}
                  </td>
                ))}
                <td className="num grand">{formatHours(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </PrintReport>
      )}
    </div>
  )
}
