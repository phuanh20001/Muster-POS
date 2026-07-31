// Combos are Products with isCombo=true (fixed price on Product.price). Their
// makeup lives in ComboSlot/ComboSlotOption. Shared shape + slot-build helper
// used by the combo API routes.

import { prisma } from '@/lib/prisma'

// Combos live in their own dedicated category so they get a single tab in the
// POS instead of being scattered across food/drink categories. Created lazily
// on the first combo (no empty tab before then).
export const COMBO_CATEGORY_NAME = 'Combos'

export async function getOrCreateComboCategory() {
  const existing = await prisma.category.findFirst({ where: { name: COMBO_CATEGORY_NAME } })
  if (existing) return existing
  return prisma.category.create({
    data: { name: COMBO_CATEGORY_NAME, emoji: '🍔', color: '#F59E0B' },
  })
}

export const comboInclude = {
  category: true,
  comboSlots: {
    orderBy: { sortOrder: 'asc' },
    include: { options: { include: { product: { select: { id: true, name: true, imageEmoji: true } } } } },
  },
}

export function buildSlotsCreate(slots) {
  return (slots ?? [])
    .filter((s) => Array.isArray(s.options) && s.options.length > 0)
    .map((s, idx) => ({
      label: s.label ?? '',
      sortOrder: idx,
      options: { create: s.options.map((pid) => ({ productId: parseInt(pid) })) },
    }))
}
