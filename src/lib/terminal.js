import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

// Stripe Terminal, server-driven smart-reader integration. The reader maintains
// its own connection to Stripe; the server creates a PaymentIntent and tells the
// reader to process it. Card data never touches this app (PCI scope stays minimal).

// Pin the API version so a future SDK reinstall can't silently change request/
// response shapes, and so Stripe retiring an old version is a scheduled event we
// control rather than a surprise outage. Matches the stripe@22 SDK default.
export function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
}

export function isTestMode() {
  return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test')
}

export function currency() {
  return process.env.STRIPE_CURRENCY || 'aud'
}

export async function resolveReaderId(name = 'COUNTER') {
  try {
    const cfg = await prisma.terminalReader.findUnique({ where: { name } })
    if (cfg && cfg.enabled && cfg.stripeReaderId) return cfg.stripeReaderId
  } catch {
    // table not ready — fall back to env
  }
  return process.env.STRIPE_TERMINAL_READER_ID || null
}

export async function terminalEnabled() {
  return (await resolveReaderId()) != null
}
