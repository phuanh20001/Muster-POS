'use client'

import { useState, useEffect } from 'react'

export default function CashierPicker({ onClose, onSelect }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    fetch('/api/users/list?clockedIn=1').then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : []))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4">Who is taking this order?</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {users.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No staff currently clocked in.</p>
          ) : users.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-400 transition-all text-sm font-medium text-gray-800"
            >
              {u.name}
              <span className="ml-2 text-xs text-gray-400">{u.role}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  )
}
