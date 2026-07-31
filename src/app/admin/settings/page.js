'use client'

import { useState, useEffect } from 'react'
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext'

function ToggleCard({ icon, title, description, value, onChange, saving, onNote, offNote }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{icon}</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
      <div className="flex gap-3">
        {[[true, 'On', onNote], [false, 'Off', offNote]].map(([val, label, note]) => (
          <button key={String(val)} type="button" disabled={saving || value === val}
            onClick={() => onChange(val)}
            className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${
              value === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{label}</span>
              {value === val && <span className="text-xs font-semibold">Active</span>}
            </div>
            <p className={`text-xs mt-0.5 ${value === val ? 'text-gray-300' : 'text-gray-400'}`}>{note}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function TableNumbersCard({ value, max, onChange, onSaveMax, saving }) {
  const [draft, setDraft] = useState(String(max))

  useEffect(() => { setDraft(String(max)) }, [max])

  const parsed = parseInt(draft)
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 99

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🔢</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Table Numbers</h2>
          <p className="text-sm text-gray-400">How the cashier tags an order so the server can find the customer.</p>
        </div>
      </div>
      <div className="flex gap-3">
        {[
          [true, 'Typed number', 'Cashier types the number handed to the customer'],
          [false, 'Floor plan', 'Cashier picks a table off the saved layout'],
        ].map(([val, label, note]) => (
          <button key={String(val)} type="button" disabled={saving || value === val}
            onClick={() => onChange(val)}
            className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${
              value === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{label}</span>
              {value === val && <span className="text-xs font-semibold">Active</span>}
            </div>
            <p className={`text-xs mt-0.5 ${value === val ? 'text-gray-300' : 'text-gray-400'}`}>{note}</p>
          </button>
        ))}
      </div>
      {value ? (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quick-pick buttons</label>
          <p className="text-xs text-gray-400 mb-2">Checkout shows a button per number, 1 to this many. Set it to how many number stands you hand out.</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button type="button" disabled={saving || !valid || parsed === max}
              onClick={() => onSaveMax(parsed)}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">
              Save
            </button>
          </div>
          {!valid && draft !== '' && <p className="text-xs text-red-500 mt-1">Enter a number between 1 and 99</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-4">Edit the layout on the Tables page in the POS.</p>
      )}
    </div>
  )
}

// Display order runs Mon-first (how a roster reads); dayOfWeek stays 0=Sun.
const DAYS = [['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6], ['Sunday', 0]]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]

function OnlineHoursCard({ value, onSave, saving }) {
  const [draft, setDraft] = useState(value.hours)

  // Re-sync when a save returns fresh server state.
  useEffect(() => { setDraft(value.hours) }, [value.hours])

  const dirty = JSON.stringify(draft) !== JSON.stringify(value.hours)

  function setDay(day, patch) {
    setDraft((prev) => prev.map((d) => (d.dayOfWeek === day ? { ...d, ...patch } : d)))
  }

  function copyTo(days, from) {
    const src = draft.find((d) => d.dayOfWeek === from)
    setDraft((prev) => prev.map((d) =>
      days.includes(d.dayOfWeek)
        ? { ...d, openTime: src.openTime, closeTime: src.closeTime, closed: src.closed }
        : d
    ))
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🕒</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Online Ordering Hours</h2>
          <p className="text-sm text-gray-400">Set different hours for each day. Outside them, online checkout is blocked.</p>
        </div>
      </div>

      <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
        value.open ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-gray-100 text-gray-700 border border-gray-200'
      }`}>
        {value.open ? '● Currently accepting online orders' : '○ Currently closed — online checkout is blocked'}
      </div>

      <div className="flex gap-3 mb-5">
        {[[true, 'Use hours', 'Open/close automatically'], [false, 'Always open', 'Ignore the times below']].map(([val, label, note]) => (
          <button key={String(val)} type="button" disabled={saving || value.hoursEnabled === val}
            onClick={() => onSave({ hoursEnabled: val }, val ? 'Opening hours on' : 'Opening hours off')}
            className={`flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors ${
              value.hoursEnabled === val ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{label}</span>
              {value.hoursEnabled === val && <span className="text-xs font-semibold">Active</span>}
            </div>
            <p className={`text-xs mt-0.5 ${value.hoursEnabled === val ? 'text-gray-300' : 'text-gray-400'}`}>{note}</p>
          </button>
        ))}
      </div>

      <div className={value.hoursEnabled ? '' : 'opacity-40 pointer-events-none'}>
        <div className="space-y-2">
          {DAYS.map(([label, day]) => {
            const d = draft.find((x) => x.dayOfWeek === day)
            if (!d) return null
            return (
              <div key={day} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm font-semibold text-gray-700">{label}</span>
                <button type="button" disabled={saving}
                  onClick={() => setDay(day, { closed: !d.closed })}
                  className={`w-20 shrink-0 px-2 py-2 rounded-lg text-xs font-bold border-2 transition-colors ${
                    d.closed ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}>
                  {d.closed ? 'Closed' : 'Open'}
                </button>
                <div className={`flex items-center gap-2 flex-1 ${d.closed ? 'opacity-30 pointer-events-none' : ''}`}>
                  <input type="time" value={d.openTime} disabled={saving}
                    onChange={(e) => setDay(day, { openTime: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <span className="text-gray-300 text-sm">–</span>
                  <input type="time" value={d.closeTime} disabled={saving}
                    onChange={(e) => setDay(day, { closeTime: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" disabled={saving} onClick={() => copyTo(WEEKDAYS, 1)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-400">
            Copy Monday → all weekdays
          </button>
          <button type="button" disabled={saving} onClick={() => copyTo(WEEKEND, 6)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-400">
            Copy Saturday → Sunday
          </button>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button type="button" disabled={saving || !dirty}
            onClick={() => onSave({ hours: draft }, 'Hours saved')}
            className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-30">
            Save hours
          </button>
          {dirty && (
            <button type="button" disabled={saving} onClick={() => setDraft(value.hours)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800">
              Discard changes
            </button>
          )}
          {dirty && <span className="text-xs text-gray-400">Unsaved changes</span>}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, apply } = useFeatureSettings()
  const [online, setOnline] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/online-order-settings').then((r) => r.json()).then(setOnline).catch(() => setOnline(null))
  }, [])

  async function updateOnline(patch, label) {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/online-order-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Failed to update setting')
      return
    }
    setOnline(await res.json())
    setMsg(label)
    setTimeout(() => setMsg(''), 3000)
  }

  async function update(patch, label) {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/feature-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Failed to update setting')
      return
    }
    // The PATCH response carries the fresh flags — push them to every consumer
    // (nav, checkout, admin links) through the shared context.
    apply(await res.json())
    setMsg(label)
    setTimeout(() => setMsg(''), 3000)
  }

  if (!settings) return <div className="p-6 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Turn optional features on or off. Off hides them everywhere; your data is kept.</p>
      </div>

      <div className="space-y-6">
        {online && (
          <>
            <ToggleCard
              icon="🛒"
              title="Accept Online Orders"
              description="Master switch for the customer online-order page. Turn off to stop new orders immediately (e.g. a public holiday or an early close)."
              value={online.acceptingOrders}
              saving={saving}
              onNote="Accept orders (subject to the hours below)"
              offNote="Refuse all online orders now"
              onChange={(v) => updateOnline({ acceptingOrders: v }, v ? 'Online orders accepted' : 'Online orders paused')}
            />
            <OnlineHoursCard value={online} onSave={updateOnline} saving={saving} />
          </>
        )}
        <TableNumbersCard
          value={settings.manualTableNumbers}
          max={settings.tableNumberMax}
          saving={saving}
          onChange={(v) => update({ manualTableNumbers: v }, v ? 'Typed table numbers on' : 'Floor plan tables on')}
          onSaveMax={(v) => update({ tableNumberMax: v }, 'Quick-pick buttons updated')}
        />
        <ToggleCard
          icon="🧾"
          title="Expenses"
          description="Log operating expenses (rent, utilities, wages…) and see them in the Reports profit & loss."
          value={settings.expensesEnabled}
          saving={saving}
          onNote="Show the Expenses tab + P&L costs"
          offNote="Hide expenses"
          onChange={(v) => update({ expensesEnabled: v }, v ? 'Expenses enabled' : 'Expenses disabled')}
        />
        <ToggleCard
          icon="📦"
          title="Suppliers & Receivings"
          description="Record suppliers and stock purchases (received N units at $X); spend feeds the P&L and bumps stock."
          value={settings.purchasingEnabled}
          saving={saving}
          onNote="Show the Purchasing tab + P&L purchases"
          offNote="Hide purchasing"
          onChange={(v) => update({ purchasingEnabled: v }, v ? 'Purchasing enabled' : 'Purchasing disabled')}
        />
        <ToggleCard
          icon="🖼️"
          title="Product Images"
          description="Let products use uploaded photos. Off shows the emoji icon everywhere instead (saved photos are kept)."
          value={settings.productImagesEnabled}
          saving={saving}
          onNote="Allow photo uploads + show photos"
          offNote="Emoji icons only"
          onChange={(v) => update({ productImagesEnabled: v }, v ? 'Product images enabled' : 'Product images disabled')}
        />
        <ToggleCard
          icon="🎟️"
          title="Vouchers & Promo Codes"
          description="Create discount codes (% off, $ off, or a free item) for online and in-store orders. Manage them on the Vouchers page."
          value={settings.vouchersEnabled}
          saving={saving}
          onNote="Show the Vouchers page + accept codes at checkout"
          offNote="Hide vouchers; codes are rejected"
          onChange={(v) => update({ vouchersEnabled: v }, v ? 'Vouchers enabled' : 'Vouchers disabled')}
        />
      </div>

      {msg && (
        <p className={`text-sm font-medium mt-4 ${msg.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>
      )}
    </div>
  )
}
