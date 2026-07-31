'use client'

import { useState, useEffect } from 'react'
import HalfHourTimePicker from '@/components/shared/HalfHourTimePicker'
import { snapToHalfHour, stepHalfHour, formatHalfHourDisplay } from '@/lib/clockTime'

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ClockInOutModal({ isOpen, onClose }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setUsername('')
      setPassword('')
      setStartTime(snapToHalfHour(nowHHMM()))
      setEndTime(snapToHalfHour(nowHHMM()))
      setError('')
      setResult(null)
    }
  }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return setError('Enter username and password')
    if (!startTime || !endTime) return setError('Enter start and end time')
    if (startTime >= endTime) return setError('End time must be after start time')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/clock-inout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, startTime, endTime }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed')
        setPassword('')
        setLoading(false)
        return
      }
      setResult(data)
      setLoading(false)
      setTimeout(() => onClose(), 2000)
    } catch {
      setError('Connection error')
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {result ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">👋</div>
            <p className="text-lg font-bold text-gray-900">Shift recorded</p>
            <p className="text-sm text-gray-500 mt-1">{result.name}</p>
            <p className="text-sm text-gray-400 mt-1">{startTime} – {endTime}</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Clock In</h2>
            <p className="text-sm text-gray-500 mb-5">Enter your credentials and shift times</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start time</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => setStartTime((t) => stepHalfHour(t, -30))} className="px-3 py-2.5 text-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none">−</button>
                    <span className="flex-1 text-center text-sm font-medium text-gray-900 tabular-nums">{formatHalfHourDisplay(startTime)}</span>
                    <button type="button" onClick={() => setStartTime((t) => stepHalfHour(t, +30))} className="px-3 py-2.5 text-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none">+</button>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">End time</label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => setEndTime((t) => stepHalfHour(t, -30))} className="px-3 py-2.5 text-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none">−</button>
                    <span className="flex-1 text-center text-sm font-medium text-gray-900 tabular-nums">{formatHalfHourDisplay(endTime)}</span>
                    <button type="button" onClick={() => setEndTime((t) => stepHalfHour(t, +30))} className="px-3 py-2.5 text-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors select-none">+</button>
                  </div>
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                  {loading ? 'Saving...' : 'Record Shift'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
