import { requestOrigin, requestPathUrl } from '../src/lib/requestUrl.js'

function mockRequest({ url, host, proto }) {
  const headers = new Map()
  if (host) headers.set('host', host)
  if (proto) headers.set('x-forwarded-proto', proto)
  return {
    url,
    headers: { get: (k) => headers.get(k) ?? null },
  }
}

const req = mockRequest({
  url: 'http://localhost:3000/api/auth/pos',
  host: '192.168.0.40:3000',
})
const dest = requestPathUrl(req, '/pos')
if (dest.href !== 'http://192.168.0.40:3000/pos') {
  console.error('FAIL: expected http://192.168.0.40:3000/pos got', dest.href)
  process.exit(1)
}
if (requestOrigin(req) !== 'http://192.168.0.40:3000') {
  console.error('FAIL: origin')
  process.exit(1)
}
console.log('requestUrl OK')
