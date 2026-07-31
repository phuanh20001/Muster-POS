'use client'

import { useState, useEffect } from 'react'

const PIN_LENGTH = 4
const NUMPAD = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

function getInitials(name) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function SwitchUserModal({ isOpen, onClose, onSuccess }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSelected(null)
    setPin('')
    setError('')
    setLoadingUsers(true)
    fetch('/api/users/list?clockedIn=1')
      .then((r) => r.json())
      .then((data) => {
        setUsers(Array.isArray(data) ? data : [])
        setLoadingUsers(false)
      })
      .catch(() => setLoadingUsers(false))
  }, [isOpen])

  function handleDigit(d) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === PIN_LENGTH) submitPin(next)
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  async function submitPin(pinValue) {
    if (!selected) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin: pinValue }),
      })
      const data = await res.json()
      if (res.ok) {
        setLoading(false)
        onSuccess(data.user)
      } else {
        setError(data.error ?? 'Incorrect PIN')
        setPin('')
        setLoading(false)
      }
    } catch {
      setError('Connection error')
      setPin('')
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">

        {!selected ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Switch User</h2>
            <p className="text-sm text-gray-500 text-center mb-6">Select your account to continue</p>

            {loadingUsers ? (
              <div className="flex justify-center py-10 text-gray-400 text-sm">Loading users...</div>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No users are currently clocked in.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setPin(''); setError('') }}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {getInitials(u.name)}
                    </div>
                    <span className="text-xs font-semibold text-gray-700 text-center leading-tight line-clamp-2">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => { setSelected(null); setPin(''); setError('') }}
              className="absolute top-4 left-4 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Back to user list"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-bold mb-3">
                {getInitials(selected.name)}
              </div>
              <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">Enter your 4-digit PIN</p>
            </div>

            <div className="flex justify-center gap-4 mb-5">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pin.length ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-sm text-red-500 mb-3">{error}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {NUMPAD.flat().map((key, i) => (
                <button
                  key={i}
                  disabled={loading || (!key && key !== '0')}
                  onClick={() => key === '⌫' ? handleBackspace() : key ? handleDigit(key) : null}
                  className={`py-4 rounded-xl text-lg font-semibold transition-all ${
                    !key && key !== '0'
                      ? 'invisible'
                      : key === '⌫'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-95'
                  } disabled:opacity-40`}
                >
                  {loading && key !== '⌫' ? '' : key}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
