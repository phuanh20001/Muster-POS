'use client'

import { useState, useEffect, useContext } from 'react'
import { AdminSessionContext } from '@/app/admin/layout'
import { PAPER_WIDTHS, PRINTER_TYPES } from '@/lib/printerTypes'

function PrinterCard({ printer: initial }) {
  const [printer, setPrinter] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSave() {
    setSaving(true)
    setMsg('')
    const res = await fetch(`/api/printers/${printer.name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printer),
    })
    const data = await res.json()
    if (res.ok) {
      setPrinter(data)
      setMsg('Saved')
    } else {
      setMsg(data.error ?? 'Failed to save')
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleTest() {
    setTesting(true)
    setMsg('')
    const res = await fetch(`/api/printers/${printer.name}/test`, { method: 'POST' })
    const data = await res.json()
    setMsg(res.ok ? 'Test print sent!' : (data.error ?? 'Print failed'))
    setTesting(false)
    setTimeout(() => setMsg(''), 4000)
  }

  const icon = printer.name === 'FRONT' ? '🖨️' : '🍳'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-3xl">{icon}</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{printer.name}</h2>
          <p className="text-sm text-gray-400">{printer.name === 'FRONT' ? 'Front counter / barista station' : 'Kitchen station'}</p>
        </div>
        <div className="ml-auto">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={printer.enabled}
              onChange={(e) => setPrinter((p) => ({ ...p, enabled: e.target.checked }))}
              className="w-4 h-4 accent-gray-900" />
            <span className="text-sm font-medium text-gray-700">Enabled</span>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
          <input
            type="text"
            value={printer.description}
            onChange={(e) => setPrinter((p) => ({ ...p, description: e.target.value }))}
            placeholder="e.g. Front counter thermal printer"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">IP Address</label>
            <input
              type="text"
              value={printer.ip}
              onChange={(e) => setPrinter((p) => ({ ...p, ip: e.target.value }))}
              placeholder="192.168.0.12"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Port</label>
            <input
              type="number"
              value={printer.port}
              onChange={(e) => setPrinter((p) => ({ ...p, port: parseInt(e.target.value) || 9100 }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Printer type</label>
            <select
              value={printer.printerType || 'GENERIC'}
              onChange={(e) => setPrinter((p) => ({ ...p, printerType: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PRINTER_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {PRINTER_TYPES.find((t) => t.id === (printer.printerType || 'GENERIC'))?.hint}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Paper width</label>
            <select
              value={printer.paperWidth ?? 80}
              onChange={(e) => setPrinter((p) => ({ ...p, paperWidth: parseInt(e.target.value, 10) }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {PAPER_WIDTHS.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { key: 'printDockets', label: 'Print Dockets' },
            { key: 'printReceipts', label: 'Print Receipts' },
            { key: 'openDrawer', label: 'Open Drawer' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={printer[key]}
                onChange={(e) => setPrinter((p) => ({ ...p, [key]: e.target.checked }))}
                className="w-4 h-4 accent-gray-900" />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>

        {msg && (
          <p className={`text-sm font-medium ${msg.includes('fail') || msg.includes('error') || msg.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}>
            {msg}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={handleTest} disabled={testing || !printer.ip}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            {testing ? 'Printing...' : 'Test Print'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PrintersPage() {
  const session = useContext(AdminSessionContext)
  const [printers, setPrinters] = useState([])
  const [autoPrintCardReceipts, setAutoPrintCardReceipts] = useState(true)
  const [autoPrintDockets, setAutoPrintDockets] = useState(true)
  const [autoOpenDrawer, setAutoOpenDrawer] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/printers')
      .then((r) => r.json())
      .then((d) => {
        setPrinters(Array.isArray(d?.printers) ? d.printers : (Array.isArray(d) ? d : []))
        setAutoPrintCardReceipts(d?.autoPrintCardReceipts ?? true)
        setAutoPrintDockets(d?.autoPrintDockets ?? true)
        setAutoOpenDrawer(d?.autoOpenDrawer ?? true)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleSaveSettings() {
    setSavingSettings(true)
    setSettingsMsg('')
    const res = await fetch('/api/printers/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoPrintCardReceipts, autoPrintDockets, autoOpenDrawer }),
    })
    const data = await res.json()
    if (res.ok) {
      setAutoPrintCardReceipts(data.autoPrintCardReceipts)
      setAutoPrintDockets(data.autoPrintDockets)
      setAutoOpenDrawer(data.autoOpenDrawer)
      setSettingsMsg('Saved')
    } else {
      setSettingsMsg(data.error ?? 'Failed to save')
    }
    setSavingSettings(false)
    setTimeout(() => setSettingsMsg(''), 3000)
  }

  if (session && session.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Admin access required to configure printers.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Printer Configuration</h1>
        <p className="text-sm text-gray-400 mb-6">
          Network thermal printers (LAN, port 9100). Works with Epson, Star, Bixolon, Citizen, and other ESC/POS models.
        </p>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Print behaviour</h2>
          <p className="text-sm text-gray-400 mb-4">
            Control what prints automatically after a sale. Manual reprint from order history is always available.
          </p>
          <div className="space-y-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPrintDockets}
                onChange={(e) => setAutoPrintDockets(e.target.checked)}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-sm font-medium text-gray-700">Auto-print dockets after sale</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPrintCardReceipts}
                onChange={(e) => setAutoPrintCardReceipts(e.target.checked)}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-sm font-medium text-gray-700">Auto-print tax receipt after sale</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoOpenDrawer}
                onChange={(e) => setAutoOpenDrawer(e.target.checked)}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-sm font-medium text-gray-700">Auto-open cash drawer on cash payment</span>
            </label>
          </div>
          {settingsMsg && (
            <p className={`text-sm font-medium mb-3 ${settingsMsg.includes('fail') || settingsMsg.includes('Failed') ? 'text-red-600' : 'text-green-700'}`}>
              {settingsMsg}
            </p>
          )}
          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {savingSettings ? 'Saving...' : 'Save print settings'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
        ) : printers.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">No printers configured</div>
        ) : (
          <div className="space-y-4">
            {printers.map((p) => (
              <PrinterCard key={p.id} printer={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
