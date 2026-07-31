'use client'

import { useEffect } from 'react'

// Registers the POS service worker on staff/LAN pages only (mounted from
// ConditionalNavBar, which is absent on customer pages). When a new SW version
// activates after a deploy, reload once so the tablet picks up fresh app code.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (typeof window !== 'undefined' && window.__DREAMYCAFE_DESKTOP__) return
    if (navigator.userAgent.includes('Electron')) return

    const hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    function onControllerChange() {
      if (!hadController || reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return null
}
