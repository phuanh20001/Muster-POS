'use client'

import { useEffect } from 'react'
import { isInstalledApp } from '@/lib/appShell'

export default function AppShellBody() {
  useEffect(() => {
    function sync() {
      document.body.classList.toggle('installed-app', isInstalledApp())
    }
    sync()
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return null
}
