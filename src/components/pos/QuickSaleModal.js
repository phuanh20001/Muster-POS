'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '@/components/shared/Modal'
import { formatCurrency } from '@/lib/formatters'
import { D, gt } from '@/lib/money'
import { runTerminalCharge } from '@/lib/terminalClient'
import { TERMINAL_DEADLINE_SECONDS, clampTerminalWait } from '@/lib/terminalDeadline'
import { useCashier } from '@/contexts/CashierContext'
import CashierPicker from '@/components/shared/CashierPicker'

const TERMINAL_ERROR_COPY = {
  BUYER_CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  SELLER_CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  TIMED_OUT: { title: 'No card tapped', detail: 'The reader timed out waiting for a card.', canceled: true },
  'Timed out waiting for card': { title: 'No card tapped', detail: 'The reader timed out waiting for a card.', canceled: true },
  'Card declined': { title: 'Card declined', detail: 'The card was declined — try another card.' },
  'Payment not completed': { title: 'Payment not completed', detail: 'The payment didn’t go through — try again.' },
  'Could not reach the terminal': { title: 'Reader offline', detail: 'Could not reach the reader. Check its Wi‑Fi and try again.' },
  'Could not finalize payment': { title: 'Payment not confirmed', detail: 'Could not confirm the payment — check the reader before retrying.' },
}

function terminalErrorCopy(raw) {
  const known = raw && TERMINAL_ERROR_COPY[raw]
  if (known) return known
  return { title: 'Payment failed', detail: raw || 'Something went wrong — try again.' }
}

const NUMPAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']]

// The keypad accumulates a plain dollar string ("4.5"), never a float, so entry
// is exact; it's wrapped with D() only at charge/submit time.
function appendDigit(amount, key) {
  if (key === '.') {
    if (amount.includes('.')) return amount
    return amount === '' ? '0.' : amount + '.'
  }
  // Block a third decimal place.
  const dot = amount.indexOf('.')
  if (dot !== -1 && amount.length - dot - 1 >= 2) return amount
  if (amount === '0') return key // avoid a leading zero like "05"
  return amount + key
}

export default function QuickSaleModal({ isOpen, onClose, onConfirm, serverOk = true, internetOk = true, tillOpen = true }) {
  const { cashier, setCashier } = useCashier()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [cashierPickerOpen, setCashierPickerOpen] = useState(false)

  const [terminalEnabled, setTerminalEnabled] = useState(false)
  const [terminalStatus, setTerminalStatus] = useState('idle')
  const [terminalError, setTerminalError] = useState('')
  const terminalPiRef = useRef(null)
  const terminalPollRef = useRef(null)
  const terminalWaitRef = useRef(TERMINAL_DEADLINE_SECONDS)

  useEffect(() => {
    if (!isOpen) return
    setAmount('')
    setNote('')
    setLoading(false)
    setTerminalStatus('idle')
    setTerminalError('')
    fetch('/api/terminal/readers')
      .then((r) => r.json())
      .then((d) => setTerminalEnabled(!!d?.enabled))
      .catch(() => setTerminalEnabled(false))
    fetch('/api/payment-settings')
      .then((r) => r.json())
      .then((d) => { if (d?.terminalWaitSeconds) terminalWaitRef.current = clampTerminalWait(d.terminalWaitSeconds) })
      .catch(() => {})
  }, [isOpen])

  const amountValue = D(amount || 0)
  const canCharge = serverOk && gt(amountValue, 0)

  function handleKey(key) {
    if (loading) return
    if (key === '⌫') return setAmount((a) => a.slice(0, -1))
    setAmount((a) => appendDigit(a, key))
  }

  function chargeTerminal() {
    return runTerminalCharge(amountValue.toNumber(), {
      timeoutSec: terminalWaitRef.current,
      refs: { piRef: terminalPiRef, pollRef: terminalPollRef },
    })
  }

  // The order line carries the amount as unitPrice and the optional note; the
  // parent owns the /api/orders POST + failure handling (cart-independent).
  function buildPayload(extra) {
    const amt = amountValue.toNumber()
    return {
      amountPaid: amt,
      change: 0,
      note: note.trim() || undefined,
      userId: cashier?.id ?? null,
      items: [{ productId: null, productName: 'Custom amount', quantity: 1, unitPrice: amt, notes: note.trim() }],
      ...extra,
    }
  }

  async function chargeCard() {
    if (!canCharge) return
    setTerminalStatus('processing')
    setTerminalError('')
    setLoading(true)
    const result = await chargeTerminal()
    if (!result.ok) {
      setTerminalStatus('failed')
      setTerminalError(result.error)
      setLoading(false)
      return
    }
    // Card charged. The overlay must stop saying "tap your card" here — the money
    // has moved and we're only recording it now. If the save fails, the parent
    // retries it (safe: idempotent on paymentIntentId) and surfaces the outcome.
    setTerminalStatus('saving')
    const saved = await onConfirm(buildPayload({ paymentMethod: 'CARD', paymentIntentId: result.paymentIntentId }))
    setLoading(false)
    setTerminalStatus('idle')
    if (saved) onClose()
  }

  async function chargeCash() {
    if (!canCharge) return
    setLoading(true)
    const saved = await onConfirm(buildPayload({ paymentMethod: 'CASH' }))
    setLoading(false)
    if (saved) onClose()
  }

  function cancelTerminal() {
    if (terminalPollRef.current) clearInterval(terminalPollRef.current)
    const piId = terminalPiRef.current
    setTerminalStatus('idle')
    setLoading(false)
    fetch('/api/terminal/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: piId, readerName: 'COUNTER' }),
    }).catch(() => {})
  }

  const cardDisabled = !canCharge || !internetOk || !terminalEnabled

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Quick Sale" maxWidth="max-w-sm">
        <div className="space-y-4 relative">
          {!serverOk && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-medium">
              Cannot reach POS server — check the shop PC is running.
            </div>
          )}

          {serverOk && !tillOpen && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Till not open — owner must open from Admin → Shift so cash is tracked.
            </div>
          )}

          {terminalStatus !== 'idle' && (
            <div className="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center gap-4 z-20 p-6 text-center">
              {terminalStatus === 'processing' ? (
                <>
                  <div className="text-5xl">💳</div>
                  <div className="text-lg font-bold text-gray-900">Tap or insert card</div>
                  <div className="text-sm text-gray-500">Waiting for {formatCurrency(amountValue)} on the reader…</div>
                  <div className="flex gap-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                  <button onClick={cancelTerminal}
                    className="mt-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </>
              ) : terminalStatus === 'saving' ? (
                <>
                  <div className="text-5xl">✅</div>
                  <div className="text-lg font-bold text-gray-900">Payment approved</div>
                  <div className="text-sm text-gray-500">Saving the sale — don&apos;t charge again.</div>
                  <span className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                </>
              ) : (
                (() => {
                  const copy = terminalErrorCopy(terminalError)
                  return (
                    <>
                      <div className={`flex items-center justify-center w-16 h-16 rounded-full text-3xl ${
                        copy.canceled ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-500'
                      }`}>
                        {copy.canceled ? '✕' : '⚠️'}
                      </div>
                      <div className={`text-lg font-bold ${copy.canceled ? 'text-gray-900' : 'text-red-600'}`}>
                        {copy.title}
                      </div>
                      <div className="text-sm text-gray-500 max-w-xs">{copy.detail}</div>
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => { setTerminalStatus('idle'); setTerminalError('') }}
                          className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                          Back
                        </button>
                        <button onClick={chargeCard}
                          className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
                          Try again
                        </button>
                      </div>
                    </>
                  )
                })()
              )}
            </div>
          )}

          {/* Amount display — shows the raw entry so a mid-typed "4." is visible */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 py-6 text-center">
            <div className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums">
              {amount === '' ? '$0.00' : `$${amount}`}
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD.flat().map((key, i) => (
              <button
                key={i}
                disabled={loading}
                onClick={() => handleKey(key)}
                className={`py-4 rounded-xl text-xl font-semibold transition-all bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-95 disabled:opacity-40`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Optional note */}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. Catering, Cake"
            maxLength={120}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />

          {/* Cashier */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Cashier <span className="text-gray-400">(optional)</span></span>
            <button
              onClick={() => setCashierPickerOpen(true)}
              className="font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
            >
              {cashier?.name ?? 'Select cashier'}
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={chargeCash}
              disabled={!canCharge || loading}
              className="py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              💵 Cash
            </button>
            <button
              onClick={chargeCard}
              disabled={cardDisabled || loading}
              title={!terminalEnabled ? 'No card reader configured' : !internetOk ? 'Internet down — card unavailable' : undefined}
              className="py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              💳 Charge to card
            </button>
          </div>

          {!terminalEnabled && internetOk && (
            <p className="text-xs text-gray-400 text-center">No card reader configured — cash only.</p>
          )}
        </div>
      </Modal>

      {cashierPickerOpen && (
        <CashierPicker
          onClose={() => setCashierPickerOpen(false)}
          onSelect={(u) => { setCashier(u); setCashierPickerOpen(false) }}
        />
      )}
    </>
  )
}
