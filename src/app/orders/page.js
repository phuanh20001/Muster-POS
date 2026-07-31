'use client'

import { useState, useEffect } from 'react'
import OrderHistoryTable from '@/components/admin/reports/OrderHistoryTable'
import { formatDateForApi } from '@/lib/formatters'

export default function OrdersPage() {
  const [date, setDate] = useState(formatDateForApi(new Date()))
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/orders?date=${date}`)
    setOrders(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [date])

  function handleOrderUpdated(updated) {
    // Merge so partial responses (e.g. refund returns only status/refundNote)
    // don't drop the loaded relations like items/user.
    setOrders((prev) => prev.map((o) => o.id === updated.id ? { ...o, ...updated } : o))
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Order History</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>
      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <OrderHistoryTable orders={orders} onOrderUpdated={handleOrderUpdated} />
      )}
    </div>
  )
}
