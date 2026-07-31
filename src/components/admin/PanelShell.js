'use client'

import { useState } from 'react'
import Sidebar from '@/components/admin/Sidebar'

export default function PanelShell({ ready, links, heading, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 relative">
      {ready && (
        <div className="hidden md:block">
          <Sidebar links={links} heading={heading} onNavigate={() => {}} />
        </div>
      )}

      {ready && sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-52 bg-white h-full shadow-xl">
            <Sidebar links={links} heading={heading} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-w-0">
        {ready && (
          <>
            <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white sticky top-0 z-20">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-700">{heading}</span>
            </div>
            {children}
          </>
        )}
      </div>
    </div>
  )
}
