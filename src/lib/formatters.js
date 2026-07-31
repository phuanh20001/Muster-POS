import { D } from '@/lib/money'

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(D(amount).toNumber())
}

export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)}`
}

// Local (wall-clock) calendar day as YYYY-MM-DD. Must NOT use toISOString() —
// that returns the UTC day, which is off by one near midnight in any non-UTC
// timezone and skews "today" everywhere this feeds date filters/reports.
export function formatDateForApi(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The short per-day reference. Staff use it internally (dockets, matching a docket
// back to the POS); the only places a customer sees it are the online tracking page
// and a printed receipt — in-store customers are called by table or name, which is
// why orderLocationLabel, not this, is the docket's headline. Falls back to the
// permanent id for orders with no ticket number — anything created before this
// feature, and online orders still AWAITING_PAYMENT — so a label is never blank.
export function orderTicketLabel(order) {
  return `#${order.dailyNumber ?? order.id}`
}

// Admin/reporting variant. A ticket number repeats every day, so history, refund
// and audit views need the permanent id alongside it to stay unambiguous.
export function orderTicketWithId(order) {
  if (order.dailyNumber == null) return `#${order.id}`
  return `#${order.dailyNumber} · id ${order.id}`
}

export function orderLocationLabel(order) {
  if (order.tableId || order.tableManual) return `Table ${order.tableNumber}`
  if (order.tableNumber) return order.tableNumber
  if (order.source === 'ONLINE') return 'Takeaway (Online)'
  return 'Takeaway'
}

export function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
