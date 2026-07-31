const { PrismaClient } = require('@prisma/client')
const { seedInto } = require('./seedData')

const prisma = new PrismaClient()

// Cloud demo reseed (CLI). Wipes every visitor-created row and reapplies the
// canonical seed, so the public portfolio demo always presents a clean shop no
// matter what anyone clicked. The nightly automated path is the Vercel Cron
// route src/app/api/demo/reseed/route.js, which performs the same truncate +
// seedInto. Kept as a plain CommonJS script (no ESM import) so `node
// prisma/seed-demo.js` runs standalone.
async function main() {
  if (process.env.NEXT_PUBLIC_DEMO !== 'true') {
    throw new Error('Refusing to reseed: NEXT_PUBLIC_DEMO is not "true". This wipes all data and must only run against the demo database.')
  }

  const rows = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  const tables = rows.map((r) => `"public"."${r.tablename}"`)
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`
    )
  }

  await seedInto(prisma)
  console.log('✅ Demo reseeded')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
