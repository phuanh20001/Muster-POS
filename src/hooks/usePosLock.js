'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { randomId } from '@/lib/randomId'

// Ensures only ONE POS till window is active at a time within the same browser
// profile on the same device. Uses BroadcastChannel: a new window asks who's
// active; if an existing active window answers, the new one yields (shows a lock
// screen). "Use here" lets a window forcibly take over. Closing the active window
// frees the slot (no reply within the probe window → the survivor claims active).
//
// Scope is deliberately narrow: this only runs on /pos, so the manager/admin view,
// Tables, Online, and customer pages on other devices are never affected.
const CHANNEL = 'dc-pos-lock'
const PROBE_MS = 400

export function usePosLock() {
  const [state, setState] = useState('active') // 'active' = this window owns the till
  const idRef = useRef(null)
  const chanRef = useRef(null)
  const amActiveRef = useRef(true)

  if (idRef.current === null) {
    idRef.current = randomId()
  }

  function setActive(v) {
    amActiveRef.current = v
    setState(v ? 'active' : 'blocked')
  }

  const takeOver = useCallback(() => {
    const chan = chanRef.current
    if (!chan) return
    chan.postMessage({ type: 'takeover', from: idRef.current })
    setActive(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
    const myId = idRef.current
    const chan = new BroadcastChannel(CHANNEL)
    chanRef.current = chan
    let sawOwner = false

    const send = (type) => chan.postMessage({ type, from: myId })

    chan.onmessage = (e) => {
      const msg = e.data || {}
      if (msg.from === myId) return
      switch (msg.type) {
        case 'who':                                   // new window probing
          if (amActiveRef.current) send('here')       // we own it → answer
          break
        case 'here':                                  // an owner answered our probe
          sawOwner = true
          setActive(false)
          break
        case 'takeover':                              // another window claimed the till
          setActive(false)
          break
      }
    }

    send('who') // probe for an existing owner
    const probe = setTimeout(() => { if (!sawOwner) setActive(true) }, PROBE_MS)

    const onUnload = () => { if (amActiveRef.current) send('bye') }
    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      clearTimeout(probe)
      if (amActiveRef.current) send('bye')
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
      chan.close()
    }
  }, [])

  return { posBlocked: state === 'blocked', takeOver }
}
