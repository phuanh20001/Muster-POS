import { SignJWT, jwtVerify } from 'jose'
import { canEditClockTarget } from './clockEdit'

export { canEditClockTarget } from './clockEdit'

// Fail fast rather than fall back to a hardcoded key: a known signing secret
// would let anyone forge a manager/admin session.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set — refusing to start with an insecure default signing key')
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

export const MANAGER_COOKIE = 'manager_session'
// Separate, short-lived token for the Owner (Admin) area. Kept independent of the
// manager session so admin power is never "left logged in" — it self-expires and
// is re-prompted on entry. Having a manager session never implies an admin one.
export const ADMIN_COOKIE = 'admin_session'
// POS staff session — any ACTIVE user signed in by PIN. Gates the staff
// operational pages so the till isn't usable by anyone who merely reaches the
// LAN. Lives a full shift (12h) so staff aren't logged out mid-service.
export const POS_COOKIE = 'pos_session'
export const MANAGER_TTL = '1h'
export const MANAGER_MAX_AGE_SECONDS = 60 * 60
const ADMIN_TTL = '5m'
const POS_TTL = '12h'
export const POS_MAX_AGE_SECONDS = 60 * 60 * 12

// `secure` is env-gated so it can be switched on only once every device reaches
// the app over HTTPS (LAN tablets via the Caddy TLS proxy; the public tunnel and
// the loopback till kiosk are already secure contexts). Enabling it while a tablet
// is still on plaintext http would make the browser drop the cookie and silently
// break login there — see docs/lan-tls.md.
export const SESSION_COOKIE_OPTS = { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env.SESSION_COOKIE_SECURE === '1' }

export function clearSessionCookie(cookieStore, name) {
  cookieStore.set(name, '', { ...SESSION_COOKIE_OPTS, maxAge: 0, expires: new Date(0) })
}

export async function signManagerJwt(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(MANAGER_TTL)
    .sign(SECRET)
}

export async function verifyManagerJwt(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload
  } catch {
    return null
  }
}

export async function signAdminJwt(payload) {
  return new SignJWT({ ...payload, scope: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(ADMIN_TTL)
    .sign(SECRET)
}

// Valid only if the token verifies, is the admin scope, and is an ADMIN role.
export async function verifyAdminJwt(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (payload?.scope !== 'admin' || payload?.role !== 'ADMIN') return null
    return payload
  } catch {
    return null
  }
}

export async function signPosJwt(payload) {
  return new SignJWT({ ...payload, scope: 'pos' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(POS_TTL)
    .sign(SECRET)
}

export async function verifyPosJwt(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    if (payload?.scope !== 'pos') return null
    return payload
  } catch {
    return null
  }
}

export async function verifyPosAccess(cookieStore) {
  const token = cookieStore.get(POS_COOKIE)?.value
  return token ? verifyPosJwt(token) : null
}

export function hasAdminOrManagerRole(payload) {
  return ['MANAGER', 'ADMIN'].includes(payload?.role)
}

// Owner (Admin) writes: valid admin_session OR manager_session with ADMIN role.
export async function verifyAdminAccess(cookieStore) {
  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value
  const admin = adminToken ? await verifyAdminJwt(adminToken) : null
  if (admin) return admin

  const managerToken = cookieStore.get(MANAGER_COOKIE)?.value
  const manager = managerToken ? await verifyManagerJwt(managerToken) : null
  if (manager?.role === 'ADMIN') return manager

  return null
}

// Payments reader config: admin_session or any manager_session (MANAGER/ADMIN).
export async function verifyAdminOrManagerAccess(cookieStore) {
  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value
  const admin = adminToken ? await verifyAdminJwt(adminToken) : null
  if (admin) return admin

  const managerToken = cookieStore.get(MANAGER_COOKIE)?.value
  const manager = managerToken ? await verifyManagerJwt(managerToken) : null
  if (manager && hasAdminOrManagerRole(manager)) return manager

  return null
}

export async function verifyManagerAccess(cookieStore) {
  const token = cookieStore.get(MANAGER_COOKIE)?.value
  const payload = token ? await verifyManagerJwt(token) : null
  if (payload && hasAdminOrManagerRole(payload)) return payload
  return null
}

export async function verifyUsersPanelAccess(cookieStore) {
  return (await verifyManagerAccess(cookieStore)) || (await verifyAdminAccess(cookieStore))
}

export async function verifyAdminRoleViaManagerCookie(cookieStore) {
  const token = cookieStore.get(MANAGER_COOKIE)?.value
  const payload = token ? await verifyManagerJwt(token) : null
  if (payload?.role === 'ADMIN') return payload
  return null
}

export async function verifyManagerRoleOnly(cookieStore) {
  const token = cookieStore.get(MANAGER_COOKIE)?.value
  const payload = token ? await verifyManagerJwt(token) : null
  if (payload?.role === 'MANAGER') return payload
  return null
}

export async function verifyClockEditorAccess(cookieStore) {
  const adminToken = cookieStore.get(ADMIN_COOKIE)?.value
  const admin = adminToken ? await verifyAdminJwt(adminToken) : null
  if (admin) return admin

  const managerToken = cookieStore.get(MANAGER_COOKIE)?.value
  const manager = managerToken ? await verifyManagerJwt(managerToken) : null
  if (manager?.role === 'MANAGER' || manager?.role === 'ADMIN') return manager

  return null
}

export async function verifyOwnerAccess(cookieStore) {
  const token = cookieStore.get(ADMIN_COOKIE)?.value
  return token ? verifyAdminJwt(token) : null
}

// Any signed-in staff member — the coarse gate the proxy applies to LAN API
// requests. Accepts a POS, manager, or admin session because the panels are
// reachable independently: the Owner can open /admin and enter the Admin PIN
// without ever having started a POS session, so requiring POS alone would lock
// them out of every /admin data route.
export async function hasStaffSession(cookieStore) {
  if (await verifyPosAccess(cookieStore)) return true
  if (await verifyManagerAccess(cookieStore)) return true
  if (await verifyAdminAccess(cookieStore)) return true
  return false
}
