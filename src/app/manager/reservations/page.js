'use client'

import { useState, useEffect, useCallback } from 'react'
import { getClientDateRange } from '@/lib/clientDateRange'

const STATUS_META = {
  CONFIRMED: { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-600' },
  NO_SHOW: { label: 'No-show', color: 'bg-purple-100 text-purple-600' },
}

const STATUS_BAR_COLOR = {
  CONFIRMED: 'bg-green-500',
  COMPLETED: 'bg-gray-400',
  CANCELLED: 'bg-red-400',
  NO_SHOW: 'bg-purple-400',
}

function toDateString(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

function getRangeForPeriod(period) {
  if (period === 'month') return getClientDateRange('calendarMonth')
  return getClientDateRange(period) ?? getClientDateRange('today')
}

function getDaysInRange(from, to) {
  const days = []
  let cur = from
  let guard = 0
  while (cur <= to && guard++ < 400) {
    days.push(cur)
    const next = addDays(cur, 1)
    if (next === cur) break
    cur = next
  }
  return days
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const LEAD_PRESETS = [30, 60, 120, 180]

export default function AdminReservationsPage() {
  const [period, setPeriod] = useState('week')
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [leadInput, setLeadInput] = useState('')
  const [savedLead, setSavedLead] = useState(null)
  const [savingLead, setSavingLead] = useState(false)
  const [leadMsg, setLeadMsg] = useState('')

  useEffect(() => {
    fetch('/api/reservation-settings')
      .then((r) => r.json())
      .then((d) => {
        const m = Number(d?.reminderLeadMinutes)
        if (m > 0) {
          setSavedLead(m)
          setLeadInput(String(m))
        }
      })
      .catch(() => {})
  }, [])

  async function saveLead(minutes) {
    if (!(minutes > 0) || savingLead) return
    setSavingLead(true)
    setLeadMsg('')
    try {
      const res = await fetch('/api/reservation-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderLeadMinutes: minutes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLeadMsg(data.error ?? 'Failed to save')
        return
      }
      setSavedLead(data.reminderLeadMinutes)
      setLeadInput(String(data.reminderLeadMinutes))
      setLeadMsg('Saved')
      setTimeout(() => setLeadMsg(''), 2500)
    } finally {
      setSavingLead(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRangeForPeriod(period)
    const res = await fetch(`/api/reservations?from=${from}&to=${to}`)
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const { from, to } = getRangeForPeriod(period)
  const days = getDaysInRange(from, to)

  const total = reservations.length
  const confirmed = reservations.filter(r => r.status === 'CONFIRMED' || r.status === 'COMPLETED').length
  const noShows = reservations.filter(r => r.status === 'NO_SHOW').length
  const noShowRate = total > 0 ? Math.round((noShows / total) * 100) : 0
  const avgParty = total > 0
    ? (reservations.reduce((s, r) => s + r.partySize, 0) / total).toFixed(1)
    : '—'

  const byDay = days.map(day => {
    const count = reservations.filter(r => r.scheduledAt.slice(0, 10) === day).length
    return { day, count }
  })
  const maxCount = Math.max(...byDay.map(d => d.count), 1)

  const byStatus = Object.keys(STATUS_META).map(status => ({
    status,
    count: reservations.filter(r => r.status === status).length,
  })).filter(s => s.count > 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">Reservation Analytics</h1>

      {/* Reminder lead time */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">⏰</span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reservation reminder</h2>
            <p className="text-xs text-gray-400">
              Staff get an on-screen alert this long before each booking.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {LEAD_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={savingLead}
              onClick={() => saveLead(m)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors disabled:opacity-50 ${
                savedLead === m
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}
            >
              {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60}m` : ''}`}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="number"
              min="5"
              max="1440"
              step="5"
              value={leadInput}
              onChange={(e) => setLeadInput(e.target.value)}
              placeholder="min"
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="button"
              disabled={savingLead || !(parseInt(leadInput) > 0)}
              onClick={() => saveLead(parseInt(leadInput))}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
        {leadMsg && (
          <p className={`text-sm font-medium mt-3 ${leadMsg === 'Saved' ? 'text-green-700' : 'text-red-600'}`}>
            {leadMsg}
          </p>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'today', label: 'Today' },
          { key: 'week', label: 'This Week' },
          { key: 'month', label: 'This Month' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              period === key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-16">Loading...</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Bookings', value: total, color: 'text-gray-900' },
              { label: 'Confirmed / Done', value: confirmed, color: 'text-green-600' },
              { label: 'No-show Rate', value: `${noShowRate}%`, color: noShowRate > 20 ? 'text-red-600' : 'text-gray-900' },
              { label: 'Avg Party Size', value: avgParty, color: 'text-gray-900' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Bookings by day bar chart */}
          {days.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Bookings by Day</h2>
              <div className="flex items-end gap-1.5 h-32">
                {byDay.map(({ day, count }) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-xs text-gray-500 tabular-nums">{count > 0 ? count : ''}</span>
                    <div
                      className="w-full bg-gray-900 rounded-t-md transition-all"
                      style={{ height: `${(count / maxCount) * 96}px`, minHeight: count > 0 ? '4px' : '0' }}
                    />
                    <span className="text-[10px] text-gray-400 truncate w-full text-center">
                      {formatShortDate(day)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Status Breakdown</h2>
            {total === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No reservations in this period</p>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="flex h-3 rounded-full overflow-hidden mb-4">
                  {byStatus.map(({ status, count }) => (
                    <div
                      key={status}
                      className={`${STATUS_BAR_COLOR[status] ?? 'bg-gray-300'} transition-all`}
                      style={{ width: `${(count / total) * 100}%` }}
                      title={`${STATUS_META[status]?.label}: ${count}`}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="space-y-2">
                  {byStatus.map(({ status, count }) => {
                    const meta = STATUS_META[status]
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${STATUS_BAR_COLOR[status] ?? 'bg-gray-300'}`} />
                          <span className="text-sm text-gray-700">{meta?.label ?? status}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">{count}</span>
                          <span className="text-xs text-gray-400 w-10 text-right">
                            {Math.round((count / total) * 100)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
