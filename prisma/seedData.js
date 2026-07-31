const { hash } = require('bcryptjs')

// Canonical demo/seed data, extracted so both the CLI seed (prisma/seed.js) and
// the in-process cloud reseed route (/api/demo/reseed) write the exact same shop.
// Takes a PrismaClient so the caller controls the connection lifecycle.
async function seedInto(prisma) {
  const adminPassword = await hash('admin123', 10)
  const adminPin = await hash('0000', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { pin: adminPin, role: 'ADMIN', status: 'ACTIVE' },
    create: { name: 'Admin', username: 'admin', password: adminPassword, pin: adminPin, role: 'ADMIN', status: 'ACTIVE' },
  })
  const managerPassword = await hash('manager123', 10)
  const managerPin = await hash('1234', 10)
  await prisma.user.upsert({
    where: { username: 'manager' },
    update: { pin: managerPin, role: 'MANAGER', status: 'ACTIVE' },
    create: { name: 'Manager', username: 'manager', password: managerPassword, pin: managerPin, role: 'MANAGER', status: 'ACTIVE' },
  })
  const staffPassword = await hash('staff123', 10)
  const staffPin = await hash('1111', 10)
  const staff = await prisma.user.upsert({
    where: { username: 'staff' },
    update: { pin: staffPin, status: 'ACTIVE' },
    create: { name: 'Staff', username: 'staff', password: staffPassword, pin: staffPin, role: 'STAFF', status: 'ACTIVE' },
  })

  // Demo only: leave Staff clocked in so a visitor lands on a ready till and can
  // ring a sale without first discovering the In/Out flow. The nightly reseed
  // truncates clock records, so this restores the clocked-in state each reset.
  // Never do this for a real shop — its clock records must reflect real shifts.
  if (process.env.NEXT_PUBLIC_DEMO === 'true') {
    const open = await prisma.clockRecord.findFirst({
      where: { userId: staff.id },
      orderBy: { timestamp: 'desc' },
    })
    if (open?.type !== 'IN') {
      await prisma.clockRecord.create({ data: { userId: staff.id, type: 'IN' } })
    }
  }

  const coffee = await prisma.category.upsert({
    where: { name: 'Coffee' }, update: {},
    create: { name: 'Coffee', color: '#92400E', emoji: '☕' },
  })
  const tea = await prisma.category.upsert({
    where: { name: 'Tea' }, update: {},
    create: { name: 'Tea', color: '#065F46', emoji: '🍵' },
  })
  const food = await prisma.category.upsert({
    where: { name: 'Food' }, update: {},
    create: { name: 'Food', color: '#92400E', emoji: '🥐' },
  })
  const drinks = await prisma.category.upsert({
    where: { name: 'Cold Drinks' }, update: {},
    create: { name: 'Cold Drinks', color: '#1E40AF', emoji: '🧋' },
  })

  const coffeeProducts = [
    { name: 'Espresso', price: 3.0, imageEmoji: '☕', description: 'Double shot espresso' },
    { name: 'Americano', price: 3.5, imageEmoji: '☕', description: 'Espresso with hot water' },
    { name: 'Latte', price: 4.5, imageEmoji: '🥛', description: 'Espresso with steamed milk' },
    { name: 'Cappuccino', price: 4.5, imageEmoji: '☕', description: 'Espresso with foam' },
    { name: 'Flat White', price: 4.5, imageEmoji: '☕', description: 'Double ristretto with milk' },
    { name: 'Mocha', price: 5.0, imageEmoji: '🍫', description: 'Espresso with chocolate' },
  ]
  for (const p of coffeeProducts) {
    await prisma.product.upsert({
      where: { id: coffeeProducts.indexOf(p) + 1 }, update: {},
      create: { ...p, categoryId: coffee.id },
    })
  }

  const teaProducts = [
    { name: 'Green Tea', price: 3.0, imageEmoji: '🍵', description: 'Japanese green tea' },
    { name: 'Chai Latte', price: 4.5, imageEmoji: '🍵', description: 'Spiced tea with milk' },
    { name: 'Matcha Latte', price: 5.0, imageEmoji: '🍵', description: 'Ceremonial matcha' },
  ]
  for (const p of teaProducts) {
    await prisma.product.upsert({
      where: { id: coffeeProducts.length + teaProducts.indexOf(p) + 1 }, update: {},
      create: { ...p, categoryId: tea.id },
    })
  }

  const foodProducts = [
    { name: 'Croissant', price: 3.5, imageEmoji: '🥐', description: 'Butter croissant' },
    { name: 'Muffin', price: 3.0, imageEmoji: '🧁', description: 'Blueberry muffin' },
    { name: 'Avocado Toast', price: 8.5, imageEmoji: '🥑', description: 'Sourdough with avocado' },
  ]
  for (const p of foodProducts) {
    await prisma.product.upsert({
      where: { id: coffeeProducts.length + teaProducts.length + foodProducts.indexOf(p) + 1 }, update: {},
      create: { ...p, categoryId: food.id },
    })
  }

  const coldProducts = [
    { name: 'Iced Latte', price: 5.0, imageEmoji: '🧊', description: 'Cold espresso with milk' },
    { name: 'Cold Brew', price: 4.5, imageEmoji: '🧊', description: '24h cold-steeped coffee' },
    { name: 'Bubble Tea', price: 6.0, imageEmoji: '🧋', description: 'Milk tea with tapioca' },
  ]
  for (const p of coldProducts) {
    await prisma.product.upsert({
      where: { id: coffeeProducts.length + teaProducts.length + foodProducts.length + coldProducts.indexOf(p) + 1 }, update: {},
      create: { ...p, categoryId: drinks.id },
    })
  }

  const tablePositions = [
    { number: 1, x: 80,  y: 80  },
    { number: 2, x: 240, y: 80  },
    { number: 3, x: 400, y: 80  },
    { number: 4, x: 80,  y: 240 },
    { number: 5, x: 240, y: 240 },
    { number: 6, x: 400, y: 240 },
  ]
  for (const t of tablePositions) {
    await prisma.table.upsert({
      where: { number: t.number }, update: {},
      create: { number: t.number, x: t.x, y: t.y },
    })
  }

  await prisma.printerConfig.createMany({
    skipDuplicates: true,
    data: [
      { name: 'FRONT', description: 'Front counter', ip: process.env.PRINTER_FRONT_IP ?? '', port: 9100, printReceipts: true, openDrawer: true, printDockets: true, enabled: true },
      { name: 'KITCHEN', description: 'Kitchen station', ip: process.env.PRINTER_KITCHEN_IP ?? '', port: 9100, printReceipts: false, openDrawer: false, printDockets: true, enabled: true },
    ],
  })
}

module.exports = { seedInto }
