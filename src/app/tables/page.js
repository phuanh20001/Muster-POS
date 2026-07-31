'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatTime, formatDate, orderTicketLabel } from '@/lib/formatters'
import { lineTotalForItem } from '@/lib/orderTotals'
import { orderStatusChip } from '@/lib/constants'
import ManagerPinModal from '@/components/shared/ManagerPinModal'
import ProductThumb from '@/components/shared/ProductThumb'
import { usePromptDialog } from '@/hooks/usePromptDialog'

const TABLE_SIZE = 96
const DRAG_THRESHOLD = 6
const GROUP_DISTANCE = 120

const GROUP_COLORS = ['#60a5fa', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#22d3ee']

function groupColor(groupId) {
  let hash = 0
  for (const ch of groupId) hash = (hash + ch.charCodeAt(0)) % 997
  return GROUP_COLORS[hash % GROUP_COLORS.length]
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max))
}

// Lay grouped tables out in a single horizontal row, edge-to-edge, starting
// from the row's existing leftmost member so the party stays where it sits.
// Returns [{ id, x, y }] clamped so the row never runs off the floor.
function rowLayout(members, floorWidth) {
  const ordered = [...members].sort((a, b) => a.x - b.x || a.id - b.id)
  const anchorY = ordered[0]?.y ?? 0
  const rowWidth = ordered.length * TABLE_SIZE
  const maxX = Math.max(0, (floorWidth || rowWidth) - TABLE_SIZE)
  const startX = clamp(Math.min(...ordered.map((t) => t.x)), 0, Math.max(0, (floorWidth || rowWidth) - rowWidth))
  return ordered.map((t, i) => ({
    id: t.id,
    x: clamp(startX + i * TABLE_SIZE, 0, maxX),
    y: anchorY,
  }))
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
}

export default function TablesPage() {
  const router = useRouter()
  const { confirm, alert, dialog } = usePromptDialog()
  const [tables, setTables] = useState([])
  const [selected, setSelected] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [addingTable, setAddingTable] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState('')
  const [addError, setAddError] = useState('')
  const [groupPrompt, setGroupPrompt] = useState(null)
  const [session, setSession] = useState(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState('')
  const [, setNow] = useState(Date.now())

  const floorRef = useRef(null)
  const dragRef = useRef(null)
  const tablesRef = useRef([])
  const groupPromptRef = useRef(null)

  useEffect(() => { tablesRef.current = tables }, [tables])
  useEffect(() => { groupPromptRef.current = groupPrompt }, [groupPrompt])

  const load = useCallback(async () => {
    const res = await fetch('/api/tables')
    const data = await res.json()
    setTables(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/auth/manager', { cache: 'no-store' }).then((r) => r.json()).then((d) => setSession(d)).catch(() => setSession(null))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Live floor: pick up occupancy changes from other devices. Paused while a
  // drag or the group prompt is active so we don't clobber in-flight positions.
  useEffect(() => {
    const t = setInterval(() => {
      if (dragRef.current || groupPromptRef.current) return
      load()
    }, 10000)
    return () => clearInterval(t)
  }, [load])

  // Pointer events unify mouse + touch. A drag only starts past a small
  // movement threshold (and only in edit mode); below it, release = tap/select.
  function handlePointerDown(e, table) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const members = table.groupId
      ? tables.filter((t) => t.groupId === table.groupId && t.id !== table.id)
          .map((t) => ({ id: t.id, dx: t.x - table.x, dy: t.y - table.y }))
      : []
    dragRef.current = {
      id: table.id,
      startX: e.clientX,
      startY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      moved: false,
      members,
    }
  }

  function handlePointerMove(e) {
    const d = dragRef.current
    if (!d || !floorRef.current) return
    if (!d.moved) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      if (dist < DRAG_THRESHOLD || !editMode) return
      d.moved = true
      setDraggingId(d.id)
    }
    const floor = floorRef.current.getBoundingClientRect()
    const x = clamp(e.clientX - floor.left - d.offX, 0, floor.width - TABLE_SIZE)
    const y = clamp(e.clientY - floor.top - d.offY, 0, floor.height - TABLE_SIZE)
    setTables((prev) => prev.map((t) => {
      if (t.id === d.id) return { ...t, x, y }
      const m = d.members.find((mm) => mm.id === t.id)
      if (m) {
        return {
          ...t,
          x: clamp(x + m.dx, 0, floor.width - TABLE_SIZE),
          y: clamp(y + m.dy, 0, floor.height - TABLE_SIZE),
        }
      }
      return t
    }))
  }

  async function handlePointerUp() {
    const d = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    if (!d) return

    const current = tablesRef.current
    const dragged = current.find((t) => t.id === d.id)
    if (!dragged) return

    if (!d.moved) {
      setSelected((prev) => (prev?.id === d.id ? null : dragged))
      return
    }

    const movedIds = [d.id, ...d.members.map((m) => m.id)]
    await Promise.all(movedIds.map((id) => {
      const t = current.find((x) => x.id === id)
      if (!t) return null
      return fetch(`/api/tables/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: t.x, y: t.y }),
      })
    }))

    // Dropped near another table? Offer to group them.
    const candidates = current.filter((t) =>
      t.id !== d.id && (!dragged.groupId || t.groupId !== dragged.groupId)
    )
    let nearest = null
    let nearestDist = Infinity
    for (const t of candidates) {
      const dist = Math.hypot(t.x - dragged.x, t.y - dragged.y)
      if (dist < nearestDist) { nearest = t; nearestDist = dist }
    }
    if (nearest && nearestDist < GROUP_DISTANCE) {
      setGroupPrompt({ source: dragged, target: nearest })
    }
  }

  async function confirmGroup() {
    const { source, target } = groupPrompt
    await fetch('/api/tables/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: [source.id, target.id] }),
    })
    setGroupPrompt(null)

    // Reload so we know the shared groupId (POST may merge into an existing
    // group), then reflow every member of that group into a tidy row.
    const res = await fetch('/api/tables')
    const fresh = await res.json()
    const list = Array.isArray(fresh) ? fresh : []
    setTables(list)

    const groupId = list.find((t) => t.id === source.id)?.groupId
    const members = list.filter((t) => t.groupId && t.groupId === groupId)
    if (members.length > 1) {
      const floorWidth = floorRef.current?.getBoundingClientRect().width
      const layout = rowLayout(members, floorWidth)
      await Promise.all(layout.map((m) =>
        fetch(`/api/tables/${m.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: m.x, y: m.y }),
        })
      ))
    }
    load()
  }

  async function ungroup(table) {
    await fetch('/api/tables/group', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: table.groupId }),
    })
    load()
  }

  async function freeTable(table) {
    await fetch(`/api/tables/${table.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'AVAILABLE' }) })
    setSelected(null)
    load()
  }

  async function performDelete(table) {
    if (!await confirm(`Delete Table ${table.number}?`, { title: 'Delete table' })) return
    const res = await fetch(`/api/tables/${table.id}`, { method: 'DELETE' })
    if (res.status === 403) {
      setSession(null)
      setPendingDelete(table)
      setPinOpen(true)
      return
    }
    if (!res.ok) { const d = await res.json(); await alert(d.error, { title: 'Could not delete' }); return }
    if (selected?.id === table.id) setSelected(null)
    load()
  }

  function deleteTable(table) {
    if (!session) {
      setPendingDelete(table)
      setPinOpen(true)
      return
    }
    performDelete(table)
  }

  function handlePinSuccess(user) {
    setPinOpen(false)
    setSession(user)
    if (pendingDelete) {
      const t = pendingDelete
      setPendingDelete(null)
      performDelete(t)
    }
  }

  async function saveLabel() {
    await fetch(`/api/tables/${selectedTable.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: labelValue.trim() }),
    })
    setEditingLabel(false)
    load()
  }

  async function addTable() {
    const num = parseInt(newTableNumber)
    if (!num || num < 1) return setAddError('Enter a valid table number')
    setAddError('')
    const res = await fetch('/api/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: num, x: 80, y: 80 }) })
    if (!res.ok) { const d = await res.json(); return setAddError(d.error) }
    setNewTableNumber('')
    setAddingTable(false)
    load()
  }

  const selectedTable = selected ? tables.find((t) => t.id === selected.id) : null
  const groupMembers = selectedTable?.groupId
    ? tables.filter((t) => t.groupId === selectedTable.groupId && t.id !== selectedTable.id)
    : []
  const allOrders = selectedTable?.orders ?? []
  const activeOrders = allOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
  const completedOrders = allOrders.filter((o) => o.status === 'COMPLETED' || o.status === 'CANCELLED')
  const occupiedSince = allOrders[0]?.createdAt

  const occupiedCount = tables.filter((t) => t.status === 'OCCUPIED').length
  const availableCount = tables.filter((t) => t.status === 'AVAILABLE').length

  return (
    <div className="flex h-full min-h-0">
      {/* Floor plan */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-gray-900 text-lg">Floor Plan</h1>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{availableCount} Available
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{occupiedCount} Occupied
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode && (
              <span className="hidden sm:block text-xs text-amber-600 font-medium mr-1">
                Drag to move · drop near another table to group
              </span>
            )}
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-colors ${
                editMode
                  ? 'bg-amber-50 border-amber-400 text-amber-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {editMode ? '✏️ Editing Layout' : '🔒 Layout Locked'}
            </button>
            <button
              onClick={() => { setAddingTable(true); setAddError('') }}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
            >
              + Add Table
            </button>
          </div>
        </div>

        {/* Floor */}
        <div
          ref={floorRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{
            background:
              'radial-gradient(120% 100% at 50% 0%, #fdfbf8 0%, #f7f1e9 55%, #f0e7da 100%)',
          }}
        >
          {/* Warm texture: soft dot grid + a faint larger weave for depth */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#e3dcd2" />
              </pattern>
              <pattern id="weave" width="160" height="160" patternUnits="userSpaceOnUse">
                <circle cx="80" cy="80" r="64" fill="none" stroke="#ebe2d6" strokeWidth="1" opacity="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#weave)" />
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>

          {/* Soft vignette to gently frame the floor */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(85% 75% at 50% 45%, transparent 60%, rgba(120, 96, 64, 0.10) 100%)',
            }}
          />

          {/* Empty state */}
          {tables.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="text-5xl opacity-30">🪑</div>
              <p className="text-sm text-gray-400 font-medium">No tables yet — add one to get started</p>
            </div>
          )}

          {tables.map((table) => {
            const occupied = table.status === 'OCCUPIED'
            const isSelected = selected?.id === table.id
            const firstOrder = table.orders?.[0]
            const gColor = table.groupId ? groupColor(table.groupId) : null

            return (
              <div
                key={table.id}
                style={{
                  left: table.x,
                  top: table.y,
                  touchAction: 'none',
                  cursor: editMode ? (draggingId === table.id ? 'grabbing' : 'grab') : 'pointer',
                  ...(gColor ? { border: `4px solid ${gColor}` } : {}),
                }}
                className={`absolute w-24 h-24 rounded-full flex flex-col items-center justify-center select-none transition-shadow
                  ${occupied
                    ? 'bg-red-500 shadow-lg shadow-red-200'
                    : 'bg-white shadow-md shadow-gray-200 hover:shadow-lg'}
                  ${isSelected ? 'ring-4 ring-offset-2 ring-gray-900' : ''}
                `}
                onPointerDown={(e) => handlePointerDown(e, table)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {gColor && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-xs"
                    style={{ border: `2px solid ${gColor}` }}
                  >
                    ⛓
                  </span>
                )}
                <div className={`text-xs font-semibold tracking-widest uppercase mb-0.5 ${occupied ? 'text-red-200' : 'text-gray-400'}`}>
                  TABLE
                </div>
                <div className={`font-black text-2xl leading-none ${occupied ? 'text-white' : 'text-gray-900'}`}>
                  {table.number}
                </div>
                {occupied && firstOrder && (
                  <div className="flex items-center gap-1 mt-1.5 bg-red-600/50 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-200 animate-pulse" />
                    <span className="text-red-100 text-xs font-semibold">{timeAgo(firstOrder.createdAt)}</span>
                  </div>
                )}
                {!occupied && (
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-green-400" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      {selectedTable && (
        <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Table</p>
                <h2 className="font-black text-3xl text-gray-900 leading-none">{selectedTable.number}</h2>
                {editingLabel ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text" value={labelValue} autoFocus
                      onChange={(e) => setLabelValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveLabel()}
                      placeholder="e.g. Window seat"
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button onClick={saveLabel} className="text-xs font-semibold text-gray-900 underline shrink-0">Save</button>
                    <button onClick={() => setEditingLabel(false)} className="text-xs text-gray-400 underline shrink-0">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setLabelValue(selectedTable.label ?? ''); setEditingLabel(true) }}
                    className="text-sm text-gray-400 mt-1 hover:text-gray-600 transition-colors"
                  >
                    {selectedTable.label || 'Add label'} <span className="text-xs">✏️</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => { setSelected(null); setEditingLabel(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-lg"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
                ${selectedTable.status === 'OCCUPIED' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${selectedTable.status === 'OCCUPIED' ? 'bg-red-500' : 'bg-green-500'}`} />
                {selectedTable.status === 'OCCUPIED' ? 'Occupied' : 'Available'}
              </span>
              {occupiedSince && (
                <span className="text-xs text-gray-400">
                  for <span className="font-semibold text-gray-700">{timeAgo(occupiedSince)}</span>
                </span>
              )}
              {groupMembers.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-600"
                  style={{ border: `1.5px solid ${groupColor(selectedTable.groupId)}` }}
                >
                  ⛓ With Table{groupMembers.length > 1 ? 's' : ''} {groupMembers.map((t) => t.number).join(', ')}
                </span>
              )}
            </div>
          </div>

          {/* Orders */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {allOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <div className="text-3xl opacity-30">🧾</div>
                <p className="text-sm text-gray-400">No orders for this table</p>
              </div>
            ) : (
              <>
                {activeOrders.map((order) => {
                  const sc = orderStatusChip(order.status)
                  return (
                    <div key={order.id} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                        <span className="text-xs font-bold text-gray-700">Order {orderTicketLabel(order)}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {order.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 pt-1.5 pb-0">
                        <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                        {order.user?.name && (
                          <>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{order.user.name}</span>
                          </>
                        )}
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between items-start text-sm">
                            <span className="text-gray-700 flex items-center gap-2 min-w-0">
                              <ProductThumb
                                product={item.product}
                                emojiClassName="text-base shrink-0"
                                imgClassName="w-6 h-6 rounded object-cover shrink-0"
                              />
                              <span className="min-w-0">
                                {item.product.name}
                                {item.size ? <span className="text-gray-400 text-xs"> ({item.size})</span> : ''}
                                <span className="text-gray-400 text-xs ml-1">× {item.quantity}</span>
                              </span>
                            </span>
                            <span className="font-mono text-xs text-gray-500 ml-2 shrink-0">{formatCurrency(lineTotalForItem(item))}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1.5 border-t border-gray-100 mt-1.5">
                          <span className="text-xs font-semibold text-gray-500">Order total</span>
                          <span className="font-mono text-sm font-bold text-gray-900">{formatCurrency(order.total)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {completedOrders.length > 0 && (
                  <div className="pt-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Served</p>
                    <div className="space-y-2">
                      {completedOrders.map((order) => (
                        <div key={order.id} className="rounded-xl border border-gray-100 overflow-hidden opacity-50">
                          <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                            <span className="text-xs font-bold text-gray-500">Order {orderTicketLabel(order)}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                              {order.status === 'CANCELLED' ? 'Cancelled' : 'Served'}
                            </span>
                          </div>
                          <div className="px-3 py-2 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-gray-400">{formatTime(order.createdAt)}</span>
                              <span className="text-xs text-gray-300">·</span>
                              <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                              {order.user?.name && (
                                <>
                                  <span className="text-xs text-gray-300">·</span>
                                  <span className="text-xs text-gray-400">{order.user.name}</span>
                                </>
                              )}
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-400">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                              <span className="font-mono text-xs text-gray-400">{formatCurrency(order.total)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-gray-100 space-y-2">
            <button
              onClick={() => router.push(`/pos?table=${selectedTable.id}`)}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition-colors"
            >
              🛒 New Order
            </button>
            {selectedTable.status === 'OCCUPIED' && (
              <button
                onClick={() => freeTable(selectedTable)}
                className="w-full py-3 border-2 border-gray-900 text-gray-900 hover:bg-gray-50 text-sm font-bold rounded-xl transition-colors"
              >
                Mark as Available{groupMembers.length > 0 ? ' (whole group)' : ''}
              </button>
            )}
            {selectedTable.groupId && (
              <button
                onClick={() => ungroup(selectedTable)}
                className="w-full py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold rounded-xl transition-colors"
              >
                ⛓ Ungroup Tables
              </button>
            )}
            <button
              onClick={() => deleteTable(selectedTable)}
              className="w-full py-2.5 border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 text-sm font-semibold rounded-xl transition-colors"
            >
              Delete Table{!session ? ' 🔒' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Group confirmation */}
      {groupPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setGroupPrompt(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-80 p-6">
            <div className="text-3xl text-center mb-2">⛓</div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">
              Group Table {groupPrompt.source.number} with Table {groupPrompt.target.number}?
            </h2>
            <p className="text-sm text-gray-400 text-center mb-5">
              Grouped tables move together and seat one party — an order on either occupies both, until ungrouped.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setGroupPrompt(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Not now</button>
              <button onClick={confirmGroup} className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Add table modal */}
      {addingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAddingTable(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-72 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Add Table</h2>
            <p className="text-sm text-gray-400 mb-4">The table will appear on the floor plan.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
            <input
              type="number" value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTable()}
              autoFocus min="1" placeholder="e.g. 7"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 mb-2"
            />
            {addError && <p className="text-red-500 text-xs mb-2">{addError}</p>}
            <div className="flex gap-3 mt-2">
              <button onClick={() => setAddingTable(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={addTable} className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Manager PIN for delete */}
      <ManagerPinModal
        isOpen={pinOpen}
        onClose={() => { setPinOpen(false); setPendingDelete(null) }}
        onSuccess={handlePinSuccess}
      />
      {dialog}
    </div>
  )
}
