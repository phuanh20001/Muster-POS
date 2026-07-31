const CACHE_MS = 12000
const DEFAULT_PROBE = 'https://1.1.1.1/cdn-cgi/trace'

let cachedResult = null
let cachedAt = 0

export async function checkInternetReachable() {
  const now = Date.now()
  if (cachedResult !== null && now - cachedAt < CACHE_MS) {
    return cachedResult
  }

  const url = process.env.CONNECTIVITY_PROBE_URL || DEFAULT_PROBE
  let reachable = false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' })
      reachable = res.ok
    } finally {
      clearTimeout(timer)
    }
  } catch {
    reachable = false
  }

  cachedResult = reachable
  cachedAt = now
  return reachable
}
