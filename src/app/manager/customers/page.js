'use client'

import { useState, useEffect } from 'react'

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Search server-side (debounced) so any customer is findable even though the
  // list is capped for payload size — the client no longer holds every customer.
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''
      fetch(`/api/customers${qs}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => {
          setCustomers(Array.isArray(d?.customers) ? d.customers : [])
          if (typeof d?.total === 'number') setTotal(d.total)
          setLoading(false)
        })
        .catch(() => {})
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [search])

  const filtered = customers

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Loyalty Customers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Buy 9 coffees, get the 10th free</p>
        </div>
        <span className="text-sm text-gray-400">{total} registered</span>
      </div>

      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input type="text" placeholder="Search by name or phone..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-30">☕</div>
          <p className="text-gray-400 text-sm">{search ? 'No customers match your search' : 'No customers registered yet'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs text-gray-500">
                <th className="text-left px-4 py-3 font-semibold">Customer</th>
                <th className="text-left px-4 py-3 font-semibold">Phone</th>
                <th className="text-center px-4 py-3 font-semibold">Stamps</th>
                <th className="text-center px-4 py-3 font-semibold">Free Available</th>
                <th className="text-right px-4 py-3 font-semibold">Total Redeemed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => {
                const progress = c.stampsCollected % 9
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <span key={i} className={`text-xs ${i < progress ? 'text-amber-500' : 'text-gray-200'}`}>
                            {i < progress ? '☕' : '○'}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400 ml-1">{progress}/9</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.freeItems > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          {c.freeItems} free
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{c.stampsRedeemed}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
