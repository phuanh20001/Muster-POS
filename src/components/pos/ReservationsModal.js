'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Modal from '@/components/shared/Modal'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import ReservationRecurrenceFields, {
  emptyRecurrence,
  validateRepeatForm,
  buildSeriesPayload,
} from '@/components/shared/ReservationRecurrenceFields'
import { useReservations } from '@/contexts/ReservationsContext'

const STATUS_META = {
  CONFIRMED: { label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  COMPLETED: { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
  NO_SHOW: { label: 'No-show', color: 'bg-purple-100 text-purple-700' },
}

function toDateString(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

const emptyForm = { name: '', phone: '', date: '', time: '', partySize: '2', note: '', ...emptyRecurrence }

export default function ReservationsModal({ isOpen, onClose }) {
  const [view, setView] = useState('list')
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()))
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const pendingActionRef = useRef(null)
  const { refresh: refreshBadge } = useReservations()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/reservations?date=${selectedDate}`)
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [selectedDate])

  useEffect(() => {
    if (isOpen) {
      setView('list')
      setSelectedDate(toDateString(new Date()))
      setError('')
      setSuccess(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen, load])

  function shiftDate(days) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(toDateString(d))
  }

  function openForm() {
    setForm({ ...emptyForm, date: selectedDate })
    setError('')
    setSuccess(false)
    setView('form')
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

  async function submitForm() {
    if (!form.name.trim()) return setError('Guest name is required')
    if (!form.date || !form.time) return setError('Date and time are required')
    const size = parseInt(form.partySize)
    if (isNaN(size) || size < 1) return setError('Party size must be at least 1')
    if (form.repeat) {
      const repeatError = validateRepeatForm(form)
      if (repeatError) return setError(repeatError)
    }

    setSaving(true)
    setError('')

    const res = form.repeat
      ? await fetch('/api/reservation-series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildSeriesPayload(form)),
        })
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
    refreshBadge()
    setTimeout(() => {
      setView('list')
      setSuccess(false)
    }, 1500)
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitForm()
  }

  const isToday = selectedDate === toDateString(new Date())

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={view === 'form' ? 'New Reservation' : 'Reservations'}
      maxWidth="max-w-lg"
    >
      {view === 'list' ? (
        <div>
          {/* Date navigation */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-4">
            <button
              onClick={() => shiftDate(-1)}
              className="text-gray-500 hover:text-gray-900 text-lg font-bold px-2"
            >
              ‹
            </button>
            <div className="text-center">
              <p className="font-semibold text-sm text-gray-900">{formatDisplayDate(selectedDate)}</p>
              {isToday && <p className="text-xs text-gray-400">Today</p>}
            </div>
            <button
              onClick={() => shiftDate(1)}
              className="text-gray-500 hover:text-gray-900 text-lg font-bold px-2"
            >
              ›
            </button>
          </div>

          {/* List */}
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">Loading...</p>
          ) : reservations.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-gray-500 text-sm">No reservations for this day</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto pr-1">
              {reservations.map((r) => {
                const s = STATUS_META[r.status] ?? STATUS_META.CONFIRMED
                const isActive = r.status === 'CONFIRMED'

                return (
                  <div key={r.id} className="border border-gray-200 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-gray-900">{r.name}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                            {s.label}
                          </span>
                          {r.seriesId && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              ↻ Repeats
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                          <span>🕐 {formatTime(r.scheduledAt)}</span>
                          <span>👥 {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'}</span>
                          {r.phone && <span>📞 {r.phone}</span>}
                        </div>
                        {r.note && <p className="text-xs text-gray-400 mt-1 italic">{r.note}</p>}
                      </div>
                    </div>

                    {isActive && (
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => updateStatus(r.id, 'COMPLETED')}
                          className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors font-medium"
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'NO_SHOW')}
                          className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors font-medium"
                        >
                          No-show
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'CANCELLED')}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors font-medium"
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

          <button
            onClick={openForm}
            className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + New Reservation
          </button>
        </div>
      ) : success ? (
        <div className="text-center py-8">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-lg font-bold text-gray-900">{form.repeat ? 'Recurring booking added' : 'Reservation added'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {form.name} · {form.repeat ? 'starts ' : ''}{formatDisplayDate(form.date)} · {form.time}
          </p>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 0412 345 678"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
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
              onClick={() => setView('list')}
              className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Add Reservation'}
            </button>
          </div>
        </form>
      )}

      <ManagerPinModal
        isOpen={pinOpen}
        onClose={() => { setPinOpen(false); pendingActionRef.current = null }}
        onSuccess={handlePinSuccess}
      />
    </Modal>
  )
}
