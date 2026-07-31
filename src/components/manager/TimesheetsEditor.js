'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDateForApi } from '@/lib/formatters'
import { pairClockEventsForDisplay } from '@/lib/clockPairs'
import { canEditClockTarget } from '@/lib/clockEdit'
import { snapToHalfHour } from '@/lib/clockTime'
import HalfHourTimePicker from '@/components/shared/HalfHourTimePicker'

function formatDuration(ms) {
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function toHHMM(d) {
  const date = new Date(d)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function buildTimestamp(dateStr, timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(dateStr)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export default function TimesheetsEditor({ editorRole, subtitle }) {
  const [date, setDate] = useState(formatDateForApi(new Date()))
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingPair, setEditingPair] = useState(null)
  const [saving, setSaving] = useState(false)
  const [addingOut, setAddingOut] = useState(null)
  const [error, setError] = useState('')

  const loadRecords = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`/api/clock?date=${date}`)
      .then((r) => r.json())
      .then((d) => { setRecords(Array.isArray(d) ? d : []); setLoading(false) })
  }, [date])

  useEffect(() => { loadRecords() }, [loadRecords])

  const byUser = {}
  for (const r of records) {
    const uid = r.userId
    if (!byUser[uid]) byUser[uid] = { user: r.user, events: [] }
    byUser[uid].events.push(r)
  }

  const rows = Object.values(byUser).map(({ user, events }) => {
    const pairs = pairClockEventsForDisplay(events)
    // Clamp negatives so a bad pair (out before in) can't subtract from the total.
    const totalMs = pairs.reduce((s, p) => s + Math.max(0, p.duration ?? 0), 0)
    const editable = canEditClockTarget(editorRole, user.role)
    return { user, pairs, totalMs, editable }
  })

  function startEdit(pair) {
    setError('')
    setEditingPair({
      inId: pair.in.id,
      outId: pair.out?.id ?? null,
      inTime: snapToHalfHour(toHHMM(pair.in.timestamp)),
      outTime: pair.out ? snapToHalfHour(toHHMM(pair.out.timestamp)) : '',
    })
    setAddingOut(null)
  }

  async function handleApiError(res) {
    const d = await res.json().catch(() => ({}))
    setError(d.error ?? 'Request failed')
  }

  async function saveEdit() {
    if (!editingPair) return
    setSaving(true)
    setError('')
    try {
      const inRes = await fetch(`/api/clock/${editingPair.inId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: buildTimestamp(date, editingPair.inTime) }),
      })
      if (!inRes.ok) { await handleApiError(inRes); return }
      if (editingPair.outId && editingPair.outTime) {
        const outRes = await fetch(`/api/clock/${editingPair.outId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timestamp: buildTimestamp(date, editingPair.outTime) }),
        })
        if (!outRes.ok) { await handleApiError(outRes); return }
      }
      setEditingPair(null)
      loadRecords()
    } finally {
      setSaving(false)
    }
  }

  async function saveAddOut(userId, time) {
    if (!time) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'OUT', timestamp: buildTimestamp(date, time) }),
      })
      if (!res.ok) { await handleApiError(res); return }
      setAddingOut(null)
      loadRecords()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{subtitle}</p>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setEditingPair(null); setAddingOut(null); setError('') }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      {error && (
        <p className="text-sm text-red-600 font-medium mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">🕐</div>
          <p className="text-gray-400 text-sm">No clock records for this date</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(({ user, pairs, totalMs, editable }) => (
            <div key={user.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {user.name[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold text-gray-900 text-sm truncate">{user.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{user.role}</span>
                  {!editable && (
                    <span className="text-xs text-gray-400 italic shrink-0">view only</span>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 shrink-0 ml-2">{formatDuration(totalMs)} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold">Clock In</th>
                      <th className="text-left px-4 py-2 font-semibold">Clock Out</th>
                      <th className="text-right px-4 py-2 font-semibold">Duration</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((p, i) => {
                      const isEditing = editingPair?.inId === p.in.id
                      const isAddingOutRow = addingOut?.inId === p.in.id

                      if (isEditing) {
                        return (
                          <tr key={i} className="border-b border-gray-50 last:border-0 bg-blue-50">
                            <td className="px-4 py-2">
                              <HalfHourTimePicker compact
                                value={editingPair.inTime}
                                onChange={(t) => setEditingPair((prev) => ({ ...prev, inTime: t }))}
                              />
                            </td>
                            <td className="px-4 py-2">
                              {p.out ? (
                                <HalfHourTimePicker compact
                                  value={editingPair.outTime}
                                  onChange={(t) => setEditingPair((prev) => ({ ...prev, outTime: t }))}
                                />
                              ) : (
                                <span className="text-xs text-gray-400 italic">No clock-out</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-400 text-xs italic">editing</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1 justify-end">
                                <button onClick={saveEdit} disabled={saving}
                                  className="px-2.5 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-50">
                                  {saving ? '...' : 'Save'}
                                </button>
                                <button onClick={() => setEditingPair(null)}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      if (!p.out && isAddingOutRow) {
                        return (
                          <tr key={i} className="border-b border-gray-50 last:border-0 bg-amber-50">
                            <td className="px-4 py-2.5 text-gray-700">{formatTime(p.in.timestamp)}</td>
                            <td className="px-4 py-2">
                              <HalfHourTimePicker compact
                                value={addingOut.time}
                                onChange={(t) => setAddingOut((prev) => ({ ...prev, time: t }))}
                              />
                            </td>
                            <td className="px-4 py-2 text-right text-gray-400 text-xs italic">adding</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => saveAddOut(user.id, addingOut.time)} disabled={saving || !addingOut.time}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">
                                  {saving ? '...' : 'Add'}
                                </button>
                                <button onClick={() => setAddingOut(null)}
                                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={i} className="border-b border-gray-50 last:border-0 group">
                          <td className="px-4 py-2.5 text-gray-700">{formatTime(p.in.timestamp)}</td>
                          <td className="px-4 py-2.5 text-gray-700">
                            {p.out ? formatTime(p.out.timestamp) : <span className="text-amber-500 font-medium">Still clocked in</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{formatDuration(p.duration)}</td>
                          <td className="px-4 py-2.5">
                            {editable && (
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEdit(p)} title="Edit times"
                                  className="px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-100">
                                  Edit
                                </button>
                                {!p.out && (
                                  <button onClick={() => { setAddingOut({ inId: p.in.id, time: snapToHalfHour(toHHMM(new Date())) }); setEditingPair(null) }}
                                    title="Add clock-out"
                                    className="px-2 py-1 rounded-lg border border-amber-200 text-xs text-amber-600 hover:bg-amber-50">
                                    + Out
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
