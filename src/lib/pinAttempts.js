// Shared shape for the PIN/password endpoints so all five behave identically.
//
// Deliberately free of `next/server` imports: the format check is pure logic and
// stays unit-testable without pulling the Next runtime into the test harness.

export const PIN_LENGTH = 4

// Server-side format check. The keypad UI already caps entry at PIN_LENGTH, but
// that is client-side only — a direct API call can send anything, so an
// oversized or non-numeric "PIN" must be rejected here too. Deliberately
// indistinguishable from a wrong PIN in the response, so probing the format
// tells an attacker nothing.
export function isValidPinFormat(pin) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(pin))
}

// A plain web Response — route handlers accept one just like a NextResponse.
export function lockedResponse(lock) {
  return Response.json(
    { error: 'Too many incorrect attempts. Try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(lock.retryAfter) } }
  )
}
