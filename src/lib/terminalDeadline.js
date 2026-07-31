// Single source of truth for the in-person card wait window, shared by the
// server (Square checkout deadlineDuration) and the client poll timeout, so the
// reader's own cancel timer and the app's give-up timer fire together instead of
// one bailing while the other is still live. The value is configurable in
// Admin → Payments (PaymentSettings.terminalWaitSeconds); this is the default
// and the clamp bounds.
export const TERMINAL_DEADLINE_SECONDS = 120
export const TERMINAL_WAIT_MIN = 30
export const TERMINAL_WAIT_MAX = 300

export function clampTerminalWait(seconds) {
  const n = Math.round(Number(seconds))
  if (!Number.isFinite(n)) return TERMINAL_DEADLINE_SECONDS
  return Math.min(TERMINAL_WAIT_MAX, Math.max(TERMINAL_WAIT_MIN, n))
}

// ISO-8601 duration for Square's TerminalCheckout.deadlineDuration (e.g. PT120S).
export function terminalDeadlineIso(seconds = TERMINAL_DEADLINE_SECONDS) {
  return `PT${clampTerminalWait(seconds)}S`
}
