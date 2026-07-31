'use client'

import { useState, useEffect, useContext } from 'react'
import Button from '@/components/shared/Button'
import { AdminSessionContext } from '@/app/admin/layout'
import { usePromptDialog } from '@/hooks/usePromptDialog'

const ROLE_COLORS = {
  STAFF: 'bg-blue-100 text-blue-700',
  MANAGER: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-gray-900 text-white',
}

const EMPTY_FORM = { name: '', username: '', password: '', role: 'STAFF', pin: '' }

export default function UsersPage() {
  const session = useContext(AdminSessionContext)
  const isAdmin = session?.role === 'ADMIN'
  const { confirm, alert, dialog } = usePromptDialog()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeUsers = users.filter((u) => u.status === 'ACTIVE')
  const pendingUsers = users.filter((u) => u.status === 'PENDING')
  const availableRoles = isAdmin ? ['STAFF', 'MANAGER', 'ADMIN'] : ['STAFF', 'MANAGER']

  async function load() {
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditUser(null)
    setForm(EMPTY_FORM)
    setError('')
    setFormOpen(true)
  }

  function openEdit(user) {
    setEditUser(user)
    setForm({ name: user.name, username: user.username, password: '', role: user.role, pin: '' })
    setError('')
    setFormOpen(true)
  }

  async function save() {
    if (!form.name || !form.username) return setError('Name and username are required')
    if (!editUser && !form.password) return setError('Password is required for new users')
    setSaving(true)
    setError('')
    const payload = { name: form.name, username: form.username, role: form.role }
    if (form.password) payload.password = form.password
    if (form.pin !== undefined) payload.pin = form.pin || null
    const res = editUser
      ? await fetch(`/api/users/${editUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); return setError(d.error || 'Failed to save') }
    setFormOpen(false)
    load()
  }

  async function approve(user) {
    const res = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }) })
    if (!res.ok) {
      const d = await res.json()
      await alert(d.error || 'Failed to approve account', { title: 'Could not approve' })
      return
    }
    load()
  }

  async function decline(user) {
    if (!await confirm(`Decline and remove ${user.name}'s pending account?`, { title: 'Decline account', confirmLabel: 'Decline' })) return
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      await alert(d.error || 'Failed to remove account', { title: 'Could not decline' })
      return
    }
    load()
  }

  async function deleteUser(user) {
    if (!await confirm(`Delete ${user.name}? This cannot be undone.`, { title: 'Delete user' })) return
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      await alert(d.error || 'Failed to delete user', { title: 'Could not delete' })
      return
    }
    load()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Staff Accounts</h1>
        <Button variant="primary" size="sm" onClick={openAdd}>+ Add User</Button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          <div className="space-y-2">
            {activeUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{user.name}</div>
                  <div className="text-xs text-gray-400">@{user.username}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role]}`}>{user.role}</span>
                <button onClick={() => openEdit(user)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">Edit</button>
                {isAdmin && (
                  <button onClick={() => deleteUser(user)} className="text-xs text-red-400 hover:text-red-600 font-medium">Delete</button>
                )}
              </div>
            ))}
            {activeUsers.length === 0 && (
              <p className="text-sm text-gray-400">No active accounts.</p>
            )}
          </div>

          {pendingUsers.length > 0 && (
            <div className="mt-8">
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
                    {isAdmin ? (
                      <>
                        <button onClick={() => approve(user)} className="text-xs text-green-600 hover:text-green-800 font-medium">Approve</button>
                        <button onClick={() => decline(user)} className="text-xs text-red-400 hover:text-red-600 font-medium">Decline</button>
                      </>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">Awaiting admin approval</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">{editUser ? 'Edit User' : 'Add User'}</h2>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editUser ? 'Quick PIN (leave blank to keep, clear to remove)' : 'Quick PIN (optional, 4–6 digits)'}
                </label>
                <input type="password" inputMode="numeric" maxLength={6} value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 1234"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <div className="flex gap-2">
                  {availableRoles.map((r) => (
                    <button key={r} onClick={() => setForm({ ...form, role: r })}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${form.role === r ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {!editUser && !isAdmin && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  This account will be submitted for admin approval before it becomes active.
                </p>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setFormOpen(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving…' : (editUser || isAdmin) ? 'Save' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
      {dialog}
    </div>
  )
}
