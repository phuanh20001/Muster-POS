'use client'

import { useState, useEffect } from 'react'
import OnlineCheckoutStampCard from '@/components/loyalty/OnlineCheckoutStampCard'
import LoyaltyProductBadge from '@/components/loyalty/LoyaltyProductBadge'
import ProductThumb from '@/components/shared/ProductThumb'
import { usePublicMenu } from '@/hooks/usePublicMenu'
import { cartLoyaltyEligibleUnitPrices, cartStampsEarned, isProductLoyaltyEligible } from '@/lib/loyalty'
import { itemsSubtotal, lineTotalForItem } from '@/lib/orderTotals'
import { effectiveModifiers } from '@/lib/productModifiers'
import { D, min, max, roundCents, gt, sum } from '@/lib/money'
import { auPhoneError, formatAuPhoneDisplay, isValidAuPhone, normalizeAuPhone, sanitizePhoneInput } from '@/lib/phone'
import { BRAND_NAME } from '@/lib/brand'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime12h(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const period = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour}${period}` : `${hour}:${String(m).padStart(2, '0')}${period}`
}

function nextOpenText(ordering) {
  const next = ordering?.nextOpen
  if (ordering?.reason === 'PAUSED' || !next) {
    return "We're not taking online orders right now. Please check back soon."
  }
  const when = next.daysAway === 0 ? 'today' : next.daysAway === 1 ? 'tomorrow' : DAY_NAMES[next.dayOfWeek]
  return `We're closed right now. Online orders open ${when} at ${formatTime12h(next.openTime)}.`
}

export default function PublicOnlineOrderPage({ basePath }) {
  const { categories, products } = usePublicMenu()
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [cardSurcharge, setCardSurcharge] = useState(null)
  const [vouchersEnabled, setVouchersEnabled] = useState(false)
  // Display-only; POST /api/orders/online is the authoritative gate.
  const [ordering, setOrdering] = useState(null)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(null)
  const [redeemFree, setRedeemFree] = useState(false)

  // Applied voucher: { code, type, discount } or null. Cleared when the cart or
  // free-coffee toggle changes (its discount depends on the cart contents).
  const [voucher, setVoucher] = useState(null)
  const [voucherCodeInput, setVoucherCodeInput] = useState('')
  const [voucherError, setVoucherError] = useState('')
  const [validatingVoucher, setValidatingVoucher] = useState(false)

  // Order recovery (re-open tracking after closing the tab).
  const [savedOrderToken, setSavedOrderToken] = useState(null)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  useEffect(() => {
    try { setSavedOrderToken(localStorage.getItem('dc_last_order')) } catch {}
    fetch('/api/payment-settings/public')
      .then((r) => r.json())
      .then((d) => {
        setCardSurcharge(
          d?.cardSurchargeType && d?.cardSurchargeValue > 0
            ? { type: d.cardSurchargeType, value: d.cardSurchargeValue }
            : null
        )
        setVouchersEnabled(Boolean(d?.vouchersEnabled))
        if (d?.ordering) setOrdering(d.ordering)
      })
      .catch(() => { setCardSurcharge(null); setVouchersEnabled(false) })
  }, [])

  // A voucher's discount depends on the cart, so drop it whenever the cart
  // changes — the customer re-applies to revalidate against the new contents.
  const cartSignature = cart.map((i) => `${i.productId}:${i.size}:${i.quantity}`).join('|')
  useEffect(() => {
    setVoucher(null)
    setVoucherError('')
  }, [cartSignature])

  useEffect(() => {
    if (!isValidAuPhone(phone)) {
      setLoyaltyCustomer(null)
      setRedeemFree(false)
      return
    }
    const normalized = normalizeAuPhone(phone)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?phone=${encodeURIComponent(normalized)}`)
        if (!res.ok) {
          setLoyaltyCustomer(null)
          setRedeemFree(false)
          return
        }
        const data = await res.json()
        if (data?.found) {
          setLoyaltyCustomer(data)
          if (!data.freeItems) setRedeemFree(false)
        } else {
          setLoyaltyCustomer(null)
          setRedeemFree(false)
        }
      } catch {
        setLoyaltyCustomer(null)
        setRedeemFree(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [phone])

  async function findOrderByPhone() {
    const phoneErr = auPhoneError(lookupPhone)
    if (phoneErr) { setLookupError(phoneErr); return }
    setLookupError('')
    setLookingUp(true)
    try {
      const res = await fetch(`/api/orders/lookup?phone=${encodeURIComponent(normalizeAuPhone(lookupPhone))}`)
      if (res.status === 429) { setLookupError('Too many attempts. Please wait a minute.'); return }
      const data = await res.json()
      if (data?.trackingToken) {
        window.location.href = `${basePath}/track/${data.trackingToken}`
      } else {
        setLookupError('No active order found for that number.')
      }
    } catch {
      setLookupError('Network error. Please try again.')
    } finally {
      setLookingUp(false)
    }
  }

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.categoryId === selectedCategory)
    : products

  const cartTotal = itemsSubtotal(cart, { includeAdjustments: false })

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const eligiblePrices = cartLoyaltyEligibleUnitPrices(cart, products)
  const hasEligibleItems = eligiblePrices.length > 0
  const loyaltyDiscount = redeemFree && loyaltyCustomer?.freeItems > 0 && hasEligibleItems
    ? min(...eligiblePrices.map(D))
    : D(0)
  const ineligibleCartNames = [...new Set(
    cart
      .filter((item) => !isProductLoyaltyEligible(item.productId, products))
      .map((item) => item.productName)
  )]
  const eligibleExamples = products.filter((p) => p.loyaltyEnabled).map((p) => p.name)
  const stampsEarnedThisOrder = cartStampsEarned(cart, products)

  // Voucher and free-coffee are mutually exclusive (server enforces this too).
  // Display-only: the amount charged is always recomputed server-side at checkout.
  const voucherDiscount = voucher && !redeemFree ? roundCents(min(D(voucher.discount), cartTotal)) : D(0)
  const totalDiscount = redeemFree ? loyaltyDiscount : voucherDiscount
  const discountedSubtotal = max(cartTotal.minus(totalDiscount), D(0))

  const surchargeAmount = cardSurcharge
    ? roundCents(cardSurcharge.type === 'PERCENT' ? discountedSubtotal.times(D(cardSurcharge.value).div(100)) : D(cardSurcharge.value))
    : D(0)
  const grandTotal = discountedSubtotal.plus(surchargeAmount)

  const shopClosed = ordering ? !ordering.open : false
  const closedText = ordering?.closedMessage || nextOpenText(ordering)

  async function applyVoucher() {
    const code = voucherCodeInput.trim().toUpperCase()
    if (!code) return
    if (cart.length === 0) { setVoucherError('Add items to your cart first.'); return }
    setVoucherError('')
    setValidatingVoucher(true)
    try {
      const res = await fetch('/api/vouchers/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, items: cart }),
      })
      const data = await res.json()
      if (data?.valid) {
        setVoucher({ code: data.code, type: data.type, discount: data.discount })
        setRedeemFree(false)
        setVoucherError('')
      } else {
        setVoucher(null)
        setVoucherError(data?.error ?? 'Invalid code')
      }
    } catch {
      setVoucherError('Network error. Please try again.')
    } finally {
      setValidatingVoucher(false)
    }
  }

  function removeVoucher() {
    setVoucher(null)
    setVoucherCodeInput('')
    setVoucherError('')
  }

  function addToCart(entry) {
    setCart((prev) => {
      const key = `${entry.productId}|${entry.size}|${(entry.modifiers ?? []).map((m) => m.id).join(',')}`
      const existing = prev.find((i) => i._key === key)
      if (existing) {
        return prev.map((i) => i._key === key ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { ...entry, _key: key, quantity: 1 }]
    })
  }

  function removeFromCart(key) {
    setCart((prev) => prev.filter((i) => i._key !== key))
  }

  function changeQty(key, delta) {
    setCart((prev) =>
      prev
        .map((i) => i._key === key ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    )
  }

  async function handlePlaceOrder() {
    if (shopClosed) { setError(closedText); return }
    if (!name.trim()) { setError('Please enter your name.'); return }
    const phoneErr = auPhoneError(phone)
    if (phoneErr) { setError(phoneErr); return }
    if (cart.length === 0) { setError('Your cart is empty.'); return }
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizeAuPhone(phone),
          items: cart,
          ...(redeemFree ? { redeemFree: true } : {}),
          ...(!redeemFree && voucher ? { voucherCode: voucher.code } : {}),
          ...(basePath !== '/order' ? { returnBase: basePath } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to place order.'); setSubmitting(false); return }
      window.location.href = data.checkoutUrl
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-gray-950 text-white px-4 py-4 flex items-center justify-between sticky top-0 z-30">
        <div>
          <div className="font-bold text-lg tracking-tight">{BRAND_NAME}</div>
          <div className="text-gray-400 text-xs">Online Pickup Order</div>
        </div>
        {cartCount > 0 && (
          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-xl font-semibold text-sm"
          >
            <span>🛒</span>
            <span>{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
            <span className="text-gray-500">·</span>
            <span>${cartTotal.toFixed(2)}</span>
          </button>
        )}
      </div>

      {shopClosed && (
        <div className="bg-gray-900 text-white px-4 py-3 text-center">
          <div className="font-semibold text-sm">😴 {closedText}</div>
          {ordering?.hoursEnabled && ordering?.reason === 'OUTSIDE_HOURS' && ordering?.today && (
            <div className="text-gray-400 text-xs mt-0.5">
              Today&apos;s hours: {formatTime12h(ordering.today.openTime)} – {formatTime12h(ordering.today.closeTime)}. You can still browse the menu.
            </div>
          )}
        </div>
      )}

      {/* Category tabs */}
      <div className="bg-white border-b border-gray-100 px-4 overflow-x-auto sticky top-[72px] z-20" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 py-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedCategory === null
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedCategory === cat.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Order recovery */}
      <div className="px-4 pt-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-wrap items-center gap-2">
          {savedOrderToken && (
            <a
              href={`${basePath}/track/${savedOrderToken}`}
              className="flex-1 min-w-[160px] text-center bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-xl"
            >
              Track my recent order →
            </a>
          )}
          <button
            onClick={() => { setLookupOpen((v) => !v); setLookupError('') }}
            className={`text-sm font-semibold py-2.5 rounded-xl px-4 ${savedOrderToken ? 'text-gray-600' : 'flex-1 bg-gray-100 text-gray-700'}`}
          >
            Find my order by phone
          </button>
          {lookupOpen && (
            <div className="w-full mt-1">
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="04XX XXX XXX"
                  value={formatAuPhoneDisplay(lookupPhone)}
                  onChange={(e) => setLookupPhone(sanitizePhoneInput(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && findOrderByPhone()}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={findOrderByPhone}
                  disabled={lookingUp}
                  className="bg-gray-900 text-white text-sm font-semibold px-4 rounded-xl disabled:opacity-50"
                >
                  {lookingUp ? '…' : 'Find'}
                </button>
              </div>
              {lookupError && <p className="text-red-500 text-xs mt-1.5">{lookupError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Product grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-32">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            onClick={() => setSelectedProduct(product)}
            className="bg-white rounded-2xl border border-gray-100 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all active:scale-95"
          >
            <div className="relative mb-3 w-fit">
              <ProductThumb product={product} emojiClassName="text-4xl" imgClassName="w-14 h-14 rounded-xl object-cover" />
              {product.loyaltyEnabled && (
                <LoyaltyProductBadge className="absolute -top-1 -right-2 text-[10px] w-5 h-5" />
              )}
            </div>
            <div className="font-semibold text-gray-900 text-sm leading-tight">{product.name}</div>
            {product.description && (
              <div className="text-gray-400 text-xs mt-1 leading-tight line-clamp-2">{product.description}</div>
            )}
            <div className="font-bold text-gray-900 mt-2 text-sm">
              {product.sizes?.length ? `From $${min(...product.sizes.map((s) => D(s.price))).toFixed(2)}` : `$${D(product.price).toFixed(2)}`}
            </div>
          </button>
        ))}
      </div>

      {/* Sticky bottom bar when cart has items */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-base flex items-center justify-between px-5"
          >
            <span className="bg-white/20 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">{cartCount}</span>
            <span>View Order</span>
            <span>${cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Product selection modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={(entry) => { addToCart(entry); setSelectedProduct(null) }}
        />
      )}

      {/* Cart / checkout drawer */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          cartTotal={cartTotal}
          loyaltyDiscount={loyaltyDiscount}
          voucher={voucher}
          voucherDiscount={voucherDiscount}
          vouchersEnabled={vouchersEnabled}
          voucherCodeInput={voucherCodeInput}
          voucherError={voucherError}
          validatingVoucher={validatingVoucher}
          onVoucherCodeChange={setVoucherCodeInput}
          onApplyVoucher={applyVoucher}
          onRemoveVoucher={removeVoucher}
          cardSurcharge={cardSurcharge}
          surchargeAmount={surchargeAmount}
          grandTotal={grandTotal}
          name={name}
          phone={phone}
          loyaltyCustomer={loyaltyCustomer}
          stampsEarnedThisOrder={stampsEarnedThisOrder}
          redeemFree={redeemFree}
          hasEligibleItems={hasEligibleItems}
          ineligibleCartNames={ineligibleCartNames}
          eligibleExamples={eligibleExamples}
          onRedeemChange={(v) => { setRedeemFree(v); if (v) removeVoucher() }}
          onNameChange={setName}
          onPhoneChange={(value) => setPhone(sanitizePhoneInput(value))}
          onChangeQty={changeQty}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onPlaceOrder={handlePlaceOrder}
          submitting={submitting}
          shopClosed={shopClosed}
          closedText={closedText}
          error={error}
        />
      )}
    </div>
  )
}

function ProductModal({ product, onClose, onAdd }) {
  const hasSizes = product.sizes?.length > 0
  const allModifiers = effectiveModifiers(product)

  const [selectedSize, setSelectedSize] = useState(hasSizes ? product.sizes[0] : null)
  const [selectedMods, setSelectedMods] = useState([])
  const [notes, setNotes] = useState('')

  const basePrice = selectedSize ? selectedSize.price : product.price
  const modsTotal = sum(selectedMods, (m) => m.price)
  const total = D(basePrice).plus(modsTotal)

  function toggleMod(mod) {
    setSelectedMods((prev) =>
      prev.find((m) => m.id === mod.id && m.source === mod.source)
        ? prev.filter((m) => !(m.id === mod.id && m.source === mod.source))
        : [...prev, mod]
    )
  }

  function handleAdd() {
    onAdd({
      productId: product.id,
      productName: product.name,
      unitPrice: basePrice,
      loyaltyEnabled: product.loyaltyEnabled ?? false,
      size: selectedSize?.label ?? '',
      notes,
      modifiers: selectedMods,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <ProductThumb product={product} emojiClassName="text-5xl mb-2 block" imgClassName="w-16 h-16 rounded-xl object-cover mb-2" />
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
                {product.loyaltyEnabled && <LoyaltyProductBadge />}
              </div>
              {product.description && <p className="text-gray-500 text-sm mt-1">{product.description}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
          </div>

          {hasSizes && (
            <div className="mb-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Size</div>
              <div className="grid grid-cols-2 gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setSelectedSize(size)}
                    className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedSize?.id === size.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <div>{size.label}</div>
                    <div className={`text-xs mt-0.5 ${selectedSize?.id === size.id ? 'text-gray-300' : 'text-gray-400'}`}>${D(size.price).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {allModifiers.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add-ons</div>
              <div className="space-y-2">
                {allModifiers.map((mod) => {
                  const isSelected = selectedMods.find((m) => m.id === mod.id && m.source === mod.source)
                  return (
                    <button
                      key={`${mod.source}-${mod.id}`}
                      onClick={() => toggleMod(mod)}
                      className={`w-full flex items-center justify-between py-2.5 px-3 rounded-xl border text-sm transition-all ${
                        isSelected
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="font-medium text-gray-800">{mod.name}</span>
                      </div>
                      {gt(mod.price, 0) && <span className="text-gray-500">+${D(mod.price).toFixed(2)}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mb-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Special instructions</div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no ice, extra hot..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>

          <button
            onClick={handleAdd}
            className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-base flex items-center justify-between px-5"
          >
            <span>Add to order</span>
            <span>${total.toFixed(2)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function CartDrawer({
  cart,
  cartTotal,
  loyaltyDiscount,
  voucher,
  voucherDiscount,
  vouchersEnabled,
  voucherCodeInput,
  voucherError,
  validatingVoucher,
  onVoucherCodeChange,
  onApplyVoucher,
  onRemoveVoucher,
  cardSurcharge,
  surchargeAmount,
  grandTotal,
  name,
  phone,
  loyaltyCustomer,
  stampsEarnedThisOrder,
  redeemFree,
  hasEligibleItems,
  ineligibleCartNames,
  eligibleExamples,
  onRedeemChange,
  onNameChange,
  onPhoneChange,
  onChangeQty,
  onRemove,
  onClose,
  onPlaceOrder,
  submitting,
  shopClosed,
  closedText,
  error,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Your Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {cart.map((item) => {
            const lineTotal = lineTotalForItem({ ...item, priceAdjustment: 0 })
            return (
              <div key={item._key} className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">
                    {item.productName}
                    {item.size && <span className="text-gray-500 font-normal"> · {item.size}</span>}
                  </div>
                  {item.modifiers?.length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">{item.modifiers.map((m) => m.name).join(', ')}</div>
                  )}
                  {item.notes && <div className="text-xs text-gray-400 italic mt-0.5">{item.notes}</div>}
                  <div className="text-sm font-semibold text-gray-700 mt-1">${lineTotal.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => onChangeQty(item._key, -1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-sm">−</button>
                  <span className="text-sm font-semibold w-4 text-center">{item.quantity}</span>
                  <button onClick={() => onChangeQty(item._key, 1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-sm">+</button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>${cartTotal.toFixed(2)}</span>
            </div>
            {gt(loyaltyDiscount, 0) && (
              <div className="flex justify-between text-sm text-amber-700">
                <span>Free coffee</span>
                <span>−${D(loyaltyDiscount).toFixed(2)}</span>
              </div>
            )}
            {gt(voucherDiscount, 0) && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Voucher {voucher?.code}</span>
                <span>−${D(voucherDiscount).toFixed(2)}</span>
              </div>
            )}
            {gt(surchargeAmount, 0) && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Card surcharge{cardSurcharge?.type === 'PERCENT' ? ` (${cardSurcharge.value}%)` : ''}</span>
                <span>+${surchargeAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1">
              <span>Total</span>
              <span>${grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {vouchersEnabled && !redeemFree && (
            <div>
              {voucher ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                  <span className="text-sm font-medium text-green-800">🎟️ {voucher.code} applied</span>
                  <button onClick={onRemoveVoucher} className="text-xs font-semibold text-green-700 hover:text-green-900">Remove</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={voucherCodeInput}
                      onChange={(e) => onVoucherCodeChange(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && onApplyVoucher()}
                      placeholder="Promo code"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={onApplyVoucher}
                      disabled={validatingVoucher || !voucherCodeInput.trim()}
                      className="bg-gray-900 text-white text-sm font-semibold px-4 rounded-xl disabled:opacity-50"
                    >
                      {validatingVoucher ? '…' : 'Apply'}
                    </button>
                  </div>
                  {voucherError && <p className="text-red-500 text-xs mt-1.5">{voucherError}</p>}
                </>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your details</div>
            <div className="space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Your name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
              />
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={formatAuPhoneDisplay(phone)}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="04XX XXX XXX"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
              />
              <p className="text-xs text-gray-400">Australian mobile or landline, 10 digits.</p>
            </div>
          </div>

          {loyaltyCustomer && (
            <OnlineCheckoutStampCard
              loyaltyCustomer={loyaltyCustomer}
              stampsEarnedThisOrder={stampsEarnedThisOrder}
              loyaltyDiscount={loyaltyDiscount}
              redeemFree={redeemFree}
              onRedeemChange={onRedeemChange}
              hasEligibleItems={hasEligibleItems}
              ineligibleCartNames={ineligibleCartNames}
              eligibleExamples={eligibleExamples}
            />
          )}

          {shopClosed && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 text-center font-medium">
              😴 {closedText}
            </div>
          )}

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <button
            onClick={onPlaceOrder}
            disabled={submitting || shopClosed}
            className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-base disabled:opacity-60"
          >
            {shopClosed ? 'Closed' : submitting ? 'Redirecting to payment…' : 'Pay Now →'}
          </button>
          {!shopClosed && (
            <p className="text-xs text-gray-400 text-center">You will be redirected to our secure payment page.</p>
          )}
        </div>
      </div>
    </div>
  )
}
