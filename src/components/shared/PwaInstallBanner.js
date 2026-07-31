'use client'

import { useEffect, useState } from 'react'
import { useInstalledApp } from '@/hooks/useInstalledApp'
import { BRAND_NAME } from '@/lib/brand'

const DISMISS_KEY = 'dc_pwa_install_dismiss'

function installHint() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) {
    return 'Install: tap Share, then Add to Home Screen for a fullscreen till app.'
  }
  if (/Android/i.test(ua)) {
    return 'Install: open the browser menu and tap Install app or Add to Home screen.'
  }
  return `Install: use Install ${BRAND_NAME} in the browser menu (Chrome or Edge) for a fullscreen till.`
}

export default function PwaInstallBanner() {
  const installed = useInstalledApp()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  if (installed || dismissed) return null

  const hint = installHint()
  if (!hint) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="shrink-0 bg-gray-900 text-gray-200 text-xs px-4 py-2 flex items-center gap-3 border-b border-gray-800">
      <span className="flex-1 leading-snug">{hint}</span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        Dismiss
      </button>
    </div>
  )
}
