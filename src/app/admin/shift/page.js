'use client'

import { useState, useEffect, useContext } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCurrency, formatTime } from '@/lib/formatters'
import { D, gte, lte } from '@/lib/money'
import DenomCounter, { denomTotal } from '@/components/manager/DenomCounter'
import StockCountStep from '@/components/manager/StockCountStep'
import { AdminSessionContext } from '@/app/admin/layout'

const OPEN_STEPS = [
  { id: 'float', title: 'Count opening float' },
  { id: 'done', title: 'Ready to trade' },
]

const CLOSE_STEPS = [
  { id: 'reading', title: 'Till reading' },
  { id: 'count', title: 'Count drawer' },
  { id: 'stock', title: 'Stock count' },
  { id: 'close', title: 'Close till' },
  { id: 'done', title: 'Shift closed' },
]

function StepBar({ steps, current }) {
  const idx = steps.findIndex((s) => s.id === current)
  return (
    <div className="flex gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex-1">
          <div className={`h-1 rounded-full ${i <= idx ? 'bg-gray-900' : 'bg-gray-200'}`} />
          <p className={`text-[10px] mt-1 truncate ${i === idx ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
            {s.title}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function ShiftPage() {
  const user = useContext(AdminSessionContext)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [shiftRoutineEnabled, setShiftRoutineEnabled] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [toggleSaving, setToggleSaving] = useState(false)
  const [toggleMsg, setToggleMsg] = useState('')
  const [session, setSession] = useState(undefined)
  const [mode, setMode] = useState(null)
  const [openStep, setOpenStep] = useState('float')
  const [closeStep, setCloseStep] = useState('reading')
  const [denoms, setDenoms] = useState({})
  const [closeNote, setCloseNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const countedTotal = denomTotal(denoms)
  const hasCounted = Object.values(denoms).some((v) => v && parseFloat(v) > 0)
  const variance = session && hasCounted ? D(countedTotal).minus(session.expectedCash ?? 0) : null
  const varianceOk = variance !== null && lte(variance.abs(), 2)

  async function loadSettings() {
    const res = await fetch('/api/shift-settings').then((r) => r.json()).catch(() => null)
    if (res && typeof res.shiftRoutineEnabled === 'boolean') {
      setShiftRoutineEnabled(res.shiftRoutineEnabled)
    }
    setSettingsLoading(false)
  }

  async function load() {
    const sessionRes = await fetch('/api/cash').then((r) => r.json())
    setSession(sessionRes)
  }

  useEffect(() => {
    loadSettings()
    load()
  }, [])

  useEffect(() => {
    if (session === undefined || !shiftRoutineEnabled) return
    if (searchParams.get('open') === '1' && !session) setMode('open')
    if (searchParams.get('close') === '1' && session) setMode('close')
  }, [searchParams, session, shiftRoutineEnabled])

  async function handleToggle(enabled) {
    if (enabled === shiftRoutineEnabled || toggleSaving) return
    setToggleSaving(true)
    setToggleMsg('')
    const res = await fetch('/api/shift-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftRoutineEnabled: enabled }),
    })
    setToggleSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setToggleMsg(d.error ?? 'Failed to update setting')
      return
    }
    const data = await res.json()
    setShiftRoutineEnabled(data.shiftRoutineEnabled)
    if (!data.shiftRoutineEnabled) {
      setMode(null)
      setOpenStep('float')
      setCloseStep('reading')
    }
    setToggleMsg(data.shiftRoutineEnabled ? 'Routine enabled' : 'Routine disabled')
    setTimeout(() => setToggleMsg(''), 3000)
  }

  async function handleOpenTill() {
    if (!hasCounted) return setError('Count the opening float first')
    setSaving(true)
    setError('')
    const res = await fetch('/api/cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingFloat: countedTotal, openedById: user?.id }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      return setError(d.error ?? 'Failed to open till')
    }
    setDenoms({})
    setOpenStep('done')
    await load()
  }

  async function handlePrintZReport(sessionId) {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/cash/${sessionId}/z-report`, { method: 'POST' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to print till reading')
      return false
    }
    return true
  }

  async function handleCloseTill() {
    if (!hasCounted) return setError('Count the drawer first')
    setSaving(true)
    setError('')
    const res = await fetch(`/api/cash/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingCash: countedTotal, closedById: user?.id, note: closeNote }),
    })
    if (!res.ok) {
      const d = await res.json()
      setSaving(false)
      return setError(d.error ?? 'Failed to close till')
    }
    const updated = await res.json()
    await handlePrintZReport(updated.id)
    setSaving(false)
    setDenoms({})
    setCloseNote('')
    setCloseStep('done')
    await load()
  }

  if (session === undefined || settingsLoading) {
    return <div className="p-6 text-gray-400 text-sm">Loading…</div>
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routine</h1>
          <p className="text-sm text-gray-500 mt-1">
            Opening and closing checklists for till and stock.
          </p>
        </div>
        <Link href="/manager/cash" className="text-sm font-semibold text-gray-500 hover:text-gray-900 shrink-0">
          Cash details →
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🕐</span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Routine</h2>
            <p className="text-sm text-gray-400">
              When on, the till must be opened and closed here. When off, cash sales work without a till session.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {[[true, 'On', 'Require open/close checklists'], [false, 'Off', 'Skip till enforcement']].map(([val, label, note]) => (
            <button key={String(val)} type="button" disabled={toggleSaving || shiftRoutineEnabled === val}
              onClick={() => handleToggle(val)}
              className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                shiftRoutineEnabled === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{label}</span>
                {shiftRoutineEnabled === val && <span className="text-xs font-semibold">Active</span>}
              </div>
              <p className={`text-xs mt-0.5 ${shiftRoutineEnabled === val ? 'text-gray-300' : 'text-gray-400'}`}>{note}</p>
            </button>
          ))}
        </div>
        {toggleMsg && (
          <p className={`text-sm font-medium mt-3 ${toggleMsg.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}>
            {toggleMsg}
          </p>
        )}
      </div>

      {!shiftRoutineEnabled && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-6">
          <p className="font-semibold text-gray-900 mb-1">Routine is off</p>
          <p className="text-sm text-gray-600">
            Cash sales work without opening the till. Turn shift routine on to use opening and closing checklists.
          </p>
        </div>
      )}

      {shiftRoutineEnabled && session && mode !== 'open' && mode !== 'close' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-semibold text-green-800">Till open since {formatTime(session.openedAt)}</span>
          </div>
          <p className="text-sm text-green-700 mb-4">
            Expected in drawer: {formatCurrency(session.expectedCash ?? 0)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMode('close')}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800">
              Start closing
            </button>
            <button onClick={() => handlePrintZReport(session.id)} disabled={saving}
              className="px-4 py-2 border border-green-300 text-sm font-semibold text-green-800 rounded-xl hover:bg-green-100 disabled:opacity-50">
              Print till reading
            </button>
          </div>
        </div>
      )}

      {shiftRoutineEnabled && !session && mode !== 'open' && mode !== 'close' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <p className="font-semibold text-amber-900 mb-1">Till not open</p>
          <p className="text-sm text-amber-800 mb-4">Run the opening checklist before taking cash sales.</p>
          <button onClick={() => setMode('open')}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800">
            Start opening
          </button>
        </div>
      )}

      {shiftRoutineEnabled && mode === 'open' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Open</h2>
          <p className="text-sm text-gray-400 mb-4">Opening checklist</p>
          <StepBar steps={OPEN_STEPS} current={openStep} />

          {openStep === 'float' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Count notes and coins in the drawer — this becomes your opening float.</p>
              <DenomCounter denoms={denoms} onChange={setDenoms} totalLabel="Opening float" />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={handleOpenTill} disabled={saving || !hasCounted}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-40">
                {saving ? 'Opening…' : 'Open till'}
              </button>
              {session ? (
                <button onClick={() => { setMode(null); setOpenStep('float') }} className="w-full py-2 text-sm text-gray-500 hover:text-gray-900">
                  Cancel — till already open
                </button>
              ) : (
                <button onClick={() => setMode(null)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
              )}
            </div>
          )}

          {openStep === 'done' && (
            <div className="space-y-4 text-center py-4">
              <div className="text-4xl">✓</div>
              <p className="text-lg font-bold text-gray-900">Till is open — ready to trade</p>
              <p className="text-sm text-gray-500">POS will stop showing the &quot;till not open&quot; warning.</p>
              <button onClick={() => router.push('/pos')}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800">
                Go to POS
              </button>
              <button onClick={() => { setMode(null); load() }}
                className="w-full py-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
                Back to shift home
              </button>
            </div>
          )}

          {openStep === 'float' && session && (
            <p className="text-xs text-gray-400 mt-4">Till already open — you can skip to POS or run closing.</p>
          )}
        </div>
      )}

      {shiftRoutineEnabled && mode === 'close' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Closing</h2>
          <p className="text-sm text-gray-400 mb-4">Closing checklist</p>
          <StepBar steps={CLOSE_STEPS} current={closeStep} />

          {closeStep === 'done' && (
            <div className="space-y-4 text-center py-4">
              <div className="text-4xl">✓</div>
              <p className="text-lg font-bold text-gray-900">Shift closed</p>
              <p className="text-sm text-gray-500">Final till reading printed. Run the opening checklist for the next shift.</p>
              <button onClick={() => { setMode('open'); setOpenStep('float'); setCloseStep('reading') }}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800">
                Start opening
              </button>
              <button onClick={() => { setMode(null); setCloseStep('reading') }}
                className="w-full py-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
                Back to shift home
              </button>
              <Link href="/manager/cash" className="block text-sm font-semibold text-gray-500 hover:text-gray-900">
                View cash history →
              </Link>
            </div>
          )}

          {session && closeStep === 'reading' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Print an interim till reading (Z-report) before counting the drawer.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-gray-400 text-xs">Opening float</p>
                  <p className="font-mono font-bold">{formatCurrency(session.openingFloat)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-gray-400 text-xs">Expected now</p>
                  <p className="font-mono font-bold">{formatCurrency(session.expectedCash ?? 0)}</p>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={() => handlePrintZReport(session.id)} disabled={saving}
                className="w-full py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {saving ? 'Printing…' : 'Print till reading'}
              </button>
              <button onClick={() => setCloseStep('count')}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800">
                Continue to count
              </button>
              <button onClick={() => setMode(null)} className="w-full py-2 text-sm text-gray-500">Cancel</button>
            </div>
          )}

          {session && closeStep === 'count' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Count everything left in the drawer.</p>
              <div className="bg-gray-50 rounded-xl p-3 flex justify-between text-sm mb-2">
                <span className="text-gray-500">Expected</span>
                <span className="font-mono font-bold">{formatCurrency(session.expectedCash ?? 0)}</span>
              </div>
              <DenomCounter denoms={denoms} onChange={setDenoms} />
              {variance !== null && (
                <div className={`rounded-xl p-4 flex justify-between items-center ${varianceOk ? 'bg-green-50' : 'bg-red-50'}`}>
                  <span className={`text-sm font-semibold ${varianceOk ? 'text-green-700' : 'text-red-700'}`}>
                    {varianceOk ? 'Within tolerance' : 'Variance detected'}
                  </span>
                  <span className={`font-mono font-bold ${varianceOk ? 'text-green-700' : 'text-red-700'}`}>
                    {gte(variance, 0) ? '+' : ''}{formatCurrency(variance)}
                  </span>
                </div>
              )}
              <button onClick={() => setCloseStep('stock')} disabled={!hasCounted}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-40">
                Continue
              </button>
              <button onClick={() => setCloseStep('reading')} className="w-full py-2 text-sm text-gray-500">Back</button>
            </div>
          )}

          {session && closeStep === 'stock' && (
            <StockCountStep
              onContinue={() => setCloseStep('close')}
              onBack={() => setCloseStep('count')}
            />
          )}

          {session && closeStep === 'close' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Confirm close — a final till reading prints automatically.</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Counted</span><span className="font-mono font-bold">{formatCurrency(countedTotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="font-mono">{formatCurrency(session.expectedCash ?? 0)}</span></div>
                {variance !== null && (
                  <div className="flex justify-between"><span className="text-gray-500">Variance</span><span className="font-mono font-bold">{gte(variance, 0) ? '+' : ''}{formatCurrency(variance)}</span></div>
                )}
              </div>
              <input type="text" placeholder="Close note (optional)" value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button onClick={handleCloseTill} disabled={saving}
                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Closing…' : 'Close till & print final reading'}
              </button>
              <button onClick={() => setCloseStep('stock')} className="w-full py-2 text-sm text-gray-500">Back</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
