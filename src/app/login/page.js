'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BRAND_NAME } from '@/lib/brand'

const PIN_LENGTH = 4
const NUMPAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']]

function safeNext(next) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next
  return '/pos'
}

function roleLabel(role) {
  if (role === 'ADMIN') return 'Owner'
  if (role === 'MANAGER') return 'Manager'
  return 'Staff'
}

function LoginInner() {
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))

  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/users/list')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setUsers(list)
        if (list.length === 1) setSelected(list[0])
      })
      .catch(() => setUsers([]))
  }, [])

  function handleDigit(d) {
    if (pin.length >= PIN_LENGTH || loading) return
    const nextPin = pin + d
    setPin(nextPin)
    setError('')
    if (nextPin.length === PIN_LENGTH) submitPin(nextPin)
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'pin') setError('Incorrect PIN')
    else if (err === 'auth') setError('Invalid credentials')
    else if (err === 'locked') setError('Too many incorrect attempts. Try again shortly.')
    else if (err === 'missing') setError('Connection error')
  }, [searchParams])

  function submitPin(pinValue) {
    if (!selected) return
    setLoading(true)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/auth/pos?next=${encodeURIComponent(next)}`
    const uid = document.createElement('input')
    uid.type = 'hidden'
    uid.name = 'userId'
    uid.value = String(selected.id)
    const pinInput = document.createElement('input')
    pinInput.type = 'hidden'
    pinInput.name = 'pin'
    pinInput.value = pinValue
    form.appendChild(uid)
    form.appendChild(pinInput)
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <div className="min-h-full flex-1 flex items-center justify-center bg-gray-950 p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">{BRAND_NAME}</h1>
          <p className="text-sm text-gray-400 mt-1">Staff sign in</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          {!selected ? (
            <>
              <p className="text-sm text-gray-500 text-center mb-5">Select your name to continue</p>
              {users.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No staff accounts found.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelected(u); setPin(''); setError('') }}
                      className="py-4 px-3 rounded-xl border-2 border-gray-200 text-left hover:border-gray-900 hover:bg-gray-50 transition-all"
                    >
                      <span className="block text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                      <span className="block text-xs text-gray-400">{roleLabel(u.role)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="block text-sm font-semibold text-gray-900">{selected.name}</span>
                  <span className="block text-xs text-gray-400">{roleLabel(selected.role)}</span>
                </div>
                <button
                  onClick={() => { setSelected(null); setPin(''); setError('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Change
                </button>
              </div>

              <p className="text-sm text-gray-500 text-center mb-4">Enter your PIN</p>

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

              {error && <p className="text-center text-sm text-red-500 mb-3">{error}</p>}

              <div className="grid grid-cols-3 gap-2">
                {NUMPAD.flat().map((key, i) => (
                  <button
                    key={i}
                    disabled={loading || (!key && key !== '0')}
                    onClick={() => (key === '⌫' ? handleBackspace() : key ? handleDigit(key) : null)}
                    className={`py-4 rounded-xl text-lg font-semibold transition-all ${
                      !key && key !== '0'
                        ? 'invisible'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-95'
                    } disabled:opacity-40`}
                  >
                    {loading && key !== '⌫' ? '' : key}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  )
}
