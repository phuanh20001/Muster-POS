'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const SANDBOX_DEVICE_ID = '9fa747a2-25ff-48ee-b078-04381f7c828f'

function formatExpiry(pairBy) {
  if (!pairBy) return null
  const ms = new Date(pairBy).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
}

export default function SquarePairingPanel({ onPaired, onUseSandboxId }) {
  const [pairing, setPairing] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [expiryLabel, setExpiryLabel] = useState('')
  const pollRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  useEffect(() => {
    if (!pairing?.pairBy || pairing.status === 'PAIRED') return undefined
    const tick = () => setExpiryLabel(formatExpiry(pairing.pairBy))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [pairing])

  async function startPairing() {
    setStarting(true)
    setError('')
    stopPolling()
    setPairing(null)

    const res = await fetch('/api/terminal/square-pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not create pairing code')
      setStarting(false)
      return
    }

    setPairing(data)
    setStarting(false)

    pollRef.current = setInterval(async () => {
      const sres = await fetch(`/api/terminal/square-pair?id=${encodeURIComponent(data.id)}`)
      const sdata = await sres.json()
      if (!sres.ok) {
        setError(sdata.error ?? 'Could not check pairing status')
        stopPolling()
        return
      }
      setPairing(sdata)
      if (sdata.status === 'PAIRED' && sdata.deviceId) {
        stopPolling()
        onPaired?.(sdata.deviceId)
      } else if (sdata.status === 'EXPIRED') {
        stopPolling()
        setError('Pairing code expired — generate a new one and try again.')
      }
    }, 2000)
  }

  function cancelPairing() {
    stopPolling()
    setPairing(null)
    setError('')
  }

  if (pairing?.status === 'PAIRED' && pairing.deviceId) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
        <p className="text-sm font-semibold text-green-800">Square Terminal paired</p>
        <p className="text-xs text-green-700 font-mono break-all">{pairing.deviceId}</p>
        <p className="text-xs text-green-600">Device ID filled in below — save the reader, then run a test charge.</p>
        <button type="button" onClick={() => { setPairing(null); setError('') }}
          className="text-xs font-semibold text-green-800 underline">
          Pair another device
        </button>
      </div>
    )
  }

  if (pairing?.code) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enter on Square Terminal</p>
          <p className="text-4xl font-bold tracking-[0.35em] text-gray-900 text-center py-2">{pairing.code}</p>
          {expiryLabel && expiryLabel !== 'expired' && (
            <p className="text-xs text-center text-gray-500">Expires in {expiryLabel}</p>
          )}
        </div>
        <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
          <li>On the Terminal sign-in screen, tap <strong>Device code</strong></li>
          <li>Enter the code above (about 5 minutes to complete)</li>
          <li>Wait here — pairing completes automatically</li>
        </ol>
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        <button type="button" onClick={cancelPairing}
          className="text-xs font-semibold text-gray-600 hover:text-gray-900">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-4 space-y-3">
      <p className="text-xs text-gray-500">
        Pair a Square Terminal or Handheld for Terminal API checkout. The device must be on Wi‑Fi and at the location in <span className="font-mono">SQUARE_LOCATION_ID</span>.
      </p>
      {error && (
        <div className="space-y-2">
          <p className="text-xs text-red-600 font-medium">{error}</p>
          {/sandbox/i.test(error) && (
            <button type="button" onClick={() => onUseSandboxId?.(SANDBOX_DEVICE_ID)}
              className="text-xs font-semibold text-gray-700 underline">
              Use sandbox test device id instead
            </button>
          )}
        </div>
      )}
      <button type="button" onClick={startPairing} disabled={starting}
        className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
        {starting ? 'Generating code…' : 'Pair Square Terminal'}
      </button>
    </div>
  )
}
