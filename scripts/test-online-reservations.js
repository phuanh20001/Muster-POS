const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ALLOWED_RETURN_BASES = ['/order', '/onlineorder']

function resolveReturnBase(raw) {
  const base = typeof raw === 'string' ? raw.trim() : '/order'
  return ALLOWED_RETURN_BASES.includes(base) ? base : '/order'
}

async function claimVoucher(tx, voucher) {
  const where = {
    id: voucher.id,
    active: true,
    ...(voucher.usageLimit != null ? { timesUsed: { lt: voucher.usageLimit } } : {}),
  }
  const claimed = await tx.voucher.updateMany({
    where,
    data: { timesUsed: { increment: 1 } },
  })
  if (claimed.count === 0) throw new Error('Voucher unavailable')
}

async function testReturnBaseAllowlist() {
  const cases = [
    ['/order', '/order'],
    ['/onlineorder', '/onlineorder'],
    ['@evil.com', '/order'],
    ['https://evil.com', '/order'],
    ['//evil.com', '/order'],
    ['/order/../../../admin', '/order'],
  ]
  for (const [input, expected] of cases) {
    const out = resolveReturnBase(input)
    if (out !== expected) {
      throw new Error(`resolveReturnBase(${JSON.stringify(input)}) = ${out}, expected ${expected}`)
    }
  }
  console.log('PASS: returnBase allowlist')
}

async function testVoucherReservationRace() {
  const product = await prisma.product.findFirst({ where: { available: true, isCombo: false }, orderBy: { id: 'asc' } })
  if (!product) throw new Error('No product in DB')

  const code = `TEST${Date.now()}`
  const voucher = await prisma.voucher.create({
    data: {
      code,
      type: 'FIXED',
      value: '5.00',
      active: true,
      usageLimit: 1,
      timesUsed: 0,
    },
  })

  await prisma.$transaction(async (tx) => {
    await claimVoucher(tx, voucher)
  })

  let threw = false
  try {
    await prisma.$transaction(async (tx) => {
      await claimVoucher(tx, voucher)
    })
  } catch {
    threw = true
  }
  if (!threw) throw new Error('Second voucher claim should fail when usage limit reached')

  await prisma.voucher.update({
    where: { id: voucher.id },
    data: { timesUsed: { decrement: 1 } },
  })
  const after = await prisma.voucher.findUnique({ where: { id: voucher.id } })
  if (after.timesUsed !== 0) throw new Error('Voucher timesUsed should release to 0')

  await prisma.voucher.delete({ where: { id: voucher.id } })
  console.log('PASS: voucher reservation blocks double-claim')
}

async function run() {
  await testReturnBaseAllowlist()
  await testVoucherReservationRace()
}

run()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
