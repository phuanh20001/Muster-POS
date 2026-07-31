import { formatDateForApi } from '@/lib/formatters'

export function getClientDateRange(preset) {
  const now = new Date()
  const today = formatDateForApi(now)

  if (preset === 'today') return { from: today, to: today }

  if (preset === 'yesterday') {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    const s = formatDateForApi(y)
    return { from: s, to: s }
  }

  if (preset === '7days') {
    const s = new Date(now)
    s.setDate(s.getDate() - 6)
    return { from: formatDateForApi(s), to: today }
  }

  if (preset === 'month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: formatDateForApi(s), to: today }
  }

  if (preset === 'calendarMonth') {
    const d = new Date(today + 'T00:00:00')
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { from: formatDateForApi(first), to: formatDateForApi(last) }
  }

  if (preset === 'week') {
    const d = new Date(today + 'T00:00:00')
    const day = d.getDay()
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((day + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: formatDateForApi(monday), to: formatDateForApi(sunday) }
  }

  return null
}
