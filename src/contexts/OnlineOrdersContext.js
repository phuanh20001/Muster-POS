'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { isStaffPath } from '@/lib/staffPaths'
import { usePollWhenVisible } from '@/hooks/usePollWhenVisible'

const OnlineOrdersContext = createContext({
  orders: [],
  newCount: 0,
  inProgressCount: 0,
  readyCount: 0,
  refresh: () => {},
})

export function useOnlineOrders() {
  return useContext(OnlineOrdersContext)
}

function todayString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// One shared AudioContext, reused for every chime. Browsers start it suspended
// until a user gesture, so we keep a single instance and resume it on the first
// tap/keypress. Creating a fresh context per beep is unreliable — later ones
// stay suspended or get capped.
let sharedCtx = null
function getAudioCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    if (!sharedCtx) sharedCtx = new Ctx()
    return sharedCtx
  } catch {
    return null
  }
}

// Loud rising chime (G5 B5 D6 G6, then a high accent). Repeats are driven by the
// provider's interval while a new order is still unacknowledged.
function playChime() {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  try {
    const now = ctx.currentTime
    const notes = [784, 988, 1175, 1568, 1568] // G5 B5 D6 G6 G6
    const noteLen = 0.2
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      const start = now + i * noteLen
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteLen)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteLen)
    })
  } catch {
    // audio not available — badge still shows
  }
}

export function OnlineOrdersProvider({ children }) {
  const pathname = usePathname()
  const active = isStaffPath(pathname)
  const [orders, setOrders] = useState([])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?source=ONLINE&status=PENDING,PREPARING,READY&date=${todayString()}`)
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch {
      // transient — keep last state, try again next tick
    }
  }, [])

  // Unlock audio on the first user gesture so chimes are audible immediately
  // when an order later arrives (autoplay policy keeps the context suspended
  // until then).
  useEffect(() => {
    function unlock() {
      const ctx = getAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (!active) setOrders([])
  }, [active])

  usePollWhenVisible(() => { if (active) refresh() }, pathname === '/online' ? 10000 : 20000)

  const newCount = orders.filter((o) => o.status === 'PENDING' && o.prepMinutes == null).length
  const inProgressCount = orders.filter((o) => o.status === 'PREPARING' || (o.status === 'PENDING' && o.prepMinutes != null)).length
  const readyCount = orders.filter((o) => o.status === 'READY').length

  const value = useMemo(
    () => ({ orders, newCount, inProgressCount, readyCount, refresh }),
    [orders, newCount, inProgressCount, readyCount, refresh]
  )

  // Chime immediately when a new order appears, then re-chime every 5s while any
  // new order is still unacknowledged, so a busy/loud shop doesn't miss it.
  useEffect(() => {
    if (!active || newCount === 0) return
    playChime()
    const id = setInterval(playChime, 5000)
    return () => clearInterval(id)
  }, [active, newCount > 0])

  return (
    <OnlineOrdersContext.Provider value={value}>
      {children}
    </OnlineOrdersContext.Provider>
  )
}
