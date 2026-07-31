import { prisma } from '@/lib/prisma'
import { CARD_BRANDS } from '@/lib/cardBrands'
import { D, roundCents, lte } from '@/lib/money'
import { clampTerminalWait, TERMINAL_DEADLINE_SECONDS } from '@/lib/terminalDeadline'

export { CARD_BRANDS }

export async function getPaymentSettings() {
  let settings = null
  try {
    settings = await prisma.paymentSettings.findUnique({ where: { id: 1 } })
  } catch {
    // table not ready (pre-migration) — fall back to defaults
  }
  return {
    cardSurchargeType: settings?.cardSurchargeType || '',
    cardSurchargeValue: settings?.cardSurchargeValue || 0,
    blockedBrands: settings?.blockedBrands || [],
    provider: settings?.provider || 'STRIPE',
    onlineProvider: settings?.onlineProvider || settings?.provider || 'STRIPE',
    terminalWaitSeconds: settings?.terminalWaitSeconds != null
      ? clampTerminalWait(settings.terminalWaitSeconds)
      : TERMINAL_DEADLINE_SECONDS,
  }
}

// Flat surcharge applied to any card payment, computed from a pre-surcharge base.
// Returns a Decimal.
export function computeCardSurcharge(settings, base) {
  const value = D(settings.cardSurchargeValue ?? 0)
  const dBase = D(base)
  if (!settings.cardSurchargeType || lte(value, 0) || lte(dBase, 0)) return D(0)
  const amount = settings.cardSurchargeType === 'PERCENT' ? dBase.times(value.div(100)) : value
  return roundCents(amount)
}

// Map stored canonical brand keys to the online brands_blocked values.
export function blockedBrandsOnline(blockedKeys) {
  return CARD_BRANDS.filter((b) => blockedKeys.includes(b.key)).map((b) => b.online)
}

// Is the brand Stripe reported on an in-person tap one we block?
export function isBrandBlocked(blockedKeys, cardPresentBrand) {
  if (!cardPresentBrand) return false
  const match = CARD_BRANDS.find((b) => b.cardPresent === cardPresentBrand.toLowerCase())
  return !!match && blockedKeys.includes(match.key)
}

export function brandLabel(cardPresentBrand) {
  const match = CARD_BRANDS.find((b) => b.cardPresent === (cardPresentBrand || '').toLowerCase())
  return match ? match.label : cardPresentBrand
}
