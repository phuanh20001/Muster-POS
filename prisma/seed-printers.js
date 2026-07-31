const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  await prisma.printerConfig.createMany({
    skipDuplicates: true,
    data: [
      { name: 'FRONT', description: 'Front counter', ip: process.env.PRINTER_FRONT_IP ?? '', port: 9100, printReceipts: true, openDrawer: true, printDockets: true, enabled: true },
      { name: 'KITCHEN', description: 'Kitchen station', ip: process.env.PRINTER_KITCHEN_IP ?? '', port: 9100, printReceipts: false, openDrawer: false, printDockets: true, enabled: true },
    ],
  })
  console.log('Seeded printer configs')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
