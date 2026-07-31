const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { role: 'MANAGER' },
  })
  console.log(`Updated ${result.count} ADMIN user(s) to MANAGER`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
