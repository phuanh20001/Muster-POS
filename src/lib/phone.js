const AU_PHONE_RE = /^0(4\d{8}|[2378]\d{8})$/

export function sanitizePhoneInput(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('61')) return digits.slice(0, 11)
  return digits.slice(0, 10)
}

export function normalizeAuPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('61') && digits.length >= 11) return `0${digits.slice(2, 11)}`
  if (digits.startsWith('61') && digits.length === 10) return `0${digits.slice(2)}`
  if (digits.length === 9 && digits.startsWith('4')) return `0${digits}`
  if (digits.length === 10 && digits.startsWith('0')) return digits
  return digits.slice(0, 10)
}

export function isValidAuPhone(raw) {
  return AU_PHONE_RE.test(normalizeAuPhone(raw))
}

export function auPhoneError(raw) {
  if (!String(raw ?? '').replace(/\D/g, '')) return 'Please enter your phone number.'
  if (!isValidAuPhone(raw)) return 'Enter a valid 10-digit Australian phone number (e.g. 0412 345 678).'
  return ''
}

export function formatAuPhoneDisplay(raw) {
  const digits = sanitizePhoneInput(raw)
  if (digits.startsWith('61') && digits.length > 2) {
    const local = digits.slice(2)
    if (local.length <= 3) return `+61 ${local}`
    if (local.length <= 6) return `+61 ${local.slice(0, 3)} ${local.slice(3)}`
    return `+61 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 9)}`
  }
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`
}
