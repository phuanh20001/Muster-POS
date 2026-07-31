export const ORDER_STATUS = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
}

export const ORDER_STATUS_LABELS = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PENDING: 'Pending',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}

export const ORDER_STATUS_COLORS = {
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PREPARING: 'bg-blue-50 text-blue-700',
  READY: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-50 text-red-700',
  REFUNDED: 'bg-purple-50 text-purple-700',
}

export function statusBadgeClass(status) {
  return ORDER_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
}

export const ORDER_STATUS_CHIP = {
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
  PREPARING: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  READY: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  COMPLETED: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  CANCELLED: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-400' },
  REFUNDED: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
}

export function orderStatusChip(status) {
  return ORDER_STATUS_CHIP[status] ?? ORDER_STATUS_CHIP.PENDING
}

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  CARD: 'CARD',
}

export const KITCHEN_POLL_INTERVAL = 10000

export const PRINTER_STATION = {
  FRONT: 'FRONT',
  KITCHEN: 'KITCHEN',
}

// Shared emoji fallback icon set for products, combos, and categories.
export const MENU_EMOJI_OPTIONS = [
  '☕', '🥛', '🍵', '🧋', '🫖', '🥤', '🍹',
  '🥪', '🥯', '🍞', '🥐', '🥙', '🌯',
  '🍜', '🍝', '🍲', '🥣', '🍔', '🍱', '🥗', '🍟',
  '🍳', '🍗', '🥓', '🧀', '🥚', '🥑',
  '🧁', '🍰', '🍫', '🍪', '🍩', '🧊',
]
