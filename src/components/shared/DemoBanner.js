'use client'

import { useState } from 'react'

// Portfolio-demo only: a dismissible corner pill shown when NEXT_PUBLIC_DEMO is
// set, so a recruiter clicking around knows it's a live demo and how to log in.
// Fixed-positioned so it never disturbs the app's fixed-height flex shell.
export default function DemoBanner() {
  const [open, setOpen] = useState(false)
  if (process.env.NEXT_PUBLIC_DEMO !== 'true') return null

  return (
    <div className="fixed bottom-3 right-3 z-[9999] text-xs">
      {open ? (
        <div className="w-64 rounded-xl bg-gray-900 text-gray-100 shadow-2xl ring-1 ring-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Live demo</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close">✕</button>
          </div>
          <p className="text-gray-300 leading-snug">
            A portfolio demo of a full coffee-shop POS. Data resets nightly. Card
            payments and printing are disabled (no hardware in the cloud); use the
            cash checkout to see the full flow.
          </p>
          <div className="rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-5">
            <div>Staff PIN <span className="text-white font-semibold">1111</span></div>
            <div>Manager PIN <span className="text-white font-semibold">1234</span></div>
            <div>Owner/Admin PIN <span className="text-white font-semibold">0000</span></div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-gray-900 text-white font-semibold px-3 py-1.5 shadow-lg ring-1 ring-white/10 hover:bg-gray-800"
        >
          Live demo · how to log in
        </button>
      )}
    </div>
  )
}
