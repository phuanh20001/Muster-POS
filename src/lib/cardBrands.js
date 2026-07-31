// Canonical card-brand keys used internally and stored on PaymentSettings.
// Each maps to the value Stripe reports for an in-person tap
// (charge.payment_method_details.card_present.brand) and the value the online
// Checkout brand-restriction API expects (brands_blocked).
// Kept free of server-only imports so client components can use it too.
export const CARD_BRANDS = [
  { key: 'visa', label: 'Visa', cardPresent: 'visa', online: 'visa' },
  { key: 'mastercard', label: 'Mastercard', cardPresent: 'mastercard', online: 'mastercard' },
  { key: 'amex', label: 'American Express', cardPresent: 'amex', online: 'american_express' },
  { key: 'discover', label: 'Discover / Diners / JCB / UnionPay', cardPresent: 'discover', online: 'discover_global_network' },
]
