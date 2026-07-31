import { NextResponse } from 'next/server'
import { getPaymentSettings } from '@/lib/paymentSettings'
import { getFeatureSettings } from '@/lib/featureSettings'
import { getOnlineOrderStatus } from '@/lib/onlineOrderSettings'

// Public, display-only surcharge — lets the customer order page show the card
// surcharge before redirecting to Stripe. Returns only the surcharge (no blocked
// brands, no auth) plus whether vouchers are accepted (to show/hide the code
// field); the authoritative amount is still recomputed server-side at checkout.
// Also returns whether the shop is currently accepting online orders, so the
// page can show a "closed" state — the authoritative check is in POST
// /api/orders/online. Whitelisted in src/proxy.js for the public zone.
export async function GET() {
  try {
    const { cardSurchargeType, cardSurchargeValue } = await getPaymentSettings()
    const { vouchersEnabled } = await getFeatureSettings()
    const shop = await getOnlineOrderStatus()
    return NextResponse.json({
      cardSurchargeType,
      cardSurchargeValue,
      vouchersEnabled,
      ordering: {
        open: shop.open,
        reason: shop.reason,
        today: shop.today,
        nextOpen: shop.nextOpen,
        hoursEnabled: shop.hoursEnabled,
        closedMessage: shop.closedMessage,
      },
    })
  } catch {
    // Fail open on display: the POST gate still refuses a closed-shop order.
    return NextResponse.json({
      cardSurchargeType: '',
      cardSurchargeValue: 0,
      vouchersEnabled: false,
      ordering: { open: true, reason: null, today: null, nextOpen: null, hoursEnabled: false, closedMessage: '' },
    })
  }
}
