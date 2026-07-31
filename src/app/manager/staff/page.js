'use client'

import { useState, useEffect, useContext } from 'react'
import Button from '@/components/shared/Button'
import Modal from '@/components/shared/Modal'
import { ManagerSessionContext } from '@/app/manager/layout'

const ROLE_COLORS = {
  STAFF: 'bg-blue-100 text-blue-700',
  MANAGER: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-gray-900 text-white',
}

const EMPTY_FORM = { name: '', username: '', password: '', role: 'STAFF', pin: '' }

export default function ManagerStaffPage() {
  const session = useContext(ManagerSessionContext)
  const isAdmin = session?.role === 'ADMIN'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const activeUsers = users.filter((u) => u.status === 'ACTIVE')
  const pendingUsers = users.filter((u) => u.status === 'PENDING')

  async function load() {
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openRequest() {
    setForm(EMPTY_FORM)
    setError('')
    setFormOpen(true)
  }

  async function submit() {
    if (!form.name.trim() || !form.username.trim()) return setError('Name and username are required')
    if (!form.password) return setError('Password is required')
    setSaving(true)
    setError('')
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        pin: form.pin || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      return setError(d.error || 'Failed to submit request')
    }
    setFormOpen(false)
    setSuccess(isAdmin ? 'Staff account created.' : 'Request submitted. The owner will approve it in Admin → Users.')
    setTimeout(() => setSuccess(''), 5000)
    load()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-gray-900">Staff</h1>
        <Button variant="primary" size="sm" onClick={openRequest}>
          {isAdmin ? '+ Add Staff' : '+ Request Account'}
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {isAdmin
          ? 'Add staff here (active immediately) or manage accounts in Admin → Users.'
          : 'Request a new staff or manager account. The owner approves it in Admin → Users before they can log in.'}
      </p>

      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">{success}</p>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          {pendingUsers.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Pending Approval ({pendingUsers.length})
              </h2>
              <div className="space-y-2">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">{user.name}</div>
                      <div className="text-xs text-gray-400">@{user.username}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>{user.role}</span>
                    <span className="text-xs text-amber-700 font-medium">Awaiting owner approval</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Active Staff</h2>
          <div className="space-y-2">
            {activeUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{user.name}</div>
                  <div className="text-xs text-gray-400">@{user.username}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>{user.role}</span>
              </div>
            ))}
            {activeUsers.length === 0 && (
              <p className="text-sm text-gray-400">No active staff accounts.</p>
            )}
          </div>
        </>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={isAdmin ? 'Add Staff' : 'Request Staff Account'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quick PIN (optional, 4–6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              placeholder="e.g. 1234"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex gap-2">
              {['STAFF', 'MANAGER'].map((r) => (
                <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${form.role === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {!isAdmin && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              This will be sent to the owner for approval. The new person cannot log in until approved.
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="md" onClick={() => setFormOpen(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" size="md" onClick={submit} disabled={saving} className="flex-1">
              {saving ? 'Submitting…' : isAdmin ? 'Create Account' : 'Submit Request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
