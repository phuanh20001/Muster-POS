const { PrismaClient } = require('@prisma/client')
const { seedInto } = require('./seedData')

const prisma = new PrismaClient()

async function main() {
  await seedInto(prisma)
  console.log('✅ Seeded: 1 admin, 1 manager, 1 staff, 4 categories, 15 products, 6 tables, 2 printer configs')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
