import { NextResponse } from 'next/server'
import { verifyManagerJwt, verifyPosJwt, hasStaffSession, MANAGER_COOKIE, POS_COOKIE } from '@/lib/auth'
import { isPublicZone } from '@/lib/zone'
import { requestPathUrl } from '@/lib/requestUrl'

// Pages reachable from the internet (customer-facing only).
const PUBLIC_PAGES = [/^\/$/, /^\/order(\/|$)/, /^\/onlineorder(\/|$)/, /^\/loyalty(\/|$)/, /^\/privacy(\/|$)/]

// API routes reachable from the internet, by method. Everything else is
// LAN-only. Dual-use endpoints (menu read vs admin write) only allow GET here.
const PUBLIC_API = {
  GET: [
    /^\/api\/products(\/|$)/,
    /^\/api\/categories(\/|$)/,
    /^\/api\/customers$/,
    /^\/api\/orders\/online$/,
    /^\/api\/orders\/track\//,
    /^\/api\/orders\/lookup$/,
    /^\/api\/payment-settings\/public$/,
    /^\/api\/health$/,
  ],
  POST: [
    /^\/api\/orders\/online$/,
    /^\/api\/webhooks\/stripe$/,
    /^\/api\/webhooks\/square$/,
    /^\/api\/vouchers\/validate$/,
  ],
}

// LAN API routes that must answer BEFORE a staff session exists, or that carry
// their own proof of origin. Everything else on the LAN now requires a signed-in
// staff member: the shop Wi-Fi is the same network as the POS, so "reachable on
// the LAN" is not evidence of being staff — any customer's phone qualifies.
const LAN_BOOTSTRAP_API = [
  // The login screen itself: the user picker plus the PIN/password endpoints.
  // All of these are failed-attempt limited in their own handlers.
  /^\/api\/auth\//,
  /^\/api\/users\/list$/,
  // Signature-verified, so the signature is the auth. Listed here as a safety
  // net: in production these arrive through the public zone and return above,
  // but if the tunnel ever fails to set the zone header we must not start
  // rejecting payment callbacks.
  /^\/api\/webhooks\//,
  // Vercel Cron carries a CRON_SECRET Bearer token, not a session cookie, and
  // the handler checks it itself — so it must reach the handler rather than be
  // stopped at the session gate. Inert off the demo deployment regardless.
  /^\/api\/demo\/reseed$/,
  // Uptime monitoring and runtime-served product images.
  /^\/api\/health$/,
  /^\/api\/uploads\//,
]

function matchesAny(patterns, pathname) {
  return patterns.some((re) => re.test(pathname))
}

export async function proxy(request) {
  const { pathname } = request.nextUrl

  // Internet-facing requests: only the customer allowlist is permitted.
  if (isPublicZone(request)) {
    if (pathname.startsWith('/api/')) {
      const allowed = PUBLIC_API[request.method] ?? []
      if (matchesAny(allowed, pathname)) return NextResponse.next()
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (matchesAny(PUBLIC_PAGES, pathname)) return NextResponse.next()
    if (pathname.startsWith('/uploads/products/')) return NextResponse.next()
    // Hide the existence of staff routes from the internet.
    return NextResponse.redirect(requestPathUrl(request, '/'))
  }

  // LAN data APIs: default-deny. The staff page gates below are otherwise
  // cosmetic — they protect the pages, not the APIs behind them, so anyone on
  // the shop Wi-Fi could read sales, forge cash movements, or rewrite prices by
  // calling the routes directly. Gating here rather than per-route means a newly
  // added route is protected by default instead of opt-in.
  if (pathname.startsWith('/api/')) {
    if (matchesAny(LAN_BOOTSTRAP_API, pathname)) return NextResponse.next()
    if (await hasStaffSession(request.cookies)) return NextResponse.next()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (pathname === '/') return NextResponse.next()

  // The POS staff login page is always reachable on the LAN.
  if (pathname === '/login') return NextResponse.next()

  // Staff operational pages require a POS staff session (any ACTIVE user signed
  // in by PIN), so the till isn't usable by anyone who merely reaches the shop
  // LAN (e.g. a guest on the Wi-Fi). Defence-in-depth on top of network security.
  if (/^\/(pos|tables|online|orders|reservations)(\/|$)/.test(pathname)) {
    const posToken = request.cookies.get(POS_COOKIE)?.value
    const pos = posToken ? await verifyPosJwt(posToken) : null
    if (!pos) {
      const url = requestPathUrl(request, '/login')
      if (pathname !== '/pos') url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Manager panel — needs the 1h manager session (MANAGER or ADMIN).
  if (pathname.startsWith('/manager')) {
    const token = request.cookies.get(MANAGER_COOKIE)?.value
    const payload = token ? await verifyManagerJwt(token) : null
    if (!payload || !['MANAGER', 'ADMIN'].includes(payload.role)) {
      const url = requestPathUrl(request, '/pos')
      url.searchParams.set('managerRequired', '1')
      return NextResponse.redirect(url)
    }
  }

  // Admin (Owner) panel — gated by the short-lived admin token alone, independent
  // of any manager session (the Admin PIN by itself grants entry). The gate lives
  // in src/app/admin/layout.js, which re-prompts the Admin PIN *in place* on a
  // missing/expired token, so we deliberately DON'T redirect here (a redirect is
  // what caused the old bounce-back). This is safe on the LAN: the public zone is
  // already locked above, and every /admin/* data API is independently ADMIN-gated.

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|offline.html|icon.svg).*)'],
}
