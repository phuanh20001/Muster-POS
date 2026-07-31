'use client'

import { useState } from 'react'
import Link from 'next/link'
import StampProgress from '@/components/loyalty/StampProgress'
import { BRAND_NAME } from '@/lib/brand'
import { auPhoneError, formatAuPhoneDisplay, isValidAuPhone, normalizeAuPhone, sanitizePhoneInput } from '@/lib/phone'

function PublicStampCard({ customer, phoneDisplay }) {
  const progress = customer.stampsCollected % 9
  const freeItems = customer.freeItems ?? Math.max(0, Math.floor(customer.stampsCollected / 9) - (customer.stampsRedeemed ?? 0))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-lg font-bold text-gray-900">Your rewards</p>
          <p className="text-sm text-gray-400">{phoneDisplay}</p>
        </div>
        {freeItems > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
            {freeItems} free ☕
          </span>
        )}
      </div>
      <StampProgress progress={progress} freeItems={freeItems} />
      {freeItems > 0 && (
        <p className="text-xs text-amber-700 mt-3">
          Redeem at online checkout — use the same phone number and the stamp card to redeem.
        </p>
      )}
      {(customer.stampsRedeemed ?? 0) > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {customer.stampsRedeemed} free coffee{customer.stampsRedeemed !== 1 ? 's' : ''} redeemed all time
        </p>
      )}
    </div>
  )
}

export default function PublicLoyaltyPage() {
  const [phone, setPhone] = useState('')
  const [customer, setCustomer] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e) {
    e.preventDefault()
    const phoneErr = auPhoneError(phone)
    if (phoneErr) { setError(phoneErr); return }
    setError('')
    setNotFound(false)
    setCustomer(null)
    setLoading(true)
    const res = await fetch(`/api/customers?phone=${encodeURIComponent(normalizeAuPhone(phone))}`)
    const data = await res.json()
    setLoading(false)
    if (res.status === 429) return setError(data.error ?? 'Too many requests — try again shortly')
    if (res.status === 400) return setError(data.error ?? 'Enter a valid phone number.')
    if (data?.found) {
      setCustomer(data)
    } else {
      setNotFound(true)
    }
  }

  function handleClear() {
    setPhone('')
    setCustomer(null)
    setNotFound(false)
    setError('')
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <header className="bg-gray-950 text-white px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-base tracking-tight hover:opacity-80">{BRAND_NAME}</Link>
          <Link href="/order" className="text-sm text-gray-300 hover:text-white">Order online</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Stamp card</h1>
          <p className="text-sm text-gray-500 mt-1">Buy 9 coffees, get the 10th free</p>
          <p className="text-xs text-gray-400 mt-2">
            Stamps are added automatically when you order online with your phone number.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Your phone number"
            value={formatAuPhoneDisplay(phone)}
            onChange={(e) => { setPhone(sanitizePhoneInput(e.target.value)); setCustomer(null); setNotFound(false); setError('') }}
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

        {customer && <PublicStampCard customer={customer} phoneDisplay={formatAuPhoneDisplay(phone)} />}

        {notFound && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">No stamp card yet</p>
            <p className="text-xs text-gray-500 mb-4">
              Your stamp card is created after your first paid online order with this phone number.
            </p>
            <Link
              href="/order"
              className="block w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-semibold text-center transition-colors"
            >
              Order online
            </Link>
          </div>
        )}

        {error && !notFound && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}

        <div className="mt-10 pt-6 border-t border-gray-200 text-center">
          <Link href="/privacy" className="text-xs text-gray-400 hover:text-gray-600 underline">Privacy policy</Link>
        </div>
      </div>
    </div>
  )
}
