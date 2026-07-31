export function publicCustomerLookupResponse(customer) {
  if (!customer) return { found: false }
  return {
    found: true,
    stampsCollected: customer.stampsCollected,
    stampsRedeemed: customer.stampsRedeemed,
    freeItems: Math.floor(customer.stampsCollected / 9) - customer.stampsRedeemed,
  }
}
