'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import SalesHistoryView from '@/components/admin/sales/SalesHistoryView'
import OnlineOrdersView from '@/components/admin/online/OnlineOrdersView'

const TABS = [
  { key: 'history', label: 'History' },
  { key: 'online', label: 'Online Orders' },
]

function SalesTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const requested = searchParams.get('tab')
  const initial = TABS.some((t) => t.key === requested) ? requested : 'history'
  const [tab, setTab] = useState(initial)

  useEffect(() => {
    if (requested === 'reports') router.replace('/admin/reports')
  }, [requested, router])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && <SalesHistoryView />}
      {tab === 'online' && <OnlineOrdersView />}
    </div>
  )
}

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">Loading…</div>}>
      <SalesTabs />
    </Suspense>
  )
}
