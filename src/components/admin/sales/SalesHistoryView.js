'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, orderTicketLabel } from '@/lib/formatters'
import { sum } from '@/lib/money'
import { statusBadgeClass, ORDER_STATUS_LABELS } from '@/lib/constants'
import { getClientDateRange } from '@/lib/clientDateRange'
import OrderDetailModal from '@/components/admin/shared/OrderDetailModal'

export default function SalesHistoryView() {
  const [quickFilter, setQuickFilter] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()

    if (quickFilter !== 'custom') {
      const range = getClientDateRange(quickFilter)
      if (range) { params.set('from', range.from); params.set('to', range.to) }
    } else {
      if (customFrom) params.set('from', customFrom)
      if (customTo) params.set('to', customTo)
    }
    if (search.trim()) params.set('search', search.trim())
    if (statusFilter) params.set('status', statusFilter)
    params.set('limit', '100')

    const res = await fetch(`/api/sales?${params}`)
    const data = await res.json()
    setOrders(Array.isArray(data.orders) ? data.orders : [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [quickFilter, customFrom, customTo, search, statusFilter])

  useEffect(() => {
    fetchSales()
  }, [fetchSales])

  const totalRevenue = sum(
    orders.filter((o) => o.status !== 'AWAITING_PAYMENT' && o.status !== 'CANCELLED'),
    (o) => o.total,
  )

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sales History</h1>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'today', label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: '7days', label: 'Past 7 Days' },
              { key: 'custom', label: 'Custom' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setQuickFilter(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  quickFilter === key ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {quickFilter === 'custom' && (
            <div className="flex gap-3 items-center flex-wrap">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">From</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search ticket #, id or CASH / CARD..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">All Statuses</option>
              {['PENDING','PREPARING','READY','COMPLETED','CANCELLED','REFUNDED'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
          <span>{total} order{total !== 1 ? 's' : ''} found</span>
          <span className="font-semibold text-gray-700">Total: {formatCurrency(totalRevenue)}</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">No orders found</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Date/Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Staff</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Items</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Total</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Payment</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => {
                    const time = new Date(order.createdAt).toLocaleString('en-AU', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })
                    const itemsSummary = order.items?.map((i) => `${i.product?.name ?? i.productName} ×${i.quantity}`).join(', ') ?? ''
                    return (
                      <tr key={order.id} onClick={() => setSelectedOrder(order)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors">
                        <td className="px-4 py-3 font-mono text-gray-900 whitespace-nowrap">
                          {orderTicketLabel(order)}
                          {order.dailyNumber != null && (
                            <span className="block text-xs text-gray-400">id {order.id}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{time}</td>
                        <td className="px-4 py-3 text-gray-600">{order.user?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{itemsSummary}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(order.total)}</td>
                        <td className="px-4 py-3 text-gray-600">{order.paymentMethod}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadgeClass(order.status)}`}>
                            {ORDER_STATUS_LABELS[order.status] ?? order.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o))
            setSelectedOrder((prev) => ({ ...prev, ...updated }))
          }}
        />
      )}
    </div>
  )
}
