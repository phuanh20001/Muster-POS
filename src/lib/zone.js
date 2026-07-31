// Distinguishes internet-facing ("public") requests from trusted LAN requests.
//
// In production the staff POS runs on the shop LAN and is never exposed directly.
// Only customer routes are published to the internet through a tunnel (e.g.
// Cloudflare Tunnel). A Cloudflare Transform Rule must SET the header
// `x-dreamy-zone` to the value of PUBLIC_ZONE_SECRET on every request to the
// public hostname (SET, so a client cannot forge or strip it). Requests that
// arrive without the secret came from the LAN and are trusted.
//
// If PUBLIC_ZONE_SECRET is unset (local dev), everything is treated as LAN so
// the app behaves as before.

export function isPublicZone(request) {
  const secret = process.env.PUBLIC_ZONE_SECRET
  if (!secret) return false
  return request.headers.get('x-dreamy-zone') === secret
}
