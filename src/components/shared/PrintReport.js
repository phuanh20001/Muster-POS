'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BRAND_NAME } from '@/lib/brand'

export default function PrintReport({ title, range, orientation = 'portrait', printedAt, children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const generated = (printedAt || new Date()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return createPortal(
    <div className={`print-report ${orientation}`}>
      <div className="pr-head">
        <div className="pr-brand">{BRAND_NAME}<small>{title}</small></div>
        <div className="pr-meta">
          {range && <div className="pr-range">{range}</div>}
          <div>Generated {generated}</div>
        </div>
      </div>
      {children}
    </div>,
    document.body,
  )
}
