'use client'

import { useState } from 'react'
import { formatCurrency, formatTime, orderTicketLabel } from '@/lib/formatters'
import { useOnlineOrders } from '@/contexts/OnlineOrdersContext'

const PREP_PRESETS = [5, 10, 15, 20, 30]

function parsePickupName(note) {
  return note?.match(/Pickup: (.+?) \|/)?.[1] ?? 'Customer'
}

function getWaitingMinutes(createdAt) {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return 0
  return Math.max(0, Math.floor((Date.now() - created) / 60000))
}

export default function OnlinePage() {
  const { orders, refresh } = useOnlineOrders()
  const [busyId, setBusyId] = useState(null)

  async function patchOrder(orderId, body) {
    setBusyId(orderId)
    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const newOrders = orders.filter((o) => o.status === 'PENDING' && o.prepMinutes == null)
  const inProgress = orders.filter((o) => o.status === 'PREPARING' || (o.status === 'PENDING' && o.prepMinutes != null))
  const ready = orders.filter((o) => o.status === 'READY')

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Online Orders</h1>
        <span className="text-xs text-gray-400">Auto-refreshes every 10s</span>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4 lg:gap-6 min-h-0">
        <section className="flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 md:mb-3 shrink-0">
            <span className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 shrink-0 ${newOrders.length > 0 ? 'animate-pulse' : ''}`} />
            <h2 className="text-[10px] md:text-sm font-semibold text-gray-700 uppercase tracking-wide leading-tight">New — Choose Prep Time</h2>
            <span className="text-xs text-gray-400 shrink-0">({newOrders.length})</span>
          </div>
          <div className="space-y-3 md:space-y-4 min-h-0 overflow-y-auto overscroll-y-contain">
            {newOrders.length === 0 && (
              <p className="text-sm text-gray-400 px-1">No new orders.</p>
            )}
            {newOrders.map((o) => (
              <NewOrderCard key={o.id} order={o} busy={busyId === o.id}
                onPrep={(minutes) => patchOrder(o.id, { prepMinutes: minutes })} />
            ))}
          </div>
        </section>

        <section className="flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 md:mb-3 shrink-0">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-orange-400 shrink-0" />
            <h2 className="text-[10px] md:text-sm font-semibold text-gray-700 uppercase tracking-wide leading-tight">In Progress</h2>
            <span className="text-xs text-gray-400 shrink-0">({inProgress.length})</span>
          </div>
          <div className="space-y-3 min-h-0 overflow-y-auto overscroll-y-contain">
            {inProgress.length === 0 && (
              <p className="text-sm text-gray-400 px-1">Nothing in progress.</p>
            )}
            {inProgress.map((o) => (
              <OrderCard key={o.id} order={o} busy={busyId === o.id}
                action={{ label: 'Mark Ready', onClick: () => patchOrder(o.id, { status: 'READY' }) }} />
            ))}
          </div>
        </section>

        <section className="flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 md:mb-3 shrink-0">
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-green-500 shrink-0" />
            <h2 className="text-[10px] md:text-sm font-semibold text-gray-700 uppercase tracking-wide leading-tight">Ready for Pickup</h2>
            <span className="text-xs text-gray-400 shrink-0">({ready.length})</span>
          </div>
          <div className="space-y-3 min-h-0 overflow-y-auto overscroll-y-contain">
            {ready.length === 0 && (
              <p className="text-sm text-gray-400 px-1">Nothing ready.</p>
            )}
            {ready.map((o) => (
              <OrderCard key={o.id} order={o} busy={busyId === o.id} ready
                action={{ label: 'Collected', onClick: () => patchOrder(o.id, { status: 'COMPLETED' }) }} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function OrderItems({ items }) {
  return (
    <div className="space-y-0.5 mb-3">
      {items.map((i) => (
        <div key={i.id} className="flex justify-between text-sm text-gray-700">
          <span>{i.product?.name}{i.size ? ` (${i.size})` : ''} ×{i.quantity}</span>
        </div>
      ))}
    </div>
  )
}

function NewOrderCard({ order, onPrep, busy }) {
  const name = parsePickupName(order.note)
  const waitingMinutes = getWaitingMinutes(order.createdAt)
  const [prepInput, setPrepInput] = useState('')
  const customPrep = parseInt(prepInput)

  return (
    <div className="bg-white rounded-2xl border-2 border-red-200 p-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="font-bold text-gray-900">Order {orderTicketLabel(order)}</span>
          <span className="text-gray-400 text-sm ml-2">{name}</span>
        </div>
        <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
      </div>
      <div className="text-xs text-red-600 font-medium mb-2">Waiting {waitingMinutes} min • New order</div>

      <OrderItems items={order.items} />

      <div className="flex items-center justify-between mb-3">
        <span className="font-mono font-semibold text-gray-900">{formatCurrency(order.total)}</span>
      </div>

      <p className="text-sm font-medium text-gray-700 mb-2">How long to prepare?</p>
      <div className="grid grid-cols-3 gap-2">
        {PREP_PRESETS.map((m) => (
          <button key={m} onClick={() => onPrep(m)} disabled={busy}
            className="py-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-700 hover:border-gray-900 hover:bg-gray-900 hover:text-white transition-colors disabled:opacity-50">
            {m} min
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input type="number" min="1" step="1" placeholder="Custom min"
          value={prepInput}
          onChange={(e) => setPrepInput(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
        <button onClick={() => onPrep(customPrep)} disabled={busy || !(customPrep > 0)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50">
          Set
        </button>
      </div>
    </div>
  )
}

function OrderCard({ order, action, busy, ready }) {
  const name = parsePickupName(order.note)
  const waitingMinutes = getWaitingMinutes(order.createdAt)
  return (
    <div className={`bg-white rounded-2xl border p-4 ${ready ? 'border-green-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="font-bold text-gray-900">Order {orderTicketLabel(order)}</span>
          <span className="text-gray-400 text-sm ml-2">{name}</span>
        </div>
        <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
      </div>

      {order.status === 'PREPARING' && order.prepMinutes != null && (
        <div className="text-xs text-orange-600 font-medium mb-2">Waiting {waitingMinutes} min • Estimated {order.prepMinutes} min</div>
      )}
      {order.status === 'READY' && (
        <div className="text-xs text-green-600 font-medium mb-2">Waiting {waitingMinutes} min • Ready for pickup</div>
      )}

      <OrderItems items={order.items} />

      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-gray-900">{formatCurrency(order.total)}</span>
        <button onClick={action.onClick} disabled={busy}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
            ready ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}>
          {busy ? '…' : action.label}
        </button>
      </div>
    </div>
  )
}
