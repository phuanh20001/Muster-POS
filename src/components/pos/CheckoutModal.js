'use client'

import { useState, useEffect, useRef } from 'react'
import Modal from '@/components/shared/Modal'
import { formatCurrency } from '@/lib/formatters'
import { itemsSubtotal as computeItemsSubtotal, lineTotalForItem } from '@/lib/orderTotals'
import { D, roundCents, max, min, gt, lt, lte, gte, sum } from '@/lib/money'
import { runTerminalCharge } from '@/lib/terminalClient'
import { TERMINAL_DEADLINE_SECONDS, clampTerminalWait } from '@/lib/terminalDeadline'
import { useCashier } from '@/contexts/CashierContext'
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext'
import CashierPicker from '@/components/shared/CashierPicker'
import CheckoutTotalsPanel from '@/components/pos/checkout/CheckoutTotalsPanel'
import CheckoutPaymentSection from '@/components/pos/checkout/CheckoutPaymentSection'
import CheckoutSplitSection from '@/components/pos/checkout/CheckoutSplitSection'
import { auPhoneError, formatAuPhoneDisplay, isValidAuPhone, normalizeAuPhone, sanitizePhoneInput } from '@/lib/phone'

const TERMINAL_ERROR_COPY = {
  // Square cancelReason values (reader-side outcomes)
  BUYER_CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  SELLER_CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  CANCELED: { title: 'Payment canceled', detail: 'Canceled on the reader.', canceled: true },
  TIMED_OUT: { title: 'No card tapped', detail: 'The reader timed out waiting for a card.', canceled: true },
  // Client-side outcomes
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

export default function CheckoutModal({ isOpen, onClose, items, total, onConfirm, serverOk = true, internetOk = true, tillOpen = true, initialManualDiscount = 0, initialDiscountType = 'PERCENT', initialSurchargeType = 'PERCENT', initialSurchargeValue = 0, initialTableId = null }) {
  const { cashier, setCashier } = useCashier()
  const { settings: featureSettings } = useFeatureSettings()
  const settingsLoaded = featureSettings != null
  const manualTables = !!featureSettings?.manualTableNumbers
  const tableNumberMax = featureSettings?.tableNumberMax ?? 20
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [manualNumber, setManualNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [occupiedConfirmed, setOccupiedConfirmed] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [cashierPickerOpen, setCashierPickerOpen] = useState(false)

  const [terminalEnabled, setTerminalEnabled] = useState(false)
  const [terminalStatus, setTerminalStatus] = useState('idle')
  const [terminalError, setTerminalError] = useState('')
  const terminalPiRef = useRef(null)
  const terminalPollRef = useRef(null)
  const terminalWaitRef = useRef(TERMINAL_DEADLINE_SECONDS)

  const [cardSurcharge, setCardSurcharge] = useState(null)
  const autoSurchargeRef = useRef(false)

  const [splitMode, setSplitMode] = useState(false)
  const [splitType, setSplitType] = useState('PRICE')
  const [splitStep, setSplitStep] = useState(0)
  const [splitPayments, setSplitPayments] = useState([])
  const [legAmountInput, setLegAmountInput] = useState('')
  const [legItemKeys, setLegItemKeys] = useState([])
  const [paidItemKeys, setPaidItemKeys] = useState([])
  const [legDue, setLegDue] = useState(0)
  const [legDueKeys, setLegDueKeys] = useState([])

  const [loyaltyPhone, setLoyaltyPhone] = useState('')
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null)
  const [loyaltyNew, setLoyaltyNew] = useState(false)
  const [loyaltyNewName, setLoyaltyNewName] = useState('')
  const [redeemFree, setRedeemFree] = useState(false)
  const [loyaltyError, setLoyaltyError] = useState('')

  const [surchargeType, setSurchargeType] = useState('PERCENT')
  const [surchargeValue, setSurchargeValue] = useState('')
  const [discountType, setDiscountType] = useState('PERCENT')
  const [manualDiscount, setManualDiscount] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSelectedTable(null)
      setManualNumber('')
      setCustomerName('')
      setPaymentMethod('CASH')
      setAmountPaid('')
      setNote('')
      setOccupiedConfirmed(false)
      setSplitMode(false)
      setSplitType('PRICE')
      setSplitStep(0)
      setSplitPayments([])
      setLegAmountInput('')
      setLegItemKeys([])
      setPaidItemKeys([])
      setLegDue(0)
      setLegDueKeys([])
      setLoyaltyPhone('')
      setLoyaltyCustomer(null)
      setLoyaltyNew(false)
      setLoyaltyNewName('')
      setRedeemFree(false)
      setLoyaltyError('')
      setSurchargeType(initialSurchargeType)
      setSurchargeValue(initialSurchargeValue > 0 ? String(initialSurchargeValue) : '')
      setDiscountType(initialDiscountType)
      setManualDiscount(initialManualDiscount > 0 ? String(initialManualDiscount) : '')
      setTerminalStatus('idle')
      setTerminalError('')
      fetch('/api/terminal/readers')
        .then((r) => r.json())
        .then((d) => setTerminalEnabled(!!d?.enabled))
        .catch(() => setTerminalEnabled(false))
      autoSurchargeRef.current = false
      fetch('/api/payment-settings')
        .then((r) => r.json())
        .then((d) => {
          setCardSurcharge(
            d?.cardSurchargeType && d?.cardSurchargeValue > 0
              ? { type: d.cardSurchargeType, value: d.cardSurchargeValue }
              : null
          )
          if (d?.terminalWaitSeconds) terminalWaitRef.current = clampTerminalWait(d.terminalWaitSeconds)
        })
        .catch(() => setCardSurcharge(null))
    }
  }, [isOpen])

  // Load the floor plan only once the mode is known, and re-run if it flips while
  // the modal is open (admin toggling Table Numbers from another device). Waiting
  // for settings avoids a wasted /api/tables fetch + a floor-plan flash in a
  // typed-number shop before the shared settings have loaded. Keyed on the derived
  // booleans, not the settings object, so a background poll returning the same
  // flags doesn't re-fetch tables mid-checkout.
  useEffect(() => {
    if (!isOpen || !settingsLoaded) return
    if (manualTables) {
      setTables([])
      return
    }
    let cancelled = false
    fetch('/api/tables')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const list = Array.isArray(d) ? d : []
        setTables(list)
        if (initialTableId) {
          const t = list.find((x) => x.id === initialTableId)
          if (t) setSelectedTable(t)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, settingsLoaded, manualTables, initialTableId])

  useEffect(() => {
    if (!splitMode && paymentMethod === 'CARD' && cardSurcharge) {
      setSurchargeType(cardSurcharge.type)
      setSurchargeValue(String(cardSurcharge.value))
      setManualDiscount('')
      autoSurchargeRef.current = true
    } else if (autoSurchargeRef.current && (splitMode || paymentMethod !== 'CARD')) {
      setSurchargeValue('')
      autoSurchargeRef.current = false
    }
  }, [paymentMethod, cardSurcharge, splitMode])

  useEffect(() => {
    if (!internetOk && paymentMethod === 'CARD') setPaymentMethod('CASH')
  }, [internetOk, paymentMethod])

  useEffect(() => () => { if (terminalPollRef.current) clearInterval(terminalPollRef.current) }, [])

  const itemsSubtotal = computeItemsSubtotal(items)

  const parsedSurchargeValue = parseFloat(surchargeValue) || 0
  const surchargeAmount = roundCents(surchargeType === 'PERCENT'
    ? itemsSubtotal.times(D(parsedSurchargeValue).div(100))
    : D(parsedSurchargeValue))
  const parsedManualDiscountValue = parseFloat(manualDiscount) || 0
  const parsedManualDiscount = roundCents(discountType === 'PERCENT'
    ? itemsSubtotal.times(D(parsedManualDiscountValue).div(100))
    : D(parsedManualDiscountValue))
  const loyaltyPrices = items.filter((i) => i.product?.loyaltyEnabled).map((i) => D(i.unitPrice))
  const discountAmount = loyaltyCustomer?.freeItems > 0 && redeemFree && loyaltyPrices.length
    ? min(...loyaltyPrices)
    : D(0)
  const loyaltyDiscount = redeemFree ? discountAmount : D(0)
  const grandTotal = max(D(0), roundCents(
    itemsSubtotal.plus(surchargeAmount).minus(parsedManualDiscount).minus(loyaltyDiscount)
  ))

  const paid = parseFloat(amountPaid) || 0
  const change = D(paid).minus(grandTotal)

  const loyaltyStampsEarned = loyaltyCustomer
    ? items.reduce((sum, i) => (i.product?.loyaltyEnabled ? sum + i.quantity : sum), 0)
    : 0
  const stampProgress = loyaltyCustomer ? loyaltyCustomer.stampsCollected % 9 : 0

  const splitScale = gt(itemsSubtotal, 0) ? grandTotal.div(itemsSubtotal) : D(0)
  const splitLines = items.map((item) => {
    const lineTotal = lineTotalForItem(item)
    return {
      key: item.cartItemId,
      label: `${item.product.name}${item.size ? ` (${item.size})` : ''} × ${item.quantity}`,
      amount: roundCents(lineTotal.times(splitScale)),
    }
  })
  const splitLineByKey = Object.fromEntries(splitLines.map((l) => [l.key, l]))

  const splitCollected = roundCents(sum(splitPayments, (p) => p.legBase || 0))
  const splitRemaining = roundCents(grandTotal.minus(splitCollected))

  const remainingLines = splitLines.filter((l) => !paidItemKeys.includes(l.key))
  const legSelectedAmount = roundCents(sum(legItemKeys, (k) => splitLineByKey[k]?.amount || 0))
  const splitPriceDue = legAmountInput === '' ? splitRemaining : D(parseFloat(legAmountInput) || 0)
  const splitPriceValid = gt(splitPriceDue, 0) && lte(splitPriceDue, splitRemaining.plus(0.005))

  function getConfirmPayload() {
    return {
      note,
      grandTotal,
      tableId: manualTables ? null : (selectedTable?.id ?? null),
      tableNumber: manualTables
        ? (manualNumber.trim() || customerName.trim())
        : (selectedTable ? String(selectedTable.number) : customerName.trim()),
      tableManual: manualTables && manualNumber.trim() !== '',
      customerId: loyaltyCustomer?.id ?? null,
      stampEarned: loyaltyStampsEarned,
      freeItemRedeemed: redeemFree,
      discountAmount: loyaltyDiscount,
      userId: cashier?.id ?? null,
      surchargeType: parsedSurchargeValue > 0 ? surchargeType : '',
      surchargeValue: parsedSurchargeValue,
      surchargeAmount,
      manualDiscount: parsedManualDiscount,
    }
  }

  async function handleConfirm() {
    if (paymentMethod === 'CARD' && !internetOk) return
    if (paymentMethod === 'CARD' && terminalEnabled) return chargeCard()
    const effectivePaid = paymentMethod === 'CARD' ? grandTotal : paid
    const effectiveChange = paymentMethod === 'CARD' ? D(0) : change
    if (paymentMethod === 'CASH' && lt(D(paid), grandTotal)) return
    setLoading(true)
    await onConfirm({ paymentMethod, amountPaid: effectivePaid, change: effectiveChange, ...getConfirmPayload() })
    setLoading(false)
  }

  function chargeTerminal(amount) {
    return runTerminalCharge(amount, {
      timeoutSec: terminalWaitRef.current,
      refs: { piRef: terminalPiRef, pollRef: terminalPollRef },
    })
  }

  async function chargeCard() {
    setTerminalStatus('processing')
    setTerminalError('')
    setLoading(true)
    const result = await chargeTerminal(grandTotal)
    if (result.ok) {
      // The money has moved — stop showing "tap your card" while we record it.
      setTerminalStatus('saving')
      await onConfirm({ paymentMethod: 'CARD', amountPaid: grandTotal, change: 0, paymentIntentId: result.paymentIntentId, ...getConfirmPayload() })
      setLoading(false); setTerminalStatus('idle')
    } else {
      setTerminalStatus('failed'); setTerminalError(result.error); setLoading(false)
    }
  }

  function cancelTerminal() {
    if (terminalPollRef.current) clearInterval(terminalPollRef.current)
    const piId = terminalPiRef.current
    setTerminalStatus('idle'); setLoading(false)
    fetch('/api/terminal/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: piId, readerName: 'COUNTER' }),
    }).catch(() => {})
  }

  function abortSplitCharge() {
    fetch('/api/terminal/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: terminalPiRef.current, readerName: 'COUNTER' }),
    }).catch(() => {})
  }

  function startSplitLeg(amount, itemKeys) {
    setLegDue(roundCents(amount))
    setLegDueKeys(itemKeys)
    setSplitStep(splitPayments.length + 1)
  }

  async function handleSplitLegDone(payment) {
    const next = [...splitPayments, payment]
    setSplitPayments(next)

    const nextPaidKeys = [...paidItemKeys, ...(payment.itemKeys || [])]
    if (payment.itemKeys?.length) setPaidItemKeys(nextPaidKeys)

    const collected = roundCents(sum(next, (p) => p.legBase || 0))
    const everythingCollected = splitType === 'PRODUCT'
      ? nextPaidKeys.length >= splitLines.length
      : gte(collected, grandTotal.minus(0.005))

    if (!everythingCollected) {
      setLegAmountInput('')
      setLegItemKeys([])
      setSplitStep(0)
      return
    }

    const totalPaid = roundCents(sum(next, (p) => p.amountPaid))
    const totalChange = roundCents(sum(next, (p) => p.change))
    const totalSurcharge = roundCents(sum(next, (p) => p.surchargeAmount || 0))
    const cardPis = next.filter((p) => p.paymentIntentId).map((p) => p.paymentIntentId)
    const methods = [...new Set(next.map((p) => p.paymentMethod))]
    const method = methods.length === 1 ? methods[0] : 'SPLIT'
    const cashAmount = roundCents(sum(next.filter((p) => p.paymentMethod === 'CASH'), (p) => p.legBase || 0))

    setLoading(true)
    await onConfirm({
      paymentMethod: method,
      amountPaid: totalPaid,
      change: totalChange,
      cashAmount,
      paymentIntentId: cardPis.length ? cardPis.join(',') : null,
      ...getConfirmPayload(),
      surchargeType: gt(totalSurcharge, 0) ? (cardSurcharge?.type || '') : '',
      surchargeValue: gt(totalSurcharge, 0) ? (cardSurcharge?.value || 0) : 0,
      surchargeAmount: totalSurcharge,
    })
    setLoading(false)
  }

  function handleClose() {
    if (terminalPollRef.current) clearInterval(terminalPollRef.current)
    setTerminalStatus('idle'); setTerminalError('')
    setAmountPaid(''); setNote(''); setSelectedTable(null); setManualNumber(''); setCustomerName(''); setPaymentMethod('CASH')
    setOccupiedConfirmed(false); setSplitMode(false); setSplitType('PRICE'); setSplitStep(0); setSplitPayments([])
    setLegAmountInput(''); setLegItemKeys([]); setPaidItemKeys([]); setLegDue(0); setLegDueKeys([])
    setLoyaltyPhone(''); setLoyaltyCustomer(null); setLoyaltyNew(false)
    setLoyaltyNewName(''); setRedeemFree(false); setLoyaltyError('')
    setSurchargeValue(''); setDiscountType('PERCENT'); setManualDiscount('')
    onClose()
  }

  function selectTable(t) {
    const next = selectedTable?.id === t.id ? null : t
    setSelectedTable(next)
    setCustomerName('')
    setOccupiedConfirmed(false)
  }

  // Table number and customer name are two ways of naming the same order, so
  // setting either clears the other.
  function editManualNumber(value) {
    setManualNumber(value.replace(/\D/g, '').slice(0, 3))
    setCustomerName('')
  }

  function clearTableOrCustomer() {
    setSelectedTable(null)
    setManualNumber('')
    setCustomerName('')
    setOccupiedConfirmed(false)
  }

  const availableTables = tables.filter((t) => t.status === 'AVAILABLE')
  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED')
  const selectedIsOccupied = selectedTable?.status === 'OCCUPIED'
  const activeOrderCount = selectedTable?.orders?.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length ?? 0
  const canConfirm = (!selectedIsOccupied || occupiedConfirmed) && serverOk

  const paymentOptions = internetOk
    ? [{ value: 'CASH', label: '💵 Cash' }, { value: 'CARD', label: '💳 Card' }]
    : [{ value: 'CASH', label: '💵 Cash' }]

  async function lookupCustomer() {
    const phoneErr = auPhoneError(loyaltyPhone)
    if (phoneErr) return setLoyaltyError(phoneErr)
    setLoyaltyError('')
    const res = await fetch(`/api/customers?phone=${encodeURIComponent(normalizeAuPhone(loyaltyPhone))}`)
    const data = await res.json()
    if (data) {
      setLoyaltyCustomer(data)
      setLoyaltyNew(false)
    } else {
      setLoyaltyCustomer(null)
      setLoyaltyNew(true)
    }
  }

  async function createAndSetCustomer() {
    const phoneErr = auPhoneError(loyaltyPhone)
    if (phoneErr) return setLoyaltyError(phoneErr)
    if (!loyaltyNewName.trim()) return setLoyaltyError('Enter customer name')
    setLoyaltyError('')
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: loyaltyNewName.trim(), phone: normalizeAuPhone(loyaltyPhone) }),
    })
    if (!res.ok) { const d = await res.json(); return setLoyaltyError(d.error ?? 'Failed to register') }
    setLoyaltyCustomer(await res.json())
    setLoyaltyNew(false)
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Checkout" maxWidth="max-w-md">
        <div className="space-y-4 relative">

          {!serverOk && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 font-medium">
              Cannot reach POS server — check the shop PC is running.
            </div>
          )}

          {serverOk && !internetOk && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-medium">
              Internet down — cash only. Card and online orders unavailable.
            </div>
          )}

          {serverOk && !tillOpen && (paymentMethod === 'CASH' || splitMode) && (
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
                  <div className="text-sm text-gray-500">Waiting for {formatCurrency(grandTotal)} on the reader…</div>
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
                  <div className="text-sm text-gray-500">Saving the order — don&apos;t charge again.</div>
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

          {!splitMode || splitStep === 0 ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Cashier</span>
                <span className="text-xs text-gray-400">(optional)</span>
                <button
                  onClick={() => setCashierPickerOpen(true)}
                  className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-900 underline"
                >
                  {cashier ? cashier.name : 'Select'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="border-t border-gray-100" />

          {!splitMode || splitStep === 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700">{manualTables ? 'Table number' : 'Table'}</span>
                <span className="text-xs text-gray-400">(optional)</span>
                {(selectedTable || manualNumber.trim() || customerName.trim()) && (
                  <button onClick={clearTableOrCustomer} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                    Clear
                  </button>
                )}
              </div>
              {manualTables && (
                <div className="space-y-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={manualNumber}
                    onChange={(e) => editManualNumber(e.target.value)}
                    placeholder="Number given to the customer"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: tableNumberMax }, (_, i) => i + 1).map((n) => (
                      <button key={n} onClick={() => editManualNumber(manualNumber === String(n) ? '' : String(n))}
                        className={`w-11 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                          manualNumber === String(n) ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!manualTables && tables.length > 0 && (
                <div className="space-y-2">
                  {availableTables.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {availableTables.map((t) => (
                        <button key={t.id} onClick={() => selectTable(t)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                            selectedTable?.id === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-green-50 text-green-800 border-green-200 hover:border-green-400'
                          }`}>
                          T{t.number}
                          {t.label && <span className="block text-xs font-normal opacity-70">{t.label}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {occupiedTables.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1.5">Occupied</p>
                      <div className="flex flex-wrap gap-2">
                        {occupiedTables.map((t) => {
                          const active = t.orders?.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length ?? 0
                          return (
                            <button key={t.id} onClick={() => selectTable(t)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                                selectedTable?.id === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-orange-50 text-orange-800 border-orange-200 hover:border-orange-400'
                              }`}>
                              T{t.number}
                              <span className="block text-xs font-normal opacity-70">{active} bill{active !== 1 ? 's' : ''}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Customer name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value)
                    setSelectedTable(null)
                    setManualNumber('')
                    setOccupiedConfirmed(false)
                  }}
                  placeholder="Regular customer name"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {selectedIsOccupied && (
                <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <p className="text-sm font-semibold text-orange-800 mb-1">⚠ Table {selectedTable.number} is already occupied</p>
                  <p className="text-xs text-orange-600 mb-3">
                    There {activeOrderCount === 1 ? 'is' : 'are'} currently <strong>{activeOrderCount} active bill{activeOrderCount !== 1 ? 's' : ''}</strong> on this table. This will add a separate new bill.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={occupiedConfirmed} onChange={(e) => setOccupiedConfirmed(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                    <span className="text-sm font-medium text-orange-800">Yes, I want to add a new bill to this table</span>
                  </label>
                </div>
              )}
            </div>
          ) : null}

          <div className="border-t border-gray-100" />

          {!splitMode || splitStep === 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700">☕ Stamp Card</span>
                <span className="text-xs text-gray-400">(optional)</span>
                {loyaltyCustomer && (
                  <button onClick={() => { setLoyaltyCustomer(null); setLoyaltyPhone(''); setRedeemFree(false) }}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
                )}
              </div>
              {!loyaltyCustomer ? (
                <div className="flex gap-2">
                  <input type="tel" inputMode="tel" autoComplete="tel" placeholder="Customer phone"
                    value={formatAuPhoneDisplay(loyaltyPhone)}
                    onChange={(e) => { setLoyaltyPhone(sanitizePhoneInput(e.target.value)); setLoyaltyNew(false); setLoyaltyError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && lookupCustomer()}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <button onClick={lookupCustomer} disabled={!isValidAuPhone(loyaltyPhone)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors disabled:opacity-40">
                    Find
                  </button>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-amber-900">{loyaltyCustomer.name}</span>
                    <span className="text-xs text-amber-600">{loyaltyCustomer.phone}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {Array.from({ length: 9 }).map((_, i) => {
                      const filled = i < stampProgress
                      const earning = !filled && i < Math.min(stampProgress + loyaltyStampsEarned, 9)
                      return (
                        <span key={i} className="text-base" title={earning ? 'Earning this order' : undefined}>
                          {filled ? '☕' : earning ? '🟤' : '○'}
                        </span>
                      )
                    })}
                    <span className="text-xs text-amber-600 ml-1">{stampProgress}/9</span>
                  </div>
                  {loyaltyStampsEarned > 0 && (
                    <p className="text-xs text-amber-700 mb-2">+{loyaltyStampsEarned} stamp{loyaltyStampsEarned > 1 ? 's' : ''} this order</p>
                  )}
                  {loyaltyCustomer.freeItems > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={redeemFree} onChange={(e) => setRedeemFree(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                      <span className="text-sm font-semibold text-amber-800">
                        Redeem 1 free coffee{gt(discountAmount, 0) ? ` (−${formatCurrency(discountAmount)})` : ''}
                      </span>
                    </label>
                  )}
                </div>
              )}
              {loyaltyNew && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-500">Phone not found — register new customer?</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Customer name" value={loyaltyNewName}
                      onChange={(e) => setLoyaltyNewName(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <button onClick={createAndSetCustomer}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors">
                      Register
                    </button>
                  </div>
                  {loyaltyError && <p className="text-red-500 text-xs">{loyaltyError}</p>}
                </div>
              )}
            </div>
          ) : null}

          {!splitMode || splitStep === 0 ? (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-700 block mb-2">Surcharge</span>
                <div className="flex gap-2 items-center">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {['PERCENT', 'FIXED'].map((t) => (
                      <button key={t} type="button" onClick={() => setSurchargeType(t)}
                        className={`px-5 py-3 text-base font-semibold transition-colors ${surchargeType === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {t === 'PERCENT' ? '%' : '$'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    placeholder={surchargeType === 'PERCENT' ? 'e.g. 10' : 'e.g. 2.50'}
                    value={surchargeValue}
                    onChange={(e) => { setManualDiscount(''); setSurchargeValue(e.target.value) }}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  {gt(surchargeAmount, 0) && (
                    <span className="text-xs text-gray-500 font-mono">+{formatCurrency(surchargeAmount)}</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 block mb-2">Discount</span>
                <div className="flex gap-2 items-center">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                    {['PERCENT', 'FLAT'].map((t) => (
                      <button key={t} type="button" onClick={() => { setDiscountType(t); setManualDiscount('') }}
                        className={`px-5 py-3 text-base font-semibold transition-colors ${discountType === t ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {t === 'PERCENT' ? '%' : '$'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step={discountType === 'PERCENT' ? '1' : '0.50'}
                    placeholder={discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 5.00'}
                    value={manualDiscount}
                    onChange={(e) => { setSurchargeValue(''); setManualDiscount(e.target.value) }}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  {gt(parsedManualDiscount, 0) && (
                    <span className="text-xs text-gray-500 font-mono">−{formatCurrency(parsedManualDiscount)}</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="border-t border-gray-100" />

          <CheckoutTotalsPanel
            items={items}
            itemsSubtotal={itemsSubtotal}
            surchargeAmount={surchargeAmount}
            surchargeType={surchargeType}
            parsedSurchargeValue={parsedSurchargeValue}
            parsedManualDiscount={parsedManualDiscount}
            loyaltyDiscount={loyaltyDiscount}
            grandTotal={grandTotal}
          />

          {!splitMode ? (
            <CheckoutPaymentSection
              paymentOptions={paymentOptions}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              onStartSplit={() => { setSplitMode(true); setSplitStep(0); setSplitPayments([]) }}
              amountPaid={amountPaid}
              setAmountPaid={setAmountPaid}
              paid={paid}
              change={change}
              grandTotal={grandTotal}
              note={note}
              setNote={setNote}
              loading={loading}
              canConfirm={canConfirm}
              onClose={handleClose}
              onConfirm={handleConfirm}
            />
          ) : (
            <CheckoutSplitSection
              splitType={splitType}
              setSplitType={setSplitType}
              splitPayments={splitPayments}
              splitRemaining={splitRemaining}
              splitStep={splitStep}
              legAmountInput={legAmountInput}
              setLegAmountInput={setLegAmountInput}
              remainingLines={remainingLines}
              legItemKeys={legItemKeys}
              setLegItemKeys={setLegItemKeys}
              legSelectedAmount={legSelectedAmount}
              splitPriceValid={splitPriceValid}
              splitPriceDue={splitPriceDue}
              note={note}
              setNote={setNote}
              canConfirm={canConfirm}
              onExitSplit={() => setSplitMode(false)}
              onStartLeg={startSplitLeg}
              legDue={legDue}
              legDueKeys={legDueKeys}
              splitLineByKey={splitLineByKey}
              splitLines={splitLines}
              paidItemKeys={paidItemKeys}
              splitCollected={splitCollected}
              grandTotal={grandTotal}
              onLegDone={handleSplitLegDone}
              cardSurcharge={cardSurcharge}
              terminalEnabled={terminalEnabled}
              internetOk={internetOk}
              onChargeCard={chargeTerminal}
              onCancelCharge={abortSplitCharge}
            />
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
