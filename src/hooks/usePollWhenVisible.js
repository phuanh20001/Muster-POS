'use client'

import { useEffect, useRef } from 'react'

export function usePollWhenVisible(callback, intervalMs) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    let id = null

    function tick() {
      cbRef.current()
    }

    function start() {
      tick()
      id = setInterval(tick, intervalMs)
    }

    function stop() {
      if (id) clearInterval(id)
      id = null
    }

    function onVisibility() {
      if (document.hidden) stop()
      else start()
    }

    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])
}
