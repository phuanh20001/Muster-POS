'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'

export function usePosConnectivity() {
  const [serverOk, setServerOk] = useState(true)
  const [internetOk, setInternetOk] = useState(true)

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const data = await res.json()
      setServerOk(res.ok && data.ok === true && data.db === true)
      setInternetOk(data.internet === true)
    } catch {
      setServerOk(false)
      setInternetOk(false)
    }
  }, [])

  usePollWhenVisible(check, 30000)

  useEffect(() => {
    const onChange = () => { check() }
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('offline', onChange)
    }
  }, [check])

  return { serverOk, internetOk }
}
