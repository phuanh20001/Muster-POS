// Simple in-memory fixed-window rate limiter. Adequate for a single
// shop-hosted instance; not shared across processes.

const buckets = new Map()
const credentialFailures = new Map()

const PRUNE_INTERVAL_MS = 10 * 60000
let lastPrune = Date.now()

function pruneExpired(now) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, entry] of buckets) {
    if (now > entry.reset) buckets.delete(key)
  }
  for (const [key, entry] of credentialFailures) {
    if (now > entry.until) credentialFailures.delete(key)
  }
}

export function clientIp(request) {
  // Cloudflare sets CF-Connecting-IP at the edge and overwrites any client-sent
  // value, so it can't be spoofed — unlike X-Forwarded-For, whose first entry a
  // client can forge to dodge per-IP limits. Prefer it; fall back for LAN/dev.
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

export function rateLimit(key, { limit = 10, windowMs = 60000 } = {}) {
  const now = Date.now()
  pruneExpired(now)
  const entry = buckets.get(key)

  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }

  entry.count += 1
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) }
  }
  return { ok: true, remaining: limit - entry.count }
}

// Failed-credential lockout for the PIN/password endpoints.
//
// A 4-digit PIN is only 10,000 combinations, so without this an attacker on the
// shop LAN can grind the whole keyspace — changing the PIN doesn't help, only
// limiting the attempt rate does. Counts FAILURES only (a success clears them),
// so ordinary staff mistyping never accumulates toward a lockout.
//
// Every call takes an ARRAY of keys, checked and recorded together: we lock on
// both the caller's IP and the targeted userId, so an attacker can neither
// rotate IPs to keep hammering one account nor sit on one IP and spray many.
const CREDENTIAL_LIMIT = 5
const CREDENTIAL_WINDOW_MS = 15 * 60000

export function credentialKeys(ip, userId) {
  return [`cred:ip:${ip}`, `cred:user:${userId}`]
}

export function credentialLocked(keys, { limit = CREDENTIAL_LIMIT } = {}) {
  const now = Date.now()
  pruneExpired(now)
  for (const key of keys) {
    const entry = credentialFailures.get(key)
    if (entry && now < entry.until && entry.count >= limit) {
      return { locked: true, retryAfter: Math.ceil((entry.until - now) / 1000) }
    }
  }
  return { locked: false }
}

export function recordCredentialFailure(keys, { windowMs = CREDENTIAL_WINDOW_MS } = {}) {
  const now = Date.now()
  for (const key of keys) {
    const entry = credentialFailures.get(key)
    // The window is NOT extended once a lockout is active, so a locked-out staff
    // member is guaranteed to be back in after windowMs rather than being pushed
    // out further by their own retries.
    if (!entry || now > entry.until) credentialFailures.set(key, { count: 1, until: now + windowMs })
    else entry.count += 1
  }
}

export function clearCredentialFailures(keys) {
  for (const key of keys) credentialFailures.delete(key)
}
