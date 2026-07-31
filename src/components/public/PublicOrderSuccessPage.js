'use client'

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SuccessContent({ basePath }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('checkoutRef') || searchParams.get('session_id')
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!sessionId) {
      router.replace(basePath)
      return
    }

    async function checkOrder() {
      try {
        const res = await fetch(`/api/orders/online?checkoutRef=${encodeURIComponent(sessionId)}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status && data.status !== 'AWAITING_PAYMENT') {
          clearInterval(intervalRef.current)
          router.replace(`${basePath}/track/${data.trackingToken}`)
        }
      } catch {
        // keep polling
      }
    }

    checkOrder()
    intervalRef.current = setInterval(checkOrder, 3000)
    return () => clearInterval(intervalRef.current)
  }, [sessionId, router, basePath])

  return (
    <div className="h-full overflow-y-auto bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-3xl p-10 shadow-sm text-center max-w-sm w-full">
        <div className="text-5xl mb-6 animate-pulse">☕</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment received!</h1>
        <p className="text-gray-500 text-sm mb-6">We&apos;re confirming your order with the cafe…</p>
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Setting up your order…
        </div>
      </div>
    </div>
  )
}

export default function PublicOrderSuccessPage({ basePath }) {
  return (
    <Suspense fallback={
      <div className="h-full overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    }>
      <SuccessContent basePath={basePath} />
    </Suspense>
  )
}
