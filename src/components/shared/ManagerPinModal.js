'use client'

import { useState, useEffect } from 'react'

const PIN_LENGTH = 4

export default function ManagerPinModal({ isOpen, onClose, onSuccess, role, clockedIn = false, endpoint = '/api/auth/manager' }) {
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setPin('')
    setError('')
    setSelected(null)
    const url = clockedIn ? '/api/users/list?clockedIn=1' : '/api/users/list'
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data)
          ? data.filter((u) => role ? u.role === role : ['MANAGER', 'ADMIN'].includes(u.role))
          : []
        setUsers(list)
        if (list.length === 1) setSelected(list[0])
      })
  }, [isOpen, role, clockedIn])

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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, pin: pinValue }),
      })
      const d = await res.json()
      if (res.ok) {
        setLoading(false)
        onSuccess({ id: d.id, name: d.name, role: d.role })
      } else {
        setError(d.error ?? 'Incorrect PIN')
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

  const title = role === 'ADMIN' ? 'Owner Access' : 'Manager Access'
  const NUMPAD = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-gray-900 text-center mb-1">{title}</h2>
        <p className="text-sm text-gray-500 text-center mb-5">Enter your PIN to continue</p>

        {users.length > 1 && !selected && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {role === 'ADMIN' ? 'Select Owner' : 'Select Manager'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelected(u)}
                  className="py-3 px-4 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-all"
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {users.length === 0 && (
          <p className="text-sm text-gray-400 text-center mb-5">
            No {role === 'ADMIN' ? 'admin' : 'manager'} accounts found.
          </p>
        )}

        {selected && (
          <>
            {users.length > 1 && (
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-gray-700">{selected.name}</span>
                <button onClick={() => { setSelected(null); setPin(''); setError('') }} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Change
                </button>
              </div>
            )}

            <div className="flex justify-center gap-3 mb-5">
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

        <button onClick={onClose} className="mt-4 w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
