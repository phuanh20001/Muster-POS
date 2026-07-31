'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { isStaffPath } from '@/lib/staffPaths'

const DEFAULT_LEAD_MINUTES = 120
const ACK_KEY = 'dc_reservation_reminders_ack'

const ReservationsContext = createContext({
  upcomingCount: 0,
  dueReminders: [],
  ackReminder: () => {},
  refresh: () => {},
})

export function useReservations() {
  return useContext(ReservationsContext)
}

function todayString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

// Loud four-note reminder (E5 B5 E6 B5). Louder than the old gentle two-note
// sine so it carries across a busy shop; the provider loops it every 5s while a
// reminder is still unacknowledged.
function playChime() {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  try {
    const now = ctx.currentTime
    const notes = [659, 988, 1319, 988] // E5 B5 E6 B5
    const noteLen = 0.28
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const start = now + i * noteLen
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.6, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteLen)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteLen)
    })
  } catch {
    // audio not available — modal/badge still show
  }
}

function loadAck() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACK_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    const now = Date.now()
    return raw.filter((e) => e && typeof e.id === 'number' && e.exp > now)
  } catch {
    return []
  }
}

function saveAck(list) {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable — reminders just re-pop after reload
  }
}

export function ReservationsProvider({ children }) {
  const pathname = usePathname()
  const active = isStaffPath(pathname)
  const [reservations, setReservations] = useState([])
  const [leadMinutes, setLeadMinutes] = useState(DEFAULT_LEAD_MINUTES)
  const [ack, setAck] = useState([])

  useEffect(() => { setAck(loadAck()) }, [])

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

  const refresh = useCallback(async () => {
    try {
      const [listRes, settingsRes] = await Promise.all([
        fetch(`/api/reservations?date=${todayString()}`, { cache: 'no-store' }),
        fetch('/api/reservation-settings', { cache: 'no-store' }),
      ])
      const data = await listRes.json()
      if (Array.isArray(data)) setReservations(data)
      const settings = await settingsRes.json().catch(() => null)
      setLeadMinutes(Number(settings?.reminderLeadMinutes) > 0 ? Number(settings.reminderLeadMinutes) : DEFAULT_LEAD_MINUTES)
    } catch {
      // transient — keep last state, try again next tick
    }
  }, [])

  useEffect(() => {
    if (!active) {
      setReservations([])
      return
    }
    refresh()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [active, refresh])

  const now = Date.now()
  const upcoming = reservations.filter((r) => r.status === 'CONFIRMED' && new Date(r.scheduledAt).getTime() > now)
  const upcomingCount = upcoming.length
  const ackIds = new Set(ack.map((e) => e.id))
  const leadMs = leadMinutes * 60 * 1000
  const dueReminders = upcoming.filter((r) => {
    if (ackIds.has(r.id)) return false
    const diff = new Date(r.scheduledAt).getTime() - now
    return diff <= leadMs
  })

  const ackReminder = useCallback((reservation) => {
    if (!reservation) return
    const exp = new Date(reservation.scheduledAt).getTime() + 60 * 60 * 1000
    setAck((prev) => {
      const next = [...prev.filter((e) => e.id !== reservation.id), { id: reservation.id, exp }]
      saveAck(next)
      return next
    })
  }, [])

  // Louder reminder chime, looping every 5s while any reminder is unacknowledged.
  useEffect(() => {
    if (!active || dueReminders.length === 0) return
    playChime()
    const id = setInterval(playChime, 5000)
    return () => clearInterval(id)
  }, [active, dueReminders.length > 0])

  return (
    <ReservationsContext.Provider value={{ upcomingCount, dueReminders, ackReminder, refresh }}>
      {children}
    </ReservationsContext.Provider>
  )
}
