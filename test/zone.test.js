import test from 'node:test'
import assert from 'node:assert/strict'
import { isPublicZone } from '@/lib/zone'

// A minimal Request-like object: only headers.get is used by isPublicZone.
const req = (zoneHeader) => ({
  headers: { get: (k) => (k === 'x-dreamy-zone' ? zoneHeader ?? null : null) },
})

test('with no PUBLIC_ZONE_SECRET set, everything is LAN (dev behaviour)', () => {
  delete process.env.PUBLIC_ZONE_SECRET
  assert.equal(isPublicZone(req('anything')), false)
  assert.equal(isPublicZone(req(null)), false)
})

test('a request whose header matches the secret is public', () => {
  process.env.PUBLIC_ZONE_SECRET = 's3cret'
  assert.equal(isPublicZone(req('s3cret')), true)
})

test('SECURITY: a missing or mismatched header is treated as LAN, never public', () => {
  process.env.PUBLIC_ZONE_SECRET = 's3cret'
  // The edge SETS this header on the public hostname; a request that can't
  // present the exact secret must NOT be granted public-zone treatment.
  assert.equal(isPublicZone(req(null)), false)
  assert.equal(isPublicZone(req('')), false)
  assert.equal(isPublicZone(req('wrong')), false)
  assert.equal(isPublicZone(req('S3CRET')), false) // case-sensitive
  assert.equal(isPublicZone(req('s3cret ')), false) // no trimming - exact match only
})

test.after(() => { delete process.env.PUBLIC_ZONE_SECRET })
