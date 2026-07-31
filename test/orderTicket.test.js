import test from 'node:test'
import assert from 'node:assert/strict'
import { orderTicketLabel, orderTicketWithId } from '@/lib/formatters'
import { buildOrdersCsv } from '@/lib/accounting'

test('orderTicketLabel shows the per-day ticket number', () => {
  assert.equal(orderTicketLabel({ id: 1487, dailyNumber: 12 }), '#12')
})

test('orderTicketLabel falls back to the id when there is no ticket number', () => {
  assert.equal(orderTicketLabel({ id: 1487, dailyNumber: null }), '#1487')
  assert.equal(orderTicketLabel({ id: 1487 }), '#1487')
})

test('orderTicketLabel keeps ticket 0 out of the fallback path', () => {
  // Counters start at 1, so this should never occur — but ?? must not treat a
  // falsy number as missing, or the label would silently swap to the raw id.
  assert.equal(orderTicketLabel({ id: 1487, dailyNumber: 0 }), '#0')
})

test('orderTicketWithId keeps the permanent id alongside the ticket', () => {
  assert.equal(orderTicketWithId({ id: 1487, dailyNumber: 12 }), '#12 · id 1487')
})

test('orderTicketWithId shows the id alone when unnumbered', () => {
  assert.equal(orderTicketWithId({ id: 1487, dailyNumber: null }), '#1487')
})

// The ticket column sits mid-row in the accounting export, so a header/row
// mismatch would silently shift every money column right of it by one.
test('the orders CSV keeps ticket and money in their own columns', () => {
  const order = (o) => ({
    createdAt: new Date('2026-07-30T09:15:00'),
    status: 'COMPLETED',
    source: 'POS',
    paymentMethod: 'CASH',
    paymentProvider: 'SQUARE',
    total: '4.50',
    items: [{ unitPrice: '4.50', quantity: 1, modifiers: [] }],
    ...o,
  })

  const lines = buildOrdersCsv([
    order({ id: 1487, dailyNumber: 12 }),
    order({ id: 1488, dailyNumber: null }),
  ]).split('\r\n')

  const header = lines[0].split(',')
  const cell = (row, name) => row[header.indexOf(name)]

  for (const line of lines.slice(1)) {
    assert.equal(line.split(',').length, header.length)
  }

  const numbered = lines[1].split(',')
  assert.equal(cell(numbered, 'orderId'), '1487')
  assert.equal(cell(numbered, 'ticket'), '12')
  assert.equal(cell(numbered, 'total'), '4.50')

  // An unnumbered order must leave the cell empty, never omit it.
  const unnumbered = lines[2].split(',')
  assert.equal(cell(unnumbered, 'ticket'), '')
  assert.equal(cell(unnumbered, 'total'), '4.50')
})
