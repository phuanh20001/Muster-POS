'use client'

import { useState, useEffect } from 'react'

export default function MoneyInOutModal({ isOpen, onClose, user }) {
  const [type, setType] = useState('IN')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setType('IN')
      setAmount('')
      setNote('')
      setError('')
      setSuccess(false)
    }
  }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!amount || isNaN(parsed) || parsed <= 0) return setError('Enter a valid amount')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/cash/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount: parsed, note, userId: user?.id ?? null }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed')
        setLoading(false)
        return
      }
      setSuccess(true)
      setLoading(false)
      setTimeout(() => onClose(), 1500)
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
        {success ? (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">{type === 'IN' ? '💵' : '💸'}</div>
            <p className="text-lg font-bold text-gray-900">
              Money {type === 'IN' ? 'In' : 'Out'} recorded
            </p>
            <p className="text-sm text-gray-500 mt-1">${parseFloat(amount).toFixed(2)}</p>
            {user && <p className="text-xs text-gray-400 mt-1">by {user.name}</p>}
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Money In / Out</h2>
            {user && (
              <p className="text-xs text-gray-400 mb-4">
                Recording as <span className="font-semibold text-gray-600">{user.name}</span>
              </p>
            )}

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setType('IN')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  type === 'IN' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                + Money In
              </button>
              <button
                onClick={() => setType('OUT')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  type === 'OUT' ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                − Money Out
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-xl font-mono font-bold text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  type="text"
                  placeholder={type === 'IN' ? 'e.g. Change fund top-up' : 'e.g. Paid supplier'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    type === 'IN' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {loading ? 'Saving...' : `Record ${type === 'IN' ? 'Money In' : 'Money Out'}`}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
