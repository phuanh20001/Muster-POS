export function requestOrigin(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!host) return new URL(request.url).origin
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return `${proto}://${host.split(',')[0].trim()}`
}

export function requestPathUrl(request, pathname) {
  return new URL(pathname, requestOrigin(request))
}
