'use client'

import { useState, useEffect, useContext } from 'react'
import { ManagerSessionContext } from '@/app/manager/layout'
import { ORDER_STATUS_LABELS, statusBadgeClass } from '@/lib/constants'
import { formatCurrency, orderTicketLabel } from '@/lib/formatters'
import { D, sum } from '@/lib/money'

const ALL_STATUSES = ['AWAITING_PAYMENT', 'PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']

function toLocalDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parsePickupInfo(note) {
  const match = note?.match(/Pickup: (.+?) \| (.+)/)
  if (!match) return { name: '—', phone: '—' }
  return { name: match[1], phone: match[2] }
}

export default function OnlineOrdersView() {
  const session = useContext(ManagerSessionContext)
  const [date, setDate] = useState(toLocalDateString(new Date()))
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/orders?source=ONLINE&date=${date}`)
      .then((r) => r.json())
      .then((data) => { setOrders(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [date])

  const activeOrders = orders.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.status))
  const completedOrders = orders.filter((o) => o.status === 'COMPLETED')
  const revenue = sum(completedOrders, (o) => o.total)
  const avgValue = completedOrders.length ? revenue.div(completedOrders.length) : D(0)

  const statusCounts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = orders.filter((o) => o.status === s).length
    return acc
  }, {})

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Online Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pickup orders placed through the online menu</p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
          />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Orders" value={orders.length} />
          <SummaryCard label="Completed Revenue" value={formatCurrency(revenue)} />
          <SummaryCard label="Avg Order Value" value={completedOrders.length ? formatCurrency(avgValue) : '—'} />
          <SummaryCard label="Active Now" value={activeOrders.length} highlight={activeOrders.length > 0} />
        </div>

        {/* Status breakdown */}
        {orders.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status Breakdown</div>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((s) => statusCounts[s] > 0 && (
                <span key={s} className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(s)}`}>
                  {ORDER_STATUS_LABELS[s]} — {statusCounts[s]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Orders table */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-900">
              {loading ? 'Loading…' : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">No online orders for this date.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-5 py-3 text-left font-semibold">Order</th>
                  <th className="px-5 py-3 text-left font-semibold">Time</th>
                  <th className="px-5 py-3 text-left font-semibold">Customer</th>
                  <th className="px-5 py-3 text-left font-semibold">Items</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => {
                  const { name, phone } = parsePickupInfo(order.note)
                  const time = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-900">{orderTicketLabel(order)}</td>
                      <td className="px-5 py-3.5 text-gray-500">{time}</td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-gray-800">{name}</div>
                        <div className="text-xs text-gray-400">{phone}</div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {order.items.map((item) => `${item.product?.name ?? item.productName} ×${item.quantity}`).join(', ')}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-900">{formatCurrency(order.total)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(order.status)}`}>
                          {ORDER_STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${highlight ? 'text-blue-500' : 'text-gray-400'}`}>{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
