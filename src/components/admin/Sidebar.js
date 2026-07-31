'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

// Reusable panel sidebar. The Manager and Admin panels each pass their own
// `links` + `heading` — the Manager panel never sees the Admin (Owner) links and
// vice-versa, so Owner pages stay out of the Manager panel entirely.
export default function Sidebar({ links, heading = 'Management', onNavigate }) {
  const pathname = usePathname()
  const [stockAlertCount, setStockAlertCount] = useState(0)

  const hasStockLink = links.some((l) => l.href === '/admin/stock')

  useEffect(() => {
    if (!hasStockLink) return
    fetch('/api/stock?alerts=1')
      .then((r) => r.json())
      .then((d) => setStockAlertCount(Array.isArray(d) ? d.length : 0))
      .catch(() => {})
  }, [pathname, hasStockLink])

  function renderLink(link) {
    const isStock = link.href === '/admin/stock'
    const showAlert = isStock && stockAlertCount > 0
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        aria-label={`${link.label}${showAlert ? ` (${stockAlertCount} low stock alert${stockAlertCount !== 1 ? 's' : ''})` : ''}`}
        className={`relative flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          pathname.startsWith(link.href)
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        {link.label}
        {showAlert && (
          <span className="ml-auto w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
        )}
      </Link>
    )
  }

  return (
    <aside className="w-48 bg-white border-r border-gray-200 p-4 flex-shrink-0">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{heading}</div>
      <nav className="space-y-1">
        {links.map(renderLink)}
      </nav>
    </aside>
  )
}
