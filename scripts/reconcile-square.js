// Reconcile DreamyCafe's recorded Square card sales against Square's own records:
//   - confirms each order's stored Square payment exists and amounts match
//   - sums the ACTUAL processing fees Square charged (from payment.processingFee)
//   - lists recent Square payouts (money deposited to your bank), best-effort
//
// DreamyCafe is the system of record; Square only ever sees the card legs. This
// script verifies fees/payouts WITHOUT trusting Square for the full sales picture
// (cash + online Stripe never touch Square). Read-only: it never refunds or edits.
//
// Run:  node --env-file=.env scripts/reconcile-square.js
//       node --env-file=.env scripts/reconcile-square.js --from=2026-06-01 --to=2026-06-26
const { SquareClient, SquareEnvironment } = require('square')
const { PrismaClient } = require('@prisma/client')
const Decimal = require('decimal.js')

const prisma = new PrismaClient()

// Standalone CommonJS script can't import the ESM src/lib/money.js, so it uses
// decimal.js directly. d() mirrors D(): exact money, no floats.
function d(x) {
  if (x === null || x === undefined || x === '') return new Decimal(0)
  if (x instanceof Decimal) return x
  if (typeof x === 'object' && typeof x.toString === 'function') return new Decimal(x.toString())
  return new Decimal(x)
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

// Square stores money as BigInt minor units (cents). App works in dollars.
function toDollars(money) {
  if (!money || money.amount == null) return new Decimal(0)
  return d(money.amount.toString()).div(100)
}

function money(n) {
  return `$${d(n).toFixed(2)}`
}

// Mirror parseSquareRef in src/lib/paymentProvider.js: refs are "pay:<id>",
// "chk:<id>" (incomplete — no payment yet), or a bare payment id.
function paymentIdFromRef(ref) {
  if (!ref) return null
  if (ref.startsWith('chk:')) return null
  if (ref.startsWith('pay:')) return ref.slice(4)
  return ref
}

function recordedCardAmount(order) {
  if (order.paymentMethod === 'SPLIT') return Decimal.max(0, d(order.total).minus(d(order.cashAmount)))
  return d(order.total)
}

async function main() {
  const token = process.env.SQUARE_ACCESS_TOKEN
  const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase()
  const locationId = process.env.SQUARE_LOCATION_ID
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN missing in .env')

  const to = arg('to', new Date().toISOString().slice(0, 10))
  const from = arg('from', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)

  const client = new SquareClient({
    token,
    environment: env === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  })

  console.log(`Square reconciliation  (${env})`)
  console.log(`Date range            : ${from} .. ${to}\n`)

  const orders = await prisma.order.findMany({
    where: {
      paymentProvider: 'SQUARE',
      paymentIntentId: { not: null },
      createdAt: { gte: start, lte: end },
      status: { in: ['COMPLETED', 'REFUNDED'] },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (orders.length === 0) {
    console.log('No Square card orders found in this range.')
    console.log('(If you expected some, check the date range or that orders recorded paymentProvider=SQUARE.)')
  }

  let recordedTotal = new Decimal(0)
  let squareGross = new Decimal(0)
  let squareFees = new Decimal(0)
  let feesPending = new Decimal(0)
  const mismatches = []
  const missing = []

  for (const order of orders) {
    const ids = order.paymentIntentId.split(',').map(paymentIdFromRef).filter(Boolean)
    let orderGross = new Decimal(0)
    for (const pid of ids) {
      let payment
      try {
        const res = await client.payments.get({ paymentId: pid })
        payment = res.payment || res.result?.payment
      } catch (e) {
        missing.push({ id: order.id, pid, reason: String(e.message || e).split('\n')[0] })
        continue
      }
      if (!payment) {
        missing.push({ id: order.id, pid, reason: 'not found' })
        continue
      }
      orderGross = orderGross.plus(toDollars(payment.amountMoney))
      const fees = payment.processingFee || []
      if (fees.length === 0 && payment.status === 'COMPLETED') {
        feesPending = feesPending.plus(toDollars(payment.amountMoney))
      }
      for (const fee of fees) squareFees = squareFees.plus(toDollars(fee.amountMoney))
    }
    const recorded = recordedCardAmount(order)
    recordedTotal = recordedTotal.plus(recorded)
    squareGross = squareGross.plus(orderGross)
    if (orderGross.minus(recorded).abs().gt(0.01)) {
      mismatches.push({ id: order.id, method: order.paymentMethod, recorded, squareGross: orderGross, status: order.status })
    }
  }

  console.log('--- Card sales (DreamyCafe vs Square) ---')
  console.log(`Orders checked        : ${orders.length}`)
  console.log(`Recorded card amount  : ${money(recordedTotal)}  (from DreamyCafe orders)`)
  console.log(`Square gross amount   : ${money(squareGross)}  (from Square payments)`)
  console.log(`Square processing fees: ${money(squareFees)}`)
  console.log(`Square net (gross-fee): ${money(squareGross.minus(squareFees))}`)
  if (feesPending.gt(0)) {
    console.log(`Note                  : ${money(feesPending)} of gross has no fee yet (not settled — re-run after payout).`)
  }

  if (mismatches.length) {
    console.log(`\n  Amount mismatches (${mismatches.length}) — review:`)
    for (const m of mismatches) {
      console.log(`   order #${m.id} [${m.method}/${m.status}] recorded ${money(m.recorded)} vs Square ${money(m.squareGross)}`)
    }
  } else if (orders.length) {
    console.log('\n  OK: every order matches Square to the cent.')
  }

  if (missing.length) {
    console.log(`\n  Payments not found on Square (${missing.length}):`)
    for (const m of missing) console.log(`   order #${m.id} payment ${m.pid} — ${m.reason}`)
  }

  // Best-effort payouts (money to bank). Needs PAYOUTS_READ on the token; if the
  // scope is missing, don't fail the whole reconciliation. NOTE: this SDK's pager
  // serializes omitted enum params as empty strings (400 INVALID_ENUM_VALUE), so
  // status + sortOrder must always be passed; we query each relevant status.
  console.log('\n--- Square payouts (money deposited to your bank) ---')
  try {
    if (!locationId) throw new Error('SQUARE_LOCATION_ID not set')
    let count = 0
    let paidOut = new Decimal(0)
    for (const status of ['SENT', 'PAID']) {
      const page = await client.payouts.list({
        locationId,
        status,
        sortOrder: 'DESC',
        beginTime: start.toISOString(),
        endTime: end.toISOString(),
      })
      for await (const payout of page) {
        count += 1
        const amt = toDollars(payout.amountMoney)
        paidOut = paidOut.plus(amt)
        const when = payout.arrivalDate || payout.createdAt || ''
        console.log(`   ${when}  ${payout.status.padEnd(7)}  ${money(amt)}  (${payout.id})`)
      }
    }
    if (count === 0) console.log('   No SENT/PAID payouts in this range.')
    else console.log(`\n   Payouts: ${count}   Total to bank (sent+paid): ${money(paidOut)}`)
  } catch (e) {
    console.log(`   (skipped — ${e.message})`)
    console.log('   Add PAYOUTS_READ to the access token to see bank deposits here.')
  }

  console.log('\nDone. Fees/net above reflect Square\'s own records; cash + online Stripe are not included by design.')
}

main()
  .catch((e) => {
    console.error('Error:', e.message || e)
    if (e.body) console.error('Body:', JSON.stringify(e.body))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
