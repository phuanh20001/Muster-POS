'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { isStaffPath } from '@/lib/staffPaths'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'

const FeatureSettingsContext = createContext({ settings: null, apply: () => {} })

export function useFeatureSettings() {
  return useContext(FeatureSettingsContext)
}

export function FeatureSettingsProvider({ children }) {
  const pathname = usePathname()
  const active = isStaffPath(pathname)
  // null = not loaded yet. Consumers must treat that as "unknown", not defaults.
  const [settings, setSettings] = useState(null)
  const abortRef = useRef(null)

  const refresh = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch('/api/feature-settings', { cache: 'no-store', signal: controller.signal })
      // The route's 500 body is valid JSON, so without this it would parse as settings.
      if (!res.ok) throw new Error(`feature-settings ${res.status}`)
      setSettings(await res.json())
    } catch {
      // Keep the last-known flags on any failure — never guess a mode. The next
      // visible poll tick retries, so a boot hiccup self-heals without a flip.
    }
  }, [])

  // Poll while a staff tab is visible so a flag flipped on another tablet reaches
  // this one within a tick (settings are low-churn, so 30s is plenty). The hook is
  // visibility-gated, so backgrounded tabs stop hitting the server; customer/login
  // paths never fetch at all (active === false).
  usePollWhenVisible(() => { if (active) refresh() }, 30000)

  // A local PATCH already returns the fresh flags — push them to every consumer
  // without another round trip, and abort any in-flight GET so a slower stale
  // response can't land afterwards and revert the change.
  const apply = useCallback((data) => {
    if (!data) return
    abortRef.current?.abort()
    setSettings(data)
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const value = useMemo(() => ({ settings, apply }), [settings, apply])

  return (
    <FeatureSettingsContext.Provider value={value}>
      {children}
    </FeatureSettingsContext.Provider>
  )
}
