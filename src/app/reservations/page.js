'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '@/components/shared/Modal'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import ReservationRecurrenceFields, {
  emptyRecurrence,
  validateRepeatForm,
  buildSeriesPayload,
  recurrenceFromSeries,
} from '@/components/shared/ReservationRecurrenceFields'
import { describeRecurrence } from '@/lib/recurrence'
import { useReservations } from '@/contexts/ReservationsContext'
import { usePromptDialog } from '@/hooks/usePromptDialog'

const STATUSES = {
  CONFIRMED: { label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  COMPLETED: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
  NO_SHOW: { label: 'No-show', color: 'bg-purple-100 text-purple-700' },
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const emptyForm = { name: '', phone: '', date: '', time: '', partySize: '2', note: '', ...emptyRecurrence }

export default function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()))
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm, date: toDateString(new Date()) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [editingSeriesId, setEditingSeriesId] = useState(null)
  const [series, setSeries] = useState([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const pendingActionRef = useRef(null)
  const { refresh: refreshBadge } = useReservations()
  const { confirm, dialog } = usePromptDialog()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/reservations?date=${selectedDate}`)
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [selectedDate])

  const loadSeries = useCallback(async () => {
    const res = await fetch('/api/reservation-series')
    const data = await res.json()
    setSeries(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSeries() }, [loadSeries])

  function shiftDate(days) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(toDateString(d))
  }

  function openModal() {
    setForm({ ...emptyForm, date: selectedDate })
    setEditingSeriesId(null)
    setError('')
    setSuccess(false)
    setModalOpen(true)
  }

  function openEditSeries(s) {
    setForm({
      name: s.name,
      phone: s.phone || '',
      date: toDateString(new Date(s.anchorDate)),
      time: s.time,
      partySize: String(s.partySize),
      note: s.note || '',
      ...recurrenceFromSeries(s),
    })
    setEditingSeriesId(s.id)
    setError('')
    setSuccess(false)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingSeriesId(null)
  }

  function requireManager(action) {
    pendingActionRef.current = action
    setPinOpen(true)
  }

  function handlePinSuccess() {
    setPinOpen(false)
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action) action()
  }

  async function updateStatus(id, status) {
    await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
    refreshBadge()
  }

  async function submitForm() {
    if (!form.name.trim()) return setError('Guest name is required')
    if (!form.date || !form.time) return setError('Date and time are required')
    const size = parseInt(form.partySize)
    if (isNaN(size) || size < 1) return setError('Party size must be at least 1')

    const isSeries = form.repeat || editingSeriesId
    if (isSeries) {
      const repeatError = validateRepeatForm(form)
      if (repeatError) return setError(repeatError)
    }

    setSaving(true)
    setError('')

    const res = isSeries
      ? await fetch(
          editingSeriesId ? `/api/reservation-series/${editingSeriesId}` : '/api/reservation-series',
          {
            method: editingSeriesId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildSeriesPayload(form)),
          }
        )
      : await fetch('/api/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            phone: form.phone || null,
            scheduledAt: new Date(`${form.date}T${form.time}:00`).toISOString(),
            partySize: size,
            note: form.note || null,
          }),
        })

    if (res.status === 403) {
      setSaving(false)
      requireManager(submitForm)
      return
    }
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save reservation')
      setSaving(false)
      return
    }

    setSuccess(true)
    setSaving(false)
    load()
    loadSeries()
    refreshBadge()
    setTimeout(() => {
      setModalOpen(false)
      setSuccess(false)
      setEditingSeriesId(null)
    }, 1500)
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitForm()
  }

  async function performStop(s) {
    const res = await fetch(`/api/reservation-series/${s.id}`, { method: 'DELETE' })
    if (res.status === 403) {
      requireManager(() => performStop(s))
      return
    }
    loadSeries()
    load()
    refreshBadge()
  }

  async function stopSeries(s) {
    const ok = await confirm(
      `Stop the recurring booking for ${s.name}? Future days will be removed; past days stay.`,
      { title: 'Stop recurring booking', confirmLabel: 'Stop' }
    )
    if (!ok) return
    performStop(s)
  }

  const isToday = selectedDate === toDateString(new Date())
  const isEditing = editingSeriesId != null

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reservations</h1>
          <button
            onClick={openModal}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + New Reservation
          </button>
        </div>

        {/* Recurring bookings panel */}
        <div className="bg-white border border-gray-200 rounded-xl mb-6">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="font-semibold text-gray-900">
              Recurring bookings{series.length > 0 ? ` (${series.length})` : ''}
            </span>
            <span className="text-gray-400 text-sm">{panelOpen ? '▲' : '▼'}</span>
          </button>
          {panelOpen && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-2">
              {series.length === 0 ? (
                <p className="text-sm text-gray-400">No recurring bookings yet.</p>
              ) : (
                series.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500">
                        {describeRecurrence(s)} · {s.time} · {s.partySize} {s.partySize === 1 ? 'guest' : 'guests'}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditSeries(s)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => stopSeries(s)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors font-medium"
                      >
                        Stop
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 mb-6">
          <button
            onClick={() => shiftDate(-1)}
            className="text-gray-500 hover:text-gray-900 text-lg font-bold px-2"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{formatDisplayDate(selectedDate)}</p>
            {isToday && <p className="text-xs text-gray-400">Today</p>}
          </div>
          <button
            onClick={() => shiftDate(1)}
            className="text-gray-500 hover:text-gray-900 text-lg font-bold px-2"
          >
            ›
          </button>
        </div>

        {/* Reservations list */}
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : reservations.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-500 font-medium">No reservations for this day</p>
            <p className="text-sm text-gray-400 mt-1">Tap "+ New Reservation" to add one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((r) => {
              const s = STATUSES[r.status] ?? STATUSES.CONFIRMED
              const isActive = r.status === 'CONFIRMED'
              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl px-4 py-4">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{r.name}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                          {s.label}
                        </span>
                        {r.seriesId && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            ↻ Repeats
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>🕐 {formatTime(r.scheduledAt)}</span>
                        <span>👥 {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'}</span>
                        {r.phone && <span>📞 {r.phone}</span>}
                      </div>
                      {r.note && (
                        <p className="text-xs text-gray-400 mt-1.5 italic">{r.note}</p>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-100">
                      <button
                        onClick={() => updateStatus(r.id, 'COMPLETED')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors font-medium"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, 'NO_SHOW')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors font-medium"
                      >
                        No-show
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, 'CANCELLED')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New / edit reservation modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={isEditing ? 'Edit Recurring Booking' : 'New Reservation'} maxWidth="max-w-lg">
        {success ? (
          <div className="text-center py-6">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-lg font-bold text-gray-900">{form.repeat || isEditing ? 'Recurring booking saved' : 'Reservation added'}</p>
            <p className="text-sm text-gray-500 mt-1">{form.name} · {form.repeat || isEditing ? 'starts ' : ''}{formatDisplayDate(form.date)} · {form.time}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. John Smith"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{form.repeat || isEditing ? 'Start Date *' : 'Date *'}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Party Size *</label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.partySize}
                onChange={(e) => setForm(f => ({ ...f, partySize: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 0412 345 678"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Special requests, occasion, dietary needs..."
                rows={3}
                maxLength={300}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            <ReservationRecurrenceFields form={form} setForm={setForm} />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Reservation'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ManagerPinModal
        isOpen={pinOpen}
        onClose={() => { setPinOpen(false); pendingActionRef.current = null }}
        onSuccess={handlePinSuccess}
      />
      {dialog}
    </div>
  )
}
