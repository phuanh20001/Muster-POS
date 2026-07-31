import { prisma } from '@/lib/prisma'

export async function getFeatureSettings() {
  let settings = null
  try {
    settings = await prisma.featureSettings.findUnique({ where: { id: 1 } })
  } catch {
    // table not ready (pre-migration) — fall back to defaults (both off)
  }
  return {
    expensesEnabled: settings?.expensesEnabled ?? false,
    purchasingEnabled: settings?.purchasingEnabled ?? false,
    productImagesEnabled: settings?.productImagesEnabled ?? true,
    vouchersEnabled: settings?.vouchersEnabled ?? false,
    manualTableNumbers: settings?.manualTableNumbers ?? false,
    tableNumberMax: settings?.tableNumberMax ?? 20,
  }
}
