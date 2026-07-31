import { prisma } from '@/lib/prisma'
import { itemsSubtotal } from '@/lib/orderTotals'

const MAX_QUANTITY = 99

export function subtotalFromItems(items) {
  return itemsSubtotal(items, { includeAdjustments: false })
}

export function parsePickupNote(note) {
  const match = note?.match(/Pickup: (.+?) \| (.+)/)
  if (!match) return null
  const name = match[1]?.trim()
  const phone = match[2]?.trim()
  if (!name || !phone) return null
  return { name, phone }
}

// `loadProducts` is injectable so this recompute boundary — the guard that
// ignores client-supplied prices and rebuilds them from the DB — can be unit
// tested without a database. Production callers pass nothing and hit Prisma.
async function loadProductsFromDb(productIds) {
  return prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      sizes: { orderBy: { id: 'asc' } },
      modifiers: { where: { available: true }, orderBy: { id: 'asc' } },
      category: {
        include: {
          modifiers: { where: { available: true }, orderBy: { id: 'asc' } },
        },
      },
    },
  })
}

export async function resolveOnlineOrderItems(rawItems, { loadProducts = loadProductsFromDb } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'Items are required' }
  }

  const productIds = [
    ...new Set(
      rawItems
        .map((item) => parseInt(item.productId, 10))
        .filter((id) => Number.isFinite(id))
    ),
  ]

  if (productIds.length === 0) {
    return { ok: false, error: 'Invalid items' }
  }

  const products = await loadProducts(productIds)

  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const resolved = []

  for (const raw of rawItems) {
    const productId = parseInt(raw.productId, 10)
    const quantity = parseInt(raw.quantity, 10)

    if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: 'Invalid item quantity' }
    }
    if (quantity > MAX_QUANTITY) {
      return { ok: false, error: `Maximum ${MAX_QUANTITY} per item` }
    }

    const product = byId[productId]
    if (!product) return { ok: false, error: 'Product not found' }
    // Combos are POS-only; never accept them through the public online channel.
    if (product.isCombo) return { ok: false, error: 'Product not found' }
    if (!product.available) return { ok: false, error: `${product.name} is not available` }
    if (product.stock != null && product.stock < quantity) {
      return { ok: false, error: `${product.name} is out of stock` }
    }

    const hasSizes = product.sizes.length > 0
    const sizeLabel = typeof raw.size === 'string' ? raw.size.trim() : ''
    let unitPrice

    if (hasSizes) {
      if (!sizeLabel) return { ok: false, error: `Size required for ${product.name}` }
      const size = product.sizes.find((s) => s.label === sizeLabel)
      if (!size) return { ok: false, error: `Invalid size for ${product.name}` }
      unitPrice = size.price
    } else {
      unitPrice = product.price
    }

    const rawMods = Array.isArray(raw.modifiers) ? raw.modifiers : []
    const seen = new Set()
    const modifiers = []

    // A product's own modifiers override its category's — once it has any, the
    // category add-ons are suppressed for it, so a stale client can't slip an
    // inherited category modifier onto a product that no longer offers them.
    const hasOwnMods = (product.modifiers ?? []).length > 0

    for (const m of rawMods) {
      const modId = parseInt(m.id, 10)
      if (!Number.isFinite(modId)) return { ok: false, error: 'Invalid modifier' }

      const source = m.source === 'category' ? 'category' : 'product'
      const key = `${source}-${modId}`
      if (seen.has(key)) continue
      seen.add(key)

      const pool = source === 'category'
        ? (hasOwnMods ? [] : (product.category?.modifiers ?? []))
        : product.modifiers
      const row = pool.find((r) => r.id === modId)
      if (!row) return { ok: false, error: `Invalid modifier for ${product.name}` }

      modifiers.push({ id: row.id, name: row.name, price: row.price, source })
    }

    resolved.push({
      productId: product.id,
      productName: product.name,
      unitPrice,
      loyaltyEnabled: product.loyaltyEnabled,
      size: hasSizes ? sizeLabel : '',
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) : '',
      quantity,
      modifiers,
    })
  }

  return { ok: true, items: resolved }
}
