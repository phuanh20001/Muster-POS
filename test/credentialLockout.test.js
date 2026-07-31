import test from 'node:test'
import assert from 'node:assert/strict'
import { credentialKeys, credentialLocked, recordCredentialFailure, clearCredentialFailures } from '@/lib/ratelimit'
import { isValidPinFormat, PIN_LENGTH } from '@/lib/pinAttempts'

// Unique identifiers per test — the failure map is module-level state shared
// across tests in this file.
let n = 0
const freshKeys = () => credentialKeys(`10.0.0.${++n}`, `user-${n}`)

test('a fresh identity is not locked', () => {
  assert.equal(credentialLocked(freshKeys()).locked, false)
})

test('locks only after exceeding the failure limit, not on the first mistype', () => {
  const keys = freshKeys()
  for (let i = 0; i < 4; i++) {
    recordCredentialFailure(keys)
    assert.equal(credentialLocked(keys).locked, false, `should stay unlocked after ${i + 1} failures`)
  }
  recordCredentialFailure(keys)
  assert.equal(credentialLocked(keys).locked, true, 'should lock on the 5th failure')
})

test('a successful login clears the accumulated failures', () => {
  const keys = freshKeys()
  for (let i = 0; i < 4; i++) recordCredentialFailure(keys)
  clearCredentialFailures(keys)
  for (let i = 0; i < 4; i++) recordCredentialFailure(keys)
  assert.equal(credentialLocked(keys).locked, false, 'the pre-success failures must not carry over')
})

test('SECURITY: rotating IP does not reset the lock on the targeted account', () => {
  // The attack this defends against: grind one admin PIN from many source IPs.
  // The userId key is shared across those attempts, so the account stays locked.
  const userId = `victim-${++n}`
  for (let i = 0; i < 5; i++) recordCredentialFailure(credentialKeys(`192.168.1.${i}`, userId))
  assert.equal(credentialLocked(credentialKeys('192.168.1.99', userId)).locked, true)
})

test('SECURITY: spraying many accounts from one IP locks that IP', () => {
  // The mirror attack: try one PIN against every staff account in turn. Each
  // account stays under its own limit, so only the shared IP key catches it.
  const ip = `172.16.0.${++n}`
  for (let i = 0; i < 5; i++) recordCredentialFailure(credentialKeys(ip, `sprayed-${n}-${i}`))
  assert.equal(credentialLocked(credentialKeys(ip, `sprayed-${n}-fresh`)).locked, true)
})

test('a lock expires once its window passes', () => {
  const keys = freshKeys()
  for (let i = 0; i < 5; i++) recordCredentialFailure(keys, { windowMs: 1 })
  assert.equal(credentialLocked(keys).locked, true)
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(credentialLocked(keys).locked, false)
    resolve()
  }, 10))
})

test('a locked response reports a positive retry-after', () => {
  const keys = freshKeys()
  for (let i = 0; i < 5; i++) recordCredentialFailure(keys)
  const lock = credentialLocked(keys)
  assert.ok(lock.retryAfter > 0, 'retryAfter must be a usable number of seconds')
})

test('SECURITY: server-side PIN format rejects anything but exactly N digits', () => {
  assert.equal(isValidPinFormat('1234'), true)
  assert.equal(isValidPinFormat(1234), true, 'numeric input is coerced, not rejected')
  assert.equal(isValidPinFormat('123'), false)
  assert.equal(isValidPinFormat('12345'), false)
  assert.equal(isValidPinFormat(''), false)
  assert.equal(isValidPinFormat('12a4'), false)
  assert.equal(isValidPinFormat(' 1234'), false)
  assert.equal(isValidPinFormat('1234\n'), false, 'a trailing newline must not slip past the anchors')
  assert.equal(isValidPinFormat(null), false)
  assert.equal(isValidPinFormat(undefined), false)
  assert.equal(PIN_LENGTH, 4)
})
