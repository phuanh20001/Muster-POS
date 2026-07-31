'use client'

import { useState } from 'react'
import Badge from '@/components/shared/Badge'
import EmptyState from '@/components/shared/EmptyState'
import OrderDetailModal from '@/components/admin/shared/OrderDetailModal'
import { formatCurrency, formatTime, orderTicketLabel } from '@/lib/formatters'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/constants'

export default function OrderHistoryTable({ orders, onOrderUpdated }) {
  const [selectedOrder, setSelectedOrder] = useState(null)

  if (!orders || orders.length === 0) {
    return <EmptyState icon="📋" title="No orders today" />
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Order</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Time</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Staff</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Items</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Total</th>
              <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {orderTicketLabel(order)}
                  {order.dailyNumber != null && (
                    <span className="text-xs font-normal text-gray-400 ml-1.5">id {order.id}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{formatTime(order.createdAt)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{order.user?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {(order.items ?? []).map((i) => `${i.product?.name ?? i.productName} ×${i.quantity}`).join(', ')}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                  {formatCurrency(order.total)}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge className={ORDER_STATUS_COLORS[order.status]}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdated={(updated) => { onOrderUpdated?.(updated); setSelectedOrder(null) }}
          showBrowserPrint
        />
      )}
    </>
  )
}
