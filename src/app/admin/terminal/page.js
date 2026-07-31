'use client'

import { useState, useEffect, useContext, useRef } from 'react'
import { AdminSessionContext } from '@/app/admin/layout'
import { CARD_BRANDS } from '@/lib/cardBrands'
import { runTerminalCharge } from '@/lib/terminalClient'
import { D } from '@/lib/money'
import SquarePairingPanel from '@/components/admin/SquarePairingPanel'
import { TERMINAL_DEADLINE_SECONDS, TERMINAL_WAIT_MIN, TERMINAL_WAIT_MAX, clampTerminalWait } from '@/lib/terminalDeadline'

export default function PaymentsPage() {
  const session = useContext(AdminSessionContext)

  // Terminal reader config
  const [config, setConfig] = useState({ name: 'COUNTER', label: '', stripeReaderId: '', squareDeviceId: '', enabled: true })
  const [stripeReaders, setStripeReaders] = useState(null)
  const [squareDevices, setSquareDevices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingProvider, setTestingProvider] = useState(null)
  const [msg, setMsg] = useState('')
  const [readerTab, setReaderTab] = useState('STRIPE')

  // Surcharge + blocked brands + active provider
  const [settings, setSettings] = useState({ cardSurchargeType: '', cardSurchargeValue: 0, blockedBrands: [], provider: 'STRIPE', onlineProvider: 'STRIPE', terminalWaitSeconds: TERMINAL_DEADLINE_SECONDS })
  const [surchargeSaving, setSurchargeSaving] = useState(false)
  const [surchargeMsg, setSurchargeMsg] = useState('')
  const [waitSaving, setWaitSaving] = useState(false)
  const [waitMsg, setWaitMsg] = useState('')
  const [providerSaving, setProviderSaving] = useState(null)
  const [providerMsg, setProviderMsg] = useState('')
  // Last-saved surcharge/brand values, to flag unsaved edits so nobody thinks a
  // typed-but-unsaved 0 has disabled the surcharge when the DB still has it on.
  const savedSurcharge = useRef({ cardSurchargeType: '', cardSurchargeValue: 0, blockedBrands: [] })

  useEffect(() => {
    refreshReaders()
    fetch('/api/payment-settings')
      .then((r) => r.json())
      .then((d) => {
        const next = {
          cardSurchargeType: d.cardSurchargeType || '',
          cardSurchargeValue: d.cardSurchargeValue || 0,
          blockedBrands: d.blockedBrands || [],
          provider: d.provider || 'STRIPE',
          onlineProvider: d.onlineProvider || d.provider || 'STRIPE',
          terminalWaitSeconds: d.terminalWaitSeconds || TERMINAL_DEADLINE_SECONDS,
        }
        setSettings(next)
        savedSurcharge.current = {
          cardSurchargeType: next.cardSurchargeType,
          cardSurchargeValue: Number(next.cardSurchargeValue) || 0,
          blockedBrands: next.blockedBrands,
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setReaderTab(settings.provider === 'SQUARE' ? 'SQUARE' : 'STRIPE')
  }, [settings.provider])

  function refreshReaders() {
    return fetch('/api/terminal/readers?stripe=1&square=1')
      .then((r) => r.json())
      .then((d) => {
        const counter = (d.readers ?? []).find((r) => r.name === 'COUNTER')
        if (counter) setConfig((c) => ({ ...c, ...counter }))
        setStripeReaders(d.stripeReaders ?? null)
        setSquareDevices(d.squareDevices ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  function refreshSquareDevices() {
    return fetch('/api/terminal/readers?square=1')
      .then((r) => r.json())
      .then((d) => setSquareDevices(d.squareDevices ?? null))
      .catch(() => {})
  }

  function handleSquarePaired(deviceId) {
    setConfig((c) => ({ ...c, squareDeviceId: deviceId }))
    refreshSquareDevices()
  }

  async function handleSaveProvider(provider, field) {
    setProviderSaving(field); setProviderMsg('')
    const res = await fetch('/api/payment-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, [field]: provider }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings((s) => ({ ...s, provider: data.provider, onlineProvider: data.onlineProvider }))
      const label = provider === 'SQUARE' ? 'Square' : 'Stripe'
      const where = field === 'onlineProvider' ? 'online orders' : 'in-store card payments'
      setProviderMsg(`${where} now use ${label}`)
    } else {
      setProviderMsg(data.error ?? 'Failed to switch provider')
    }
    setProviderSaving(null)
    setTimeout(() => setProviderMsg(''), 4000)
  }

  function ProviderToggle({ field, title, description, stripeNote, squareNote }) {
    const active = settings[field]
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">{field === 'onlineProvider' ? '🌐' : '🏪'}</span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-400">{description}</p>
          </div>
        </div>
        <div className="flex gap-3">
          {[['STRIPE', 'Stripe', stripeNote], ['SQUARE', 'Square', squareNote]].map(([val, label, note]) => (
            <button key={val} type="button" disabled={providerSaving === field || active === val}
              onClick={() => handleSaveProvider(val, field)}
              className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                active === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{label}</span>
                {active === val && <span className="text-xs font-semibold">Active</span>}
              </div>
              <p className={`text-xs mt-0.5 ${active === val ? 'text-gray-300' : 'text-gray-400'}`}>{note}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  async function handleSave() {
    setSaving(true); setMsg('')
    const res = await fetch('/api/terminal/readers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const data = await res.json()
    setMsg(res.ok ? 'Saved' : (data.error ?? 'Failed to save'))
    if (res.ok) setConfig(data)
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleSaveWait() {
    setWaitSaving(true); setWaitMsg('')
    const clamped = clampTerminalWait(settings.terminalWaitSeconds)
    const res = await fetch('/api/payment-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, terminalWaitSeconds: clamped }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings((s) => ({ ...s, terminalWaitSeconds: data.terminalWaitSeconds }))
      setWaitMsg('Saved')
    } else {
      setWaitMsg(data.error ?? 'Failed to save')
    }
    setWaitSaving(false)
    setTimeout(() => setWaitMsg(''), 3000)
  }

  async function handleTest(provider) {
    setTestingProvider(provider); setMsg('')
    const result = await runTerminalCharge(1.0, { finalize: false, timeoutSec: 60, provider })
    setTestingProvider(null)
    if (result.ok) setMsg(`Test charge succeeded (${provider === 'SQUARE' ? 'Square' : 'Stripe'}) ✓`)
    else setMsg(result.error ?? 'Test failed')
  }

  function toggleBrand(key) {
    setSettings((s) => ({
      ...s,
      blockedBrands: s.blockedBrands.includes(key)
        ? s.blockedBrands.filter((k) => k !== key)
        : [...s.blockedBrands, key],
    }))
  }

  async function handleSaveSurcharge() {
    setSurchargeSaving(true); setSurchargeMsg('')
    // Amount 0 means "off": clear the type too so the saved state is unambiguous
    // (the server already stores '' when value is 0; keep the client in sync).
    const payload = (Number(settings.cardSurchargeValue) || 0) > 0
      ? settings
      : { ...settings, cardSurchargeType: '', cardSurchargeValue: 0 }
    const res = await fetch('/api/payment-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSurchargeMsg(res.ok ? 'Saved' : (data.error ?? 'Failed to save'))
    if (res.ok) {
      const next = {
        cardSurchargeType: data.cardSurchargeType || '',
        cardSurchargeValue: data.cardSurchargeValue || 0,
        blockedBrands: data.blockedBrands || [],
        provider: data.provider || 'STRIPE',
        onlineProvider: data.onlineProvider || data.provider || 'STRIPE',
      }
      setSettings(next)
      savedSurcharge.current = {
        cardSurchargeType: next.cardSurchargeType,
        cardSurchargeValue: Number(next.cardSurchargeValue) || 0,
        blockedBrands: next.blockedBrands,
      }
    }
    setSurchargeSaving(false)
    setTimeout(() => setSurchargeMsg(''), 3000)
  }

  if (session && session.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Admin access required to configure payments.
      </div>
    )
  }

  const surchargeOn = settings.cardSurchargeType !== '' && settings.cardSurchargeValue > 0
  const surchargeDirty =
    (Number(settings.cardSurchargeValue) || 0) !== savedSurcharge.current.cardSurchargeValue ||
    (surchargeOn ? settings.cardSurchargeType : '') !== (savedSurcharge.current.cardSurchargeValue > 0 ? savedSurcharge.current.cardSurchargeType : '') ||
    JSON.stringify([...settings.blockedBrands].sort()) !== JSON.stringify([...savedSurcharge.current.blockedBrands].sort())
  const stripeInStore = settings.provider === 'STRIPE'
  const stripeOnline = settings.onlineProvider === 'STRIPE'
  const brandBlockingActive = stripeInStore || stripeOnline
  const brandBlockingChannels = [
    stripeInStore && 'in-store',
    stripeOnline && 'online',
  ].filter(Boolean).join(' and ')

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payments</h1>
        <p className="text-sm text-gray-400 mb-6">
          Configure the in-person card reader, the flat card surcharge, and which card brands you accept. Surcharge and brand rules apply both in person and online.
        </p>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-6">
            <ProviderToggle
              field="provider"
              title="In-store card provider"
              description="POS card and split payments at the counter. Past orders still refund through the provider that took them."
              stripeNote="Terminal reader + brand blocking"
              squareNote="Square Terminal / Handheld"
            />
            <ProviderToggle
              field="onlineProvider"
              title="Online order provider"
              description="Customer checkout at /order. Independent from the in-store reader."
              stripeNote="Stripe Checkout + brand blocking"
              squareNote="Square Payment Links"
            />
            {providerMsg && (
              <p className={`text-sm font-medium -mt-3 ${/fail/i.test(providerMsg) ? 'text-red-600' : 'text-green-700'}`}>{providerMsg}</p>
            )}

            {/* Terminal reader */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">💳</span>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Counter reader</h2>
                  <p className="text-sm text-gray-400">The in-person card reader. Card data is processed on the device — it never touches this system.</p>
                </div>
                <div className="ml-auto">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={config.enabled}
                      onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                      className="w-4 h-4 accent-gray-900" />
                    <span className="text-sm font-medium text-gray-700">Enabled</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Label</label>
                  <input type="text" value={config.label}
                    onChange={(e) => setConfig((c) => ({ ...c, label: e.target.value }))}
                    placeholder="e.g. Front counter reader"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>

                <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                  {[
                    ['STRIPE', 'Stripe'],
                    ['SQUARE', 'Square'],
                  ].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setReaderTab(val)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                        readerTab === val ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}>
                      <span>{label}</span>
                      {settings.provider === val && (
                        <span className={`ml-1.5 text-xs font-semibold ${readerTab === val ? 'text-gray-300' : 'text-gray-400'}`}>
                          Active
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {readerTab === 'STRIPE' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-400">Stripe smart reader (S700 / WisePOS E).</p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Stripe Reader ID</label>
                      <input type="text" value={config.stripeReaderId}
                        onChange={(e) => setConfig((c) => ({ ...c, stripeReaderId: e.target.value }))}
                        placeholder="tmr_..."
                        list="stripe-readers"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      {Array.isArray(stripeReaders) && (
                        <datalist id="stripe-readers">
                          {stripeReaders.map((r) => (
                            <option key={r.id} value={r.id}>{r.label} ({r.status})</option>
                          ))}
                        </datalist>
                      )}
                      {Array.isArray(stripeReaders) && stripeReaders.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Found in Stripe: {stripeReaders.map((r) => `${r.label} [${r.status}]`).join(', ')}
                        </p>
                      )}
                      {stripeReaders?.error && (
                        <p className="text-xs text-amber-600 mt-1">Couldn’t list Stripe readers: {stripeReaders.error}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => handleTest('STRIPE')}
                      disabled={testingProvider !== null || !config.stripeReaderId}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                      {testingProvider === 'STRIPE' ? 'Testing…' : 'Test charge $1.00'}
                    </button>
                  </div>
                )}

                {readerTab === 'SQUARE' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-400">Paired Square Terminal or Handheld.</p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Square Device ID</label>
                      <SquarePairingPanel
                        onPaired={handleSquarePaired}
                        onUseSandboxId={(id) => setConfig((c) => ({ ...c, squareDeviceId: id }))}
                      />
                      <input type="text" value={config.squareDeviceId}
                        onChange={(e) => setConfig((c) => ({ ...c, squareDeviceId: e.target.value }))}
                        placeholder="device id"
                        list="square-devices"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 mt-3" />
                      {Array.isArray(squareDevices) && (
                        <datalist id="square-devices">
                          {squareDevices.map((d) => (
                            <option key={d.id} value={d.id}>{d.label} ({d.status})</option>
                          ))}
                        </datalist>
                      )}
                      {Array.isArray(squareDevices) && squareDevices.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Found in Square: {squareDevices.map((d) => `${d.label} [${d.status}]`).join(', ')}
                        </p>
                      )}
                      {squareDevices?.error && (
                        <p className="text-xs text-amber-600 mt-1">Couldn’t list Square devices: {squareDevices.error}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => handleTest('SQUARE')}
                      disabled={testingProvider !== null || !config.squareDeviceId}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                      {testingProvider === 'SQUARE' ? 'Testing…' : 'Test charge $1.00'}
                    </button>
                  </div>
                )}

                {msg && (
                  <p className={`text-sm font-medium ${/fail|declin|error|timed|reach/i.test(msg) ? 'text-red-600' : 'text-green-700'}`}>
                    {msg}
                  </p>
                )}

                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Card wait time
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={TERMINAL_WAIT_MIN} max={TERMINAL_WAIT_MAX} step="5"
                      value={settings.terminalWaitSeconds}
                      onChange={(e) => setSettings((s) => ({ ...s, terminalWaitSeconds: parseInt(e.target.value, 10) || '' }))}
                      className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <span className="text-sm text-gray-500">seconds</span>
                    <button type="button" onClick={handleSaveWait} disabled={waitSaving}
                      className="ml-auto px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                      {waitSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    How long the reader waits for a tap before cancelling ({TERMINAL_WAIT_MIN}–{TERMINAL_WAIT_MAX}s). Applies to Square; the POS uses the same window.
                  </p>
                  {waitMsg && (
                    <p className={`text-xs font-medium mt-1 ${/fail|error/i.test(waitMsg) ? 'text-red-600' : 'text-green-700'}`}>{waitMsg}</p>
                  )}
                </div>

                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
                  {saving ? 'Saving...' : 'Save reader'}
                </button>
              </div>
            </div>

            {/* Card surcharge */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">🧾</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">Card surcharge</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      savedSurcharge.current.cardSurchargeValue > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {savedSurcharge.current.cardSurchargeValue > 0 ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">Added to every card payment (not cash). Set the amount to 0 to disable.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                    {[['PERCENT', 'Percentage'], ['FIXED', 'Fixed amount']].map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => setSettings((s) => ({ ...s, cardSurchargeType: val }))}
                        className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                          settings.cardSurchargeType === val ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    {settings.cardSurchargeType === 'FIXED' ? 'Amount ($)' : 'Percentage (%)'}
                  </label>
                  <input type="number" min="0" step="0.01" value={settings.cardSurchargeValue || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, cardSurchargeValue: parseFloat(e.target.value) || 0 }))}
                    placeholder={settings.cardSurchargeType === 'FIXED' ? 'e.g. 0.50' : 'e.g. 1.5'}
                    disabled={!settings.cardSurchargeType}
                    className="w-40 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>

                <p className={`text-sm ${surchargeOn ? 'text-gray-600' : 'text-gray-400'}`}>
                  {surchargeOn
                    ? `Card payments will be surcharged ${settings.cardSurchargeType === 'FIXED' ? `$${D(settings.cardSurchargeValue).toFixed(2)}` : `${settings.cardSurchargeValue}%`}.`
                    : 'No card surcharge will be applied.'}
                </p>

                {surchargeDirty && (
                  <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Unsaved changes — click “Save surcharge &amp; brands” below to apply.
                  </p>
                )}
              </div>
            </div>

            {/* Blocked brands */}
            <div className={`bg-white rounded-2xl border p-6 ${brandBlockingActive ? 'border-gray-200' : 'border-amber-200 bg-amber-50/40'}`}>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-3xl">🚫</span>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Blocked card brands</h2>
                  {brandBlockingActive ? (
                    <p className="text-sm text-gray-400">
                      Refuse these brands on {brandBlockingChannels} (Stripe only). No effect on channels using Square.
                    </p>
                  ) : (
                    <p className="text-sm text-amber-800">
                      Brand blocking requires Stripe. Both in-store and online are set to Square — switch at least one channel to Stripe for blocking to apply.
                    </p>
                  )}
                </div>
              </div>

              <div className={`space-y-2 ${!brandBlockingActive ? 'opacity-50 pointer-events-none' : ''}`}>
                {CARD_BRANDS.map((brand) => (
                  <label key={brand.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 ${brandBlockingActive ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed'}`}>
                    <input type="checkbox" checked={settings.blockedBrands.includes(brand.key)}
                      onChange={() => toggleBrand(brand.key)}
                      disabled={!brandBlockingActive}
                      className="w-4 h-4 accent-red-600 disabled:opacity-50" />
                    <span className="text-sm font-medium text-gray-700">{brand.label}</span>
                    {settings.blockedBrands.includes(brand.key) && (
                      <span className="ml-auto text-xs font-semibold text-red-600">Blocked</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {surchargeMsg && (
              <p className={`text-sm font-medium ${/fail|error|required/i.test(surchargeMsg) ? 'text-red-600' : 'text-green-700'}`}>
                {surchargeMsg}
              </p>
            )}

            <button onClick={handleSaveSurcharge} disabled={surchargeSaving}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 ${
                surchargeDirty
                  ? 'bg-gray-900 text-white hover:bg-gray-800 ring-2 ring-amber-400'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}>
              {surchargeSaving ? 'Saving...' : surchargeDirty ? 'Save surcharge & brands •' : 'Save surcharge & brands'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
