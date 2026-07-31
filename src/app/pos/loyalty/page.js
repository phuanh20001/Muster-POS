'use client'

import { useState } from 'react'
import StampProgress from '@/components/loyalty/StampProgress'
import { auPhoneError, formatAuPhoneDisplay, isValidAuPhone, normalizeAuPhone, sanitizePhoneInput } from '@/lib/phone'

function StaffStampCard({ customer }) {
  const progress = customer.stampsCollected % 9
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-lg font-bold text-gray-900">{customer.name}</p>
          <p className="text-sm text-gray-400">{customer.phone}</p>
        </div>
        {customer.freeItems > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
            {customer.freeItems} free ☕
          </span>
        )}
      </div>
      <StampProgress progress={progress} freeItems={customer.freeItems} />
      {customer.stampsRedeemed > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {customer.stampsRedeemed} free coffee{customer.stampsRedeemed !== 1 ? 's' : ''} redeemed all time
        </p>
      )}
    </div>
  )
}

export default function PosLoyaltyPage() {
  const [phone, setPhone] = useState('')
  const [customer, setCustomer] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registered, setRegistered] = useState(false)

  async function handleSearch(e) {
    e.preventDefault()
    const phoneErr = auPhoneError(phone)
    if (phoneErr) { setError(phoneErr); return }
    setError('')
    setNotFound(false)
    setCustomer(null)
    setRegistered(false)
    setLoading(true)
    const res = await fetch(`/api/customers?phone=${encodeURIComponent(normalizeAuPhone(phone))}`)
    const data = await res.json()
    setLoading(false)
    if (res.status === 400) return setError(data.error ?? 'Enter a valid phone number.')
    if (data && data.id) {
      setCustomer(data)
    } else {
      setNotFound(true)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    const phoneErr = auPhoneError(phone)
    if (phoneErr) return setError(phoneErr)
    if (!newName.trim()) return setError('Please enter a name')
    setError('')
    setLoading(true)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), phone: normalizeAuPhone(phone) }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return setError(data.error ?? 'Registration failed')
    setCustomer({ ...data, freeItems: 0 })
    setNotFound(false)
    setNewName('')
    setRegistered(true)
  }

  function handleClear() {
    setPhone('')
    setCustomer(null)
    setNotFound(false)
    setNewName('')
    setError('')
    setRegistered(false)
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Stamp Card</h1>
          <p className="text-sm text-gray-400 mt-1">Look up or register a customer at the counter</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Customer phone number"
            value={formatAuPhoneDisplay(phone)}
            onChange={(e) => { setPhone(sanitizePhoneInput(e.target.value)); setCustomer(null); setNotFound(false); setRegistered(false); setError('') }}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !isValidAuPhone(phone)}
            className="px-5 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {loading ? '...' : 'Look up'}
          </button>
          {(customer || notFound) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-3 border border-gray-200 bg-white rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {registered && customer && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
            {customer.name} registered — stamp card is ready!
          </div>
        )}

        {customer && <StaffStampCard customer={customer} />}

        {notFound && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">Phone not found</p>
            <p className="text-xs text-gray-400 mb-4">Register this number for a new stamp card.</p>
            <form onSubmit={handleRegister} className="space-y-3">
              <input
                type="text"
                placeholder="Customer name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                autoFocus
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={loading || !newName.trim()}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {loading ? 'Registering...' : 'Register new card'}
              </button>
            </form>
          </div>
        )}

        {error && !notFound && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}
      </div>
    </div>
  )
}
