'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useMenu } from '@/hooks/useMenu'
import { useCart } from '@/hooks/useCart'
import { D, roundCents } from '@/lib/money'
import { usePosConnectivity } from '@/hooks/usePosConnectivity'
import { usePosLock } from '@/hooks/usePosLock'
import { useCashier } from '@/contexts/CashierContext'
import CategoryTabs from '@/components/pos/CategoryTabs'
import MenuGrid from '@/components/pos/MenuGrid'
import Cart from '@/components/pos/Cart'
import CheckoutModal from '@/components/pos/CheckoutModal'
import QuickSaleModal from '@/components/pos/QuickSaleModal'
import ProductOptionsModal from '@/components/pos/ProductOptionsModal'
import ComboBuilderModal from '@/components/pos/ComboBuilderModal'
import MoneyInOutModal from '@/components/pos/MoneyInOutModal'
import OrderAdjustmentModal from '@/components/pos/OrderAdjustmentModal'
import SwitchUserModal from '@/components/pos/SwitchUserModal'
import ReservationsModal from '@/components/pos/ReservationsModal'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'
import { usePromptDialog } from '@/hooks/usePromptDialog'
import { postOrderWithRetry, readOrderError } from '@/lib/saveOrder'

function PosPageContent() {
  const { categories, products, loading, fromCache, refresh: refreshMenu } = useMenu()
  const { items, total, addItem, addComboItem, removeItem, updateQty, updateItem, clearCart } = useCart()
  const { serverOk, internetOk } = usePosConnectivity()
  const { posBlocked, takeOver } = usePosLock()
  const { setCashier, switchUserOpen, closeSwitchUser } = useCashier()
  const { alert: alertDialog, confirm: confirmDialog, dialog } = usePromptDialog()
  const [activeCategoryId, setActiveCategoryId] = useState(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [quickSaleOpen, setQuickSaleOpen] = useState(false)
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  // Non-null while a card sale's save is being retried — shown to staff so a
  // recovery is never invisible.
  const [saveRetry, setSaveRetry] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedCombo, setSelectedCombo] = useState(null)
  const [comboEdit, setComboEdit] = useState(null)
  const [managerPinOpen, setManagerPinOpen] = useState(false)
  const [managerReturnUrl, setManagerReturnUrl] = useState('/manager/menu')
  const [moneyInOutPinOpen, setMoneyInOutPinOpen] = useState(false)
  const [moneyInOutOpen, setMoneyInOutOpen] = useState(false)
  const [moneyInOutUser, setMoneyInOutUser] = useState(null)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [orderActiveTab, setOrderActiveTab] = useState('discount')
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [orderDiscountType, setOrderDiscountType] = useState('PERCENT')
  const [orderDiscountValue, setOrderDiscountValue] = useState(0)
  const [orderSurchargeType, setOrderSurchargeType] = useState('PERCENT')
  const [orderSurchargeValue, setOrderSurchargeValue] = useState(0)
  const [orderCount, setOrderCount] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [reservationsOpen, setReservationsOpen] = useState(false)
  const [tillOpen, setTillOpen] = useState(true)
  const [shiftRoutineEnabled, setShiftRoutineEnabled] = useState(true)

  const searchParams = useSearchParams()
  const router = useRouter()

  const orderSurchargeAmount = roundCents(orderSurchargeType === 'PERCENT'
    ? D(total).times(D(orderSurchargeValue).div(100))
    : D(orderSurchargeValue))

  useEffect(() => {
    if (searchParams.get('managerRequired') === '1') {
      setManagerPinOpen(true)
      const ref = document.referrer
      if (ref) {
        try {
          const url = new URL(ref)
          if (url.pathname.startsWith('/manager')) setManagerReturnUrl(url.pathname)
        } catch {}
      }
    }
  }, [searchParams])

  const fetchOrderCount = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/orders?count=1&date=${today}`)
      .then((r) => r.json())
      .then((d) => setOrderCount(d.count ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchOrderCount()
  }, [fetchOrderCount])

  const checkTill = useCallback(async () => {
    try {
      const [cashRes, settingsRes] = await Promise.all([
        fetch('/api/cash'),
        fetch('/api/shift-settings'),
      ])
      const data = await cashRes.json()
      setTillOpen(data != null)
      const settings = await settingsRes.json()
      if (typeof settings.shiftRoutineEnabled === 'boolean') {
        setShiftRoutineEnabled(settings.shiftRoutineEnabled)
      }
    } catch {
      setTillOpen(true)
    }
  }, [])

  usePollWhenVisible(checkTill, 30000)
  // Pick up manager menu edits (category/name/price/emoji) without a manual
  // reload — refetches on tab focus and every 60s while visible.
  usePollWhenVisible(refreshMenu, 60000)

  const enforceTill = shiftRoutineEnabled && !tillOpen

  const filteredProducts = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return products.filter((p) => p.name.toLowerCase().includes(q))
    }
    return activeCategoryId
      ? products.filter((p) => p.categoryId === activeCategoryId)
      : products
  }, [products, activeCategoryId, searchQuery])

  const handleProductSelect = useCallback((product) => {
    if (!product.available) return
    if (product.isCombo) {
      setComboEdit(null)
      setSelectedCombo(product)
      return
    }
    setSelectedProduct(product)
  }, [])

  function handleOptionsConfirm(size, notes, sizePrice, modifiers) {
    addItem(selectedProduct, size, notes, sizePrice, modifiers)
    setSelectedProduct(null)
  }

  function closeCombo() {
    setSelectedCombo(null)
    setComboEdit(null)
  }

  function handleEditCombo(item) {
    setComboEdit({ cartItemId: item.cartItemId, selections: item.comboSelections ?? [], notes: item.notes ?? '' })
    setSelectedCombo(item.product)
  }

  // A combo is one fixed-price line; chosen components + their upcharges ride
  // along as snapshot modifiers (source 'combo') so they print but don't earn
  // per-component stamps or stock. Editing replaces the existing line in place.
  function handleComboConfirm({ modifiers, notes, selections }) {
    if (comboEdit) {
      updateItem(comboEdit.cartItemId, { modifiers, notes, comboSelections: selections })
    } else {
      addComboItem(selectedCombo, { modifiers, notes, selections })
    }
    closeCombo()
  }

  function handleApplyAdjustment({ activeTab, discount, discountType, discountValue, surchargeType, surchargeValue, surchargeAmount }) {
    setOrderActiveTab(activeTab)
    setOrderDiscount(discount)
    setOrderDiscountType(discountType)
    setOrderDiscountValue(discountValue)
    setOrderSurchargeType(surchargeType)
    setOrderSurchargeValue(surchargeValue)
    setAdjustmentOpen(false)
  }

  // Saves an order, auto-retrying transient failures. Retries are only attempted
  // when the payload has a paymentIntentId (POST /api/orders dedupes on it, so a
  // retry can't double-charge or double-ring); see src/lib/saveOrder.js. Staff see
  // each retry rather than it happening behind their back. On final failure a card
  // sale is offered a manual "Try saving again" — the charge already happened, so
  // saving again is the safe action and re-ringing is not.
  // Returns { ok, recovered } — recovered means it took more than one attempt.
  async function saveOrderVisibly(payload, { title, keptNote = '' }) {
    const isCard = payload.paymentMethod !== 'CASH' && Boolean(payload.paymentIntentId)
    let recovered = false

    for (;;) {
      const attempt = await postOrderWithRetry(payload, {
        onRetry: (n, max) => setSaveRetry({ n, max }),
      })
      setSaveRetry(null)
      if (attempt.ok) return { ok: true, recovered: recovered || attempt.recovered }

      const serverError = await readOrderError(attempt.res)

      if (isCard) {
        const again = await confirmDialog(
          `${serverError || 'The sale could not be saved.'} The card has already been charged, so saving again is safe — it will not charge the customer a second time.`,
          { title, confirmLabel: 'Try saving again', cancelLabel: 'Stop', confirmVariant: 'primary' },
        )
        if (again) { recovered = true; continue }
        await alertDialog(
          `Sale not saved. The card may have already been charged — check the payment terminal and refund if needed before re-ringing.${keptNote}`,
          { title },
        )
        return { ok: false, recovered: false }
      }

      // Cash has no idempotency key, so a retry could ring the sale twice.
      await alertDialog(`${serverError || 'The order could not be saved.'}${keptNote}`, { title })
      return { ok: false, recovered: false }
    }
  }

  // Returns true only when the order was actually recorded. On any failure the
  // cart is KEPT (never silently cleared) and staff are alerted — critical for
  // card, where the reader may have already charged, so a lost order = a charge
  // with no record that needs a refund.
  async function handleConfirmOrder({ paymentMethod, amountPaid, change, note, grandTotal, tableId, tableNumber, tableManual, customerId, stampEarned, freeItemRedeemed, discountAmount, userId, surchargeType, surchargeValue, surchargeAmount, manualDiscount, cashAmount, paymentIntentId }) {
    if (!serverOk) return false
    const payload = {
      paymentMethod,
      amountPaid,
      change,
      cashAmount: cashAmount ?? undefined,
      paymentIntentId: paymentIntentId ?? undefined,
      note,
      tableId: tableId ?? null,
      tableNumber: tableNumber ?? '',
      tableManual: tableManual ?? false,
      userId: userId ?? null,
      customerId: customerId ?? null,
      stampEarned: stampEarned ?? 0,
      freeItemRedeemed: freeItemRedeemed ?? false,
      discountAmount: discountAmount ?? 0,
      surchargeType: surchargeType ?? '',
      surchargeValue: surchargeValue ?? 0,
      surchargeAmount: surchargeAmount ?? 0,
      manualDiscount: manualDiscount ?? 0,
      items: items.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        size: i.size,
        notes: i.notes,
        modifiers: i.modifiers ?? [],
        priceAdjustment: i.priceAdjustment ?? 0,
        priceAdjustmentNote: i.priceAdjustmentNote ?? '',
      })),
    }

    const { ok, recovered } = await saveOrderVisibly(payload, {
      title: 'Order not saved',
      keptNote: ' Your cart has been kept so you can try again.',
    })
    if (!ok) return false

    clearCart()
    setOrderActiveTab('discount')
    setOrderDiscount(0)
    setOrderDiscountType('PERCENT')
    setOrderDiscountValue(0)
    setOrderSurchargeType('PERCENT')
    setOrderSurchargeValue(0)
    setCheckoutOpen(false)
    setCartDrawerOpen(false)
    fetchOrderCount()
    const base = paymentMethod === 'CARD' ? 'Order placed! Paid by card.' : `Order placed! Change: $${D(change).toFixed(2)}`
    setSuccessMessage(recovered ? `${base} (saved on retry — charged once)` : base)
    setTimeout(() => setSuccessMessage(''), recovered ? 8000 : 4000)
    return true
  }

  // Quick Sale — a custom-amount sale that bypasses the cart. The modal builds
  // the full payload (single synthetic "Custom amount" line + card/cash fields);
  // this only POSTs it and mirrors handleConfirmOrder's failure safety verbatim.
  async function handleQuickSale(payload) {
    if (!serverOk) return false

    const { ok, recovered } = await saveOrderVisibly(payload, { title: 'Sale not saved' })
    if (!ok) return false

    fetchOrderCount()
    const base = payload.paymentMethod === 'CARD' ? 'Sale complete! Paid by card.' : 'Sale complete! Paid by cash.'
    setSuccessMessage(recovered ? `${base} (saved on retry — charged once)` : base)
    setTimeout(() => setSuccessMessage(''), recovered ? 8000 : 4000)
    return true
  }

  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  // Another POS till window on this device already owns the session — block this
  // one (manager/admin on other devices and other pages are unaffected).
  if (posBlocked) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-6 h-full">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">POS is open in another window</h1>
        <p className="text-sm text-gray-500 max-w-sm mb-6">
          To avoid ringing orders in two places, the till runs in one window at a time on this device.
          Use this window instead, or close it and return to the other.
        </p>
        <button
          onClick={takeOver}
          className="px-6 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          Use the POS here
        </button>
      </div>
    )
  }

  const cartProps = {
    items,
    total,
    onUpdateQty: updateQty,
    onRemove: removeItem,
    onUpdateItem: updateItem,
    onEditCombo: handleEditCombo,
    onOpenAdjustment: () => setAdjustmentOpen(true),
    orderDiscount,
    orderSurchargeAmount,
    orderSurchargeType,
    orderSurchargeValue,
  }

  return (
    <>
      {!serverOk && (
        <div className="bg-red-600 text-white text-sm font-semibold px-4 py-2 text-center">
          Cannot reach POS server — check the shop PC is running.
        </div>
      )}
      {serverOk && !internetOk && (
        <div className="bg-amber-500 text-white text-sm font-semibold px-4 py-2 text-center">
          Internet down — cash only. Card and online orders unavailable.
        </div>
      )}
      {serverOk && fromCache && (
        <div className="bg-amber-50 text-amber-700 text-xs font-medium px-4 py-1.5 text-center border-b border-amber-100">
          Showing the last saved menu — reconnecting…
        </div>
      )}
      {serverOk && enforceTill && (
        <div className="bg-amber-100 text-amber-900 text-sm font-medium px-4 py-2 text-center border-b border-amber-200">
          Till not open — owner must open from Admin → Shift.
        </div>
      )}
    <div className="flex h-full min-h-0 pos-shell">
      {/* Category sidebar */}
      <div className="w-20 md:w-28 flex-shrink-0 min-h-0 overflow-hidden p-2 md:p-3 border-r border-gray-200 bg-gray-50 flex flex-col">
        <CategoryTabs
          categories={categories}
          activeId={activeCategoryId}
          onSelect={setActiveCategoryId}
        />
      </div>

      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-3 md:px-4 pt-3 pb-2 flex items-center gap-2 border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Order count — hide on small screens */}
          {orderCount !== null && (
            <span className="hidden sm:inline text-xs text-gray-400 shrink-0 tabular-nums">
              Orders: {orderCount}
            </span>
          )}

          {/* Reservations */}
          <button
            onClick={() => setReservationsOpen(true)}
            title="View and manage reservations"
            className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
          >
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span className="hidden sm:inline">Reservations</span>
          </button>

          {/* Money In/Out */}
          <button
            onClick={() => setMoneyInOutPinOpen(true)}
            title="Record money in or out of the till"
            className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
          >
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" />
            </svg>
            <span className="hidden sm:inline">In/Out</span>
          </button>

          {/* Quick Sale — custom-amount charge, bypasses the cart */}
          <button
            onClick={() => setQuickSaleOpen(true)}
            disabled={enforceTill}
            title={enforceTill ? 'Till not open' : 'Charge a custom amount without building a cart'}
            className="flex items-center gap-1.5 px-2 md:px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-40"
          >
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect width="16" height="20" x="4" y="2" rx="2" /><path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h8" />
            </svg>
            <span className="hidden sm:inline">Quick Sale</span>
          </button>
        </div>

        {/* Product list — extra bottom padding on mobile for the floating cart bar */}
        <div className="flex-1 px-3 md:px-4 pb-4 overflow-y-auto pt-3" style={{ paddingBottom: itemCount > 0 ? '5rem' : undefined }}>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              Loading menu...
            </div>
          ) : filteredProducts.length === 0 && searchQuery ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              No items found for &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            <MenuGrid products={filteredProducts} onAdd={handleProductSelect} />
          )}
        </div>
      </div>

      {/* Cart — desktop only */}
      <div className="hidden md:flex w-80 flex-shrink-0 border-l border-gray-200 flex-col">
        <Cart
          {...cartProps}
          onClear={clearCart}
          onCheckout={() => setCheckoutOpen(true)}
        />
      </div>

      {/* Mobile floating cart bar */}
      {itemCount > 0 && (
        <div className="md:hidden fixed inset-x-0 z-30 bg-gray-900 text-white px-4 py-3 flex items-center justify-between shadow-lg pos-mobile-cart">
          <div className="flex items-center gap-3">
            <span className="bg-white text-gray-900 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{itemCount}</span>
            <span className="text-sm font-medium">${D(total).toFixed(2)}</span>
          </div>
          <button
            onClick={() => setCartDrawerOpen(true)}
            className="bg-white text-gray-900 px-4 py-1.5 rounded-lg text-sm font-semibold"
          >
            View Cart
          </button>
        </div>
      )}

      {/* Mobile cart drawer */}
      {cartDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
            <h2 className="font-bold text-gray-900">Your Order</h2>
            <button onClick={() => setCartDrawerOpen(false)} className="p-2 text-gray-500 hover:text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Cart
              {...cartProps}
              onClear={() => { clearCart(); setCartDrawerOpen(false) }}
              onCheckout={() => { setCartDrawerOpen(false); setCheckoutOpen(true) }}
            />
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {successMessage}
        </div>
      )}

      {/* Sits above the checkout modals (z-60) so the retry is visible while they're open. */}
      {saveRetry && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-[60] flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Payment taken — saving sale… (try {saveRetry.n} of {saveRetry.max})</span>
        </div>
      )}

      {dialog}

      <ProductOptionsModal
        product={selectedProduct}
        onConfirm={handleOptionsConfirm}
        onClose={() => setSelectedProduct(null)}
      />

      {selectedCombo && (
        <ComboBuilderModal
          key={comboEdit?.cartItemId ?? `new-${selectedCombo.id}`}
          combo={selectedCombo}
          products={products}
          initialSelections={comboEdit?.selections}
          initialNotes={comboEdit?.notes}
          editKey={comboEdit?.cartItemId ?? null}
          onConfirm={handleComboConfirm}
          onClose={closeCombo}
        />
      )}

      <ReservationsModal
        isOpen={reservationsOpen}
        onClose={() => setReservationsOpen(false)}
      />

      <ManagerPinModal
        isOpen={managerPinOpen}
        onClose={() => { setManagerPinOpen(false); router.replace('/pos') }}
        onSuccess={() => { setManagerPinOpen(false); router.push(managerReturnUrl) }}
      />

      <ManagerPinModal
        isOpen={moneyInOutPinOpen}
        onClose={() => setMoneyInOutPinOpen(false)}
        onSuccess={(user) => { setMoneyInOutUser(user); setMoneyInOutPinOpen(false); setMoneyInOutOpen(true) }}
        clockedIn
      />

      <MoneyInOutModal
        isOpen={moneyInOutOpen}
        onClose={() => { setMoneyInOutOpen(false); setMoneyInOutUser(null) }}
        user={moneyInOutUser}
      />

      <SwitchUserModal
        isOpen={switchUserOpen}
        onClose={closeSwitchUser}
        onSuccess={(user) => { setCashier(user); closeSwitchUser() }}
      />

      {adjustmentOpen && (
        <OrderAdjustmentModal
          isOpen={adjustmentOpen}
          onClose={() => setAdjustmentOpen(false)}
          onApply={handleApplyAdjustment}
          subtotal={total}
          initialActiveTab={orderActiveTab}
          initialDiscountType={orderDiscountType}
          initialDiscountValue={orderDiscountValue}
          initialSurchargeType={orderSurchargeType}
          initialSurchargeValue={orderSurchargeValue}
        />
      )}

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        items={items}
        total={total}
        onConfirm={handleConfirmOrder}
        serverOk={serverOk}
        internetOk={internetOk}
        initialManualDiscount={orderDiscountValue}
        initialDiscountType={orderDiscountType}
        initialSurchargeType={orderSurchargeType}
        initialSurchargeValue={orderSurchargeValue}
        initialTableId={searchParams.get('table') ? parseInt(searchParams.get('table')) : null}
        tillOpen={!enforceTill}
      />

      <QuickSaleModal
        isOpen={quickSaleOpen}
        onClose={() => setQuickSaleOpen(false)}
        onConfirm={handleQuickSale}
        serverOk={serverOk}
        internetOk={internetOk}
        tillOpen={!enforceTill}
      />
    </div>
    </>
  )
}

export default function PosPage() {
  return (
    <Suspense>
      <PosPageContent />
    </Suspense>
  )
}
