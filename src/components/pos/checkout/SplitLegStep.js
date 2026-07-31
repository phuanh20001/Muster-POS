'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/shared/Button'
import { formatCurrency } from '@/lib/formatters'
import { D, roundCents, gt, gte, neg } from '@/lib/money'
import { QUICK_AMOUNTS } from './constants'

export default function SplitLegStep({ legLabel, legSubtitle, legItems, legItemKeys = [], amountDue, isFinalLeg, onDone, cardSurcharge, terminalEnabled, internetOk = true, onChargeCard, onCancelCharge }) {
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const paid = parseFloat(amountPaid) || 0
  const change = D(paid).minus(amountDue)
  const canDone = paymentMethod === 'CARD' || gte(D(paid), amountDue)

  const legSurcharge = paymentMethod === 'CARD' && cardSurcharge
    ? roundCents(cardSurcharge.type === 'PERCENT' ? D(amountDue).times(D(cardSurcharge.value).div(100)) : D(cardSurcharge.value))
    : D(0)
  const cardTotal = roundCents(D(amountDue).plus(legSurcharge))

  useEffect(() => {
    if (!internetOk && paymentMethod === 'CARD') setPaymentMethod('CASH')
  }, [internetOk, paymentMethod])

  const legPaymentOptions = internetOk
    ? [{ value: 'CASH', label: '💵 Cash' }, { value: 'CARD', label: '💳 Card' }]
    : [{ value: 'CASH', label: '💵 Cash' }]

  async function handleDone() {
    if (paymentMethod === 'CARD') {
      if (terminalEnabled) {
        setError(''); setProcessing(true)
        const result = await onChargeCard(cardTotal)
        setProcessing(false)
        if (!result.ok) { setError(result.error || 'Card declined'); return }
        onDone({ paymentMethod: 'CARD', amountPaid: cardTotal, change: 0, paymentIntentId: result.paymentIntentId, surchargeAmount: legSurcharge, legBase: amountDue, itemKeys: legItemKeys })
      } else {
        onDone({ paymentMethod: 'CARD', amountPaid: cardTotal, change: 0, surchargeAmount: legSurcharge, legBase: amountDue, itemKeys: legItemKeys })
      }
    } else {
      onDone({ paymentMethod: 'CASH', amountPaid: paid, change: gt(change, 0) ? change : D(0), surchargeAmount: D(0), legBase: amountDue, itemKeys: legItemKeys })
    }
  }

  if (processing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="text-5xl">💳</div>
        <div className="text-lg font-bold text-gray-900">Tap or insert card</div>
        <div className="text-sm text-gray-500">{legLabel}: waiting for {formatCurrency(cardTotal)} on the reader…</div>
        <button onClick={onCancelCharge}
          className="mt-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">{legLabel}</p>
        {legSubtitle && <span className="text-xs text-gray-400">{legSubtitle}</span>}
      </div>

      {legItems && legItems.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-1 max-h-28 overflow-y-auto">
          {legItems.map((it) => (
            <div key={it.key} className="flex justify-between text-sm">
              <span className="text-gray-700">{it.label}</span>
              <span className="font-medium font-mono">{formatCurrency(it.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-gray-500">Amount due</span>
        <span className="text-2xl font-black font-mono text-gray-900">{formatCurrency(amountDue)}</span>
      </div>

      <div className="flex gap-2">
        {legPaymentOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setPaymentMethod(value); setAmountPaid(''); setError('') }}
            className={`flex-1 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
              paymentMethod === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {paymentMethod === 'CARD' && gt(legSurcharge, 0) && (
        <div className="bg-gray-50 rounded-xl px-4 py-2.5 text-sm space-y-1">
          <div className="flex justify-between text-gray-500">
            <span>Card surcharge{cardSurcharge?.type === 'PERCENT' ? ` (${cardSurcharge.value}%)` : ''}</span>
            <span className="font-mono">+{formatCurrency(legSurcharge)}</span>
          </div>
          <div className="flex justify-between font-semibold text-gray-900">
            <span>Card total</span>
            <span className="font-mono">{formatCurrency(cardTotal)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {paymentMethod === 'CASH' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received</label>
          <input
            type="number"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            placeholder="0.00"
            min={0}
            step="0.01"
            autoFocus
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-mono font-bold text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            {QUICK_AMOUNTS.map((amt) => (
              <button key={amt} onClick={() => setAmountPaid(String(amt))}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium border border-gray-200 transition-colors">
                ${amt}
              </button>
            ))}
            <button onClick={() => setAmountPaid(D(amountDue).toFixed(2))}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors">
              Exact
            </button>
          </div>
          {paid > 0 && (
            <div className={`mt-3 rounded-xl p-3 text-center ${gte(change, 0) ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-500 mb-0.5">Change</div>
              <div className={`text-2xl font-bold font-mono ${gte(change, 0) ? 'text-green-700' : 'text-red-600'}`}>
                {gte(change, 0) ? formatCurrency(change) : `Need ${formatCurrency(neg(change))} more`}
              </div>
            </div>
          )}
        </div>
      )}

      <Button variant="primary" size="lg" className="w-full" disabled={!canDone || processing} onClick={handleDone}>
        {paymentMethod === 'CARD'
          ? (isFinalLeg ? `✓ Confirm Order — ${formatCurrency(cardTotal)}` : `✓ Charge Card — ${formatCurrency(cardTotal)}`)
          : (isFinalLeg ? 'Collected — Place Order' : 'Collected — Next')}
      </Button>
    </div>
  )
}
