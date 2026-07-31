// Shared demo-reseed logic used by both the CLI script (prisma/seed-demo.js) and
// the nightly cron route (src/app/api/demo/reseed/route.js). Truncates every
// table except Prisma's migration ledger, then reapplies the canonical seed.
//
// Table discovery is dynamic (pg_tables) so a future migration adding a model
// can't silently leave stale demo data behind. Hard-guarded on NEXT_PUBLIC_DEMO
// so this destructive op can never fire against a real shop database.
export async function reseedDemo(prisma, seedInto) {
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
}
