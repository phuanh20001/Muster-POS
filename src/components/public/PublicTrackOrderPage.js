'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import TrackLoyaltyCard from '@/components/public/TrackLoyaltyCard'
import ProductThumb from '@/components/shared/ProductThumb'
import { D } from '@/lib/money'
import { orderTicketLabel } from '@/lib/formatters'
import { BRAND_NAME } from '@/lib/brand'

const STEPS = [
  { status: 'PENDING', label: 'Order received', icon: '✅' },
  { status: 'PREPARING', label: 'Preparing your order', icon: '👨‍🍳' },
  { status: 'READY', label: 'Ready for pickup!', icon: '🎉' },
  { status: 'COMPLETED', label: 'Enjoy!', icon: '☕' },
]

const STATUS_INDEX = {
  AWAITING_PAYMENT: -1,
  PENDING: 0,
  PREPARING: 1,
  READY: 2,
  COMPLETED: 3,
}

export default function PublicTrackOrderPage({ basePath }) {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const intervalRef = useRef(null)

  async function fetchOrder() {
    try {
      const res = await fetch(`/api/orders/track/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const data = await res.json()
      setOrder(data)
      try {
        if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
          if (localStorage.getItem('dc_last_order') === id) localStorage.removeItem('dc_last_order')
        } else {
          localStorage.setItem('dc_last_order', id)
        }
      } catch {}
      if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
        clearInterval(intervalRef.current)
      }
    } catch {
      // keep polling
    }
  }

  useEffect(() => {
    fetchOrder()
    intervalRef.current = setInterval(fetchOrder, 10000)
    return () => clearInterval(intervalRef.current)
  }, [id])

  if (notFound) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-10 shadow-sm text-center max-w-sm w-full">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Order not found</h1>
          <p className="text-gray-500 text-sm">This order doesn&apos;t exist or may have been removed.</p>
          <a href={basePath} className="mt-6 inline-block text-sm text-gray-500 underline">Place a new order</a>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading your order…</div>
      </div>
    )
  }

  if (order.status === 'CANCELLED') {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-10 shadow-sm text-center max-w-sm w-full">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Order cancelled</h1>
          <p className="text-gray-500 text-sm">Your order {orderTicketLabel(order)} has been cancelled. Please contact the cafe for assistance.</p>
          <a href={basePath} className="mt-6 inline-block text-sm text-gray-500 underline">Place a new order</a>
        </div>
      </div>
    )
  }

  const currentIndex = STATUS_INDEX[order.status] ?? 0
  const isReady = order.status === 'READY'
  const isCompleted = order.status === 'COMPLETED'
  const pickupName = order.pickupName ?? ''

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className={`px-4 py-5 text-white transition-colors ${isReady ? 'bg-green-600' : 'bg-gray-950'}`}>
        <div className="max-w-sm mx-auto text-center">
          <div className="font-bold text-base tracking-tight opacity-75 mb-1">{BRAND_NAME}</div>
          <div className="text-3xl font-black">Order {orderTicketLabel(order)}</div>
          {pickupName && <div className="text-sm opacity-75 mt-1">for {pickupName}</div>}
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 py-6 space-y-6">
        {isReady && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <div className="font-bold text-green-800 text-lg">Your order is ready!</div>
            <div className="text-green-700 text-sm mt-1">Please come to the counter to collect your order.</div>
          </div>
        )}

        {isCompleted && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">☕</div>
            <div className="font-bold text-gray-800 text-lg">Enjoy your order!</div>
            <div className="text-gray-500 text-sm mt-1">Thanks for ordering with {BRAND_NAME}.</div>
          </div>
        )}

        {order.prepMinutes != null && !isReady && !isCompleted && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
            <div className="text-sm text-blue-800">
              Estimated prep time: <span className="font-bold">{order.prepMinutes} min</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Order status</div>
          <div className="space-y-4">
            {STEPS.map((step, idx) => {
              const done = idx <= currentIndex
              const active = idx === currentIndex
              return (
                <div key={step.status} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm transition-all ${
                    done ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {done ? step.icon : <span className="text-xs">{idx + 1}</span>}
                  </div>
                  <div className={`text-sm font-medium transition-all ${active ? 'text-gray-900' : done ? 'text-gray-600' : 'text-gray-400'}`}>
                    {step.label}
                    {active && !isReady && !isCompleted && (
                      <span className="ml-2 inline-flex gap-0.5">
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <TrackLoyaltyCard loyalty={order.loyalty} />

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Items ordered</div>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-700">
                <span className="flex items-start gap-2 min-w-0">
                  <ProductThumb
                    product={item.product}
                    emojiClassName="text-base shrink-0"
                    imgClassName="w-6 h-6 rounded object-cover shrink-0"
                  />
                  <span className="min-w-0">
                    {item.product?.name ?? item.productName}
                    {item.size && <span className="text-gray-400 ml-1">({item.size})</span>}
                    {item.notes && <span className="block text-xs text-gray-400 italic">{item.notes}</span>}
                  </span>
                </span>
                <span className="font-semibold shrink-0 ml-4">×{item.quantity}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between text-sm font-bold text-gray-900">
            <span>Total paid</span>
            <span>${D(order.total).toFixed(2)}</span>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400">
          {!isCompleted && !isReady && 'This page updates automatically every 10 seconds.'}
          <br />
          <a href={basePath} className="underline mt-1 inline-block">Order something else</a>
        </div>
      </div>
    </div>
  )
}
