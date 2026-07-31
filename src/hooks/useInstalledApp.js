'use client'

import { useEffect, useState } from 'react'
import { isInstalledApp } from '@/lib/appShell'

export function useInstalledApp() {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    function sync() {
      setInstalled(isInstalledApp())
    }
    sync()
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return installed
}
