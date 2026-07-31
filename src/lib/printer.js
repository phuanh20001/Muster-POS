import escpos from 'escpos'
import Network from 'escpos-network'
import { prisma } from '@/lib/prisma'
import { gstBreakdown } from '@/lib/accounting'
import { getCardReceiptDetailsForOrder } from '@/lib/paymentProvider'
import { lineTotalForItem, itemsSubtotal } from '@/lib/orderTotals'
import { D, gt } from '@/lib/money'
import {
  drawerPinForType,
  layoutForPaper,
  normalizePrinterConfig,
  normalizePrinterType,
} from '@/lib/printerTypes'
import { enqueueFailedDocket, clearFailedDocket } from '@/lib/printQueue'
import { queryPrinterStatus, delay } from '@/lib/escposStatus'
import { orderLocationLabel, orderTicketLabel, formatDateForApi } from '@/lib/formatters'

const PRINT_TIMEOUT_MS = 5000
const POST_PRINT_STATUS_DELAY_MS = 300

function pad(str, width) {
  return String(str).slice(0, width).padEnd(width)
}

function getReceiptBusinessInfo() {
  return {
    name: process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe',
    address: process.env.RECEIPT_ADDRESS?.trim() || null,
    phone: process.env.RECEIPT_PHONE?.trim() || null,
    email: process.env.RECEIPT_EMAIL?.trim() || null,
    abn: process.env.RECEIPT_ABN?.trim() || null,
  }
}

function receiptCurrencyLabel() {
  const cur = (process.env.SQUARE_CURRENCY || process.env.STRIPE_CURRENCY || 'AUD').toUpperCase()
  return `Prices shown in ${cur}`
}

function receiptPaymentLabel(order) {
  if (order.paymentIntentId) {
    const provider = order.paymentProvider === 'SQUARE' ? 'Square' : 'Stripe'
    if (order.paymentMethod === 'SPLIT') return `Split (${provider} card)`
    return `${provider} Card`
  }
  return order.paymentMethod
}

function parsePickupName(note) {
  return note?.match(/Pickup: (.+?) \|/)?.[1]?.trim() ?? ''
}

function printDocket(printerConfig, lines) {
  const { ip, port, paperWidth, printerType } = normalizePrinterConfig(printerConfig)
  const layout = layoutForPaper(paperWidth)
  const type = normalizePrinterType(printerType)
  const checkStatus = type === 'GENERIC' || type === 'STAR'

  if (!ip) return Promise.reject(new Error('Printer IP not configured'))

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`Printer connection timed out (${ip})`))
    }, PRINT_TIMEOUT_MS)

    const device = new Network(ip, port)
    device.open((err) => {
      if (settled) return
      if (err) {
        settled = true
        clearTimeout(timer)
        console.error(`[printer] Could not connect to ${ip}:`, err.message)
        return reject(new Error(err.message || `Could not connect to ${ip}`))
      }

      const printer = new escpos.Printer(device)
      let p = printer.font('a').align('ct').style('b').size(1, 1)

      for (const line of lines) {
        if (line.type === 'title') {
          p = p.align('ct').style('b').size(1, 1).text(line.text)
        } else if (line.type === 'divider') {
          p = p.align('lt').style('normal').size(0, 0).text(layout.divider)
        } else if (line.type === 'row') {
          p = p.align('lt').style('normal').size(0, 0).text(
            `${pad(line.left, layout.leftCol)}${String(line.right ?? '').padStart(layout.rightCol)}`
          )
        } else if (line.type === 'text') {
          const w = line.big ? 1 : 0
          const h = line.big ? 1 : (line.tall ? 1 : 0)
          p = p.align(line.align ?? 'lt').style(line.bold ? 'b' : 'normal').size(w, h).text(line.text)
        } else if (line.type === 'feed') {
          p = p.feed(line.lines ?? 1)
        }
      }

      p.feed(3).cut().close(async () => {
        if (settled) return
        clearTimeout(timer)
        try {
          if (checkStatus) {
            await delay(POST_PRINT_STATUS_DELAY_MS)
            await queryPrinterStatus(ip, port, type)
          }
          settled = true
          resolve()
        } catch (statusErr) {
          settled = true
          console.error(`[printer] status check failed ${ip}:`, statusErr.message)
          reject(statusErr)
        }
      })
    })
  })
}

function kickDrawer(printerConfig) {
  const { ip, port, printerType } = normalizePrinterConfig(printerConfig)
  const drawerPin = drawerPinForType(printerType)

  return new Promise((resolve) => {
    if (!ip) return resolve()

    const device = new Network(ip, port)
    device.open((err) => {
      if (err) {
        console.error(`[printer] drawer kick failed ${ip}:`, err.message)
        return resolve()
      }
      const printer = new escpos.Printer(device)
      printer.cashdraw(drawerPin).close(() => resolve())
    })
  })
}

function envFallbackConfig(name) {
  const ip = name === 'KITCHEN' ? process.env.PRINTER_KITCHEN_IP : process.env.PRINTER_FRONT_IP
  return { ip: ip || '', port: parseInt(process.env.PRINTER_PORT ?? '9100', 10) }
}

function resolvePrinterConfig(dbConfig, name) {
  const fallback = envFallbackConfig(name)
  if (!dbConfig) return fallback
  return {
    ...fallback,
    ...dbConfig,
    ip: dbConfig.ip || fallback.ip,
    port: dbConfig.port ?? fallback.port,
  }
}

function buildLines(station, order, items) {
  const now = new Date(order.createdAt)
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  // ISO YYYY-MM-DD so the date is unambiguous to anyone (no month/day confusion).
  const date = formatDateForApi(now)

  const brandName = process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'
  const pickupName = order.source === 'ONLINE' ? parsePickupName(order.note) : ''

  // Lightspeed-style layout: small shop/station header, a large bold order type,
  // compact order/time/cashier block, large bold items, small footer timestamp.
  // Leading feed leaves clearance so the docket can hang on the rail/holder
  // without the clip covering the header.
  const lines = [
    { type: 'feed', lines: 6 },
    { type: 'text', text: brandName, align: 'ct', bold: true, tall: true },
    { type: 'text', text: station === 'KITCHEN' ? 'KITCHEN' : 'FRONT', align: 'ct', tall: true },
    { type: 'feed', lines: 1 },
    { type: 'text', text: orderLocationLabel(order), align: 'ct', bold: true, big: true },
    // Stays at the compact size the rest of this block uses: the docket is a
    // working ticket for the baristas and cooks, who read the location/name and
    // the items. The number is a reference — it ties the FRONT and KITCHEN copies
    // of one order together and matches a docket back to the POS — not something
    // called out, so it must not compete with the two lines that are.
    { type: 'text', text: `Order ${orderTicketLabel(order)}`, align: 'ct', tall: true },
    { type: 'text', text: time, align: 'ct', tall: true },
  ]

  if (order.user?.name) {
    lines.push({ type: 'text', text: `Cashier: ${order.user.name}`, align: 'ct', tall: true })
  }
  if (pickupName) {
    lines.push({ type: 'text', text: `Customer: ${pickupName}`, align: 'ct', tall: true })
  }

  lines.push({ type: 'feed', lines: 1 })
  lines.push({ type: 'divider' })

  for (const item of items) {
    const sizePart = item.size ? ` (${item.size})` : ''
    lines.push({ type: 'text', text: `${item.quantity}x ${item.product?.name ?? item.productName}${sizePart}`, align: 'lt', bold: true, big: true })
    for (const mod of (item.modifiers ?? [])) {
      lines.push({ type: 'text', text: `  + ${mod.name}`, align: 'lt', big: true })
    }
    if (item.notes) {
      lines.push({ type: 'text', text: `  -> ${item.notes}`, align: 'lt', big: true })
    }
  }

  lines.push({ type: 'divider' })

  // Operational docket only — no prices/totals/payment. A full receipt is printed
  // separately and on demand (buildReceiptLines / printReceipt) to save paper.
  if (order.note && !pickupName) {
    lines.push({ type: 'feed', lines: 1 })
    lines.push({ type: 'text', text: `Note: ${order.note}`, align: 'lt', big: true })
  }

  lines.push({ type: 'feed', lines: 1 })
  lines.push({ type: 'text', text: `${date} ${time}`, align: 'ct', tall: true })
  lines.push({ type: 'feed', lines: 1 })
  return lines
}

// Full customer receipt over the whole order (all items, with prices and the
// financial breakdown). Printed on demand or auto after card sales.
function buildReceiptLines(order, cardDetails = []) {
  const now = new Date(order.createdAt)
  const time = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  // ISO YYYY-MM-DD so the date is unambiguous to anyone (no month/day confusion).
  const date = formatDateForApi(now)
  const items = order.items ?? []
  const biz = getReceiptBusinessInfo()

  // An ATO "tax invoice" is only valid with the supplier's ABN, so only claim the
  // title when RECEIPT_ABN is set. Without it, print a plain "RECEIPT" - a document
  // that calls itself a tax invoice but omits the ABN is non-compliant.
  const lines = [
    { type: 'title', text: biz.name },
    { type: 'text', text: biz.abn ? 'TAX INVOICE / RECEIPT' : 'RECEIPT', align: 'ct', bold: true },
  ]

  if (biz.address) lines.push({ type: 'text', text: biz.address, align: 'ct' })
  if (biz.phone) lines.push({ type: 'text', text: biz.phone, align: 'ct' })
  if (biz.email) lines.push({ type: 'text', text: biz.email, align: 'ct' })
  if (biz.abn) lines.push({ type: 'text', text: `ABN ${biz.abn}`, align: 'ct' })

  lines.push(
    { type: 'text', text: orderLocationLabel(order), align: 'ct', bold: true },
    { type: 'divider' },
    { type: 'row', left: `Order ${orderTicketLabel(order)}`, right: time },
    // Ticket numbers repeat daily, so the receipt also carries the permanent id —
    // that is what staff match a refund or an accounting query against. Kept ASCII
    // like every other printed line (thermal codepages mangle punctuation).
    { type: 'text', text: `${date}  (ref ${order.id})`, align: 'lt' },
  )

  if (order.user?.name) {
    lines.push({ type: 'text', text: `Cashier: ${order.user.name}`, align: 'lt' })
  }

  lines.push({ type: 'divider' })

  for (const item of items) {
    const sizePart = item.size ? ` (${item.size})` : ''
    const lineTotal = lineTotalForItem(item)
    lines.push({ type: 'row', left: `${item.quantity}x ${item.product?.name ?? item.productName}${sizePart}`, right: `$${lineTotal.toFixed(2)}` })
    for (const mod of (item.modifiers ?? [])) {
      lines.push({ type: 'text', text: `  + ${mod.name}`, align: 'lt' })
    }
  }

  lines.push({ type: 'divider' })

  const subtotal = itemsSubtotal(items)
  lines.push({ type: 'row', left: 'Subtotal', right: `$${subtotal.toFixed(2)}` })

  if (gt(order.surchargeAmount, 0)) {
    const surchargeLabel = order.surchargeType === 'PERCENT'
      ? `Surcharge (${order.surchargeValue}%)`
      : 'Surcharge'
    lines.push({ type: 'row', left: surchargeLabel, right: `+$${D(order.surchargeAmount).toFixed(2)}` })
  }
  if (gt(order.manualDiscount, 0)) {
    lines.push({ type: 'row', left: 'Discount', right: `-$${D(order.manualDiscount).toFixed(2)}` })
  }
  if (gt(order.discountAmount, 0)) {
    lines.push({ type: 'row', left: 'Loyalty Reward', right: `-$${D(order.discountAmount).toFixed(2)}` })
  }
  if (gt(order.tipAmount, 0)) {
    lines.push({ type: 'row', left: 'Tip', right: `$${D(order.tipAmount).toFixed(2)}` })
  }

  const gst = gstBreakdown(order.total)
  if (gst.rate > 0) {
    const gstPct = Math.round(gst.rate * 100)
    lines.push({ type: 'row', left: 'Subtotal ex GST', right: `$${gst.exGst.toFixed(2)}` })
    lines.push({ type: 'row', left: `GST (${gstPct}%)`, right: `$${gst.gstAmount.toFixed(2)}` })
    lines.push({
      type: 'row',
      left: gst.inclusive ? 'TOTAL (incl GST)' : 'TOTAL (ex GST + GST)',
      right: `$${gst.inclusiveTotal.toFixed(2)}`,
    })
  } else {
    lines.push({ type: 'row', left: 'TOTAL', right: `$${D(order.total).toFixed(2)}` })
  }

  lines.push({ type: 'row', left: 'Payment', right: receiptPaymentLabel(order) })
  if (gt(order.amountPaid, 0)) {
    lines.push({ type: 'row', left: 'Paid', right: `$${D(order.amountPaid).toFixed(2)}` })
  }
  if (gt(order.change, 0)) {
    lines.push({ type: 'row', left: 'Change', right: `$${D(order.change).toFixed(2)}` })
  }

  if (cardDetails.length > 0) {
    lines.push({ type: 'divider' })
    cardDetails.forEach((card, index) => {
      const heading = cardDetails.length > 1 ? `Card payment ${index + 1}` : 'Card payment'
      lines.push({ type: 'text', text: heading, align: 'lt', bold: true })
      if (card.brand) lines.push({ type: 'text', text: `Card: ${card.brand}`, align: 'lt' })
      if (card.last4) lines.push({ type: 'text', text: `****${card.last4}`, align: 'lt' })
      if (card.authCode) lines.push({ type: 'row', left: 'Auth. code', right: card.authCode })
      if (card.reference) lines.push({ type: 'text', text: `Reference: ${card.reference}`, align: 'lt' })
      lines.push({ type: 'text', text: 'APPROVED', align: 'ct', bold: true })
    })
  }

  if (order.note) {
    lines.push({ type: 'divider' })
    lines.push({ type: 'text', text: `Note: ${order.note}`, align: 'lt' })
  }

  lines.push({ type: 'feed', lines: 1 })
  lines.push({ type: 'text', text: receiptCurrencyLabel(), align: 'ct' })
  lines.push({ type: 'text', text: 'Thank you!', align: 'ct', bold: true })
  return lines
}

async function loadDocketConfigs() {
  try {
    const rows = await prisma.printerConfig.findMany()
    return Object.fromEntries(rows.map((c) => [c.name, c]))
  } catch {
    return {}
  }
}

function getStationItems(order, station) {
  const allItems = order.items ?? []
  if (station === 'KITCHEN') return allItems.filter((i) => i.product.printer === 'KITCHEN')
  return allItems.filter((i) => (i.product.printer ?? 'FRONT') === 'FRONT')
}

export async function printOrderDocketStation(order, station) {
  const configs = await loadDocketConfigs()
  const items = getStationItems(order, station)
  if (items.length === 0) return

  const dbConfig = configs[station]
  const enabled = dbConfig ? (dbConfig.enabled && dbConfig.printDockets) : true
  if (!enabled) return

  await printDocket(
    resolvePrinterConfig(dbConfig, station),
    buildLines(station, order, items)
  )
}

export async function printOrderDockets(order) {
  const stations = []
  if (getStationItems(order, 'FRONT').length > 0) stations.push('FRONT')
  if (getStationItems(order, 'KITCHEN').length > 0) stations.push('KITCHEN')

  const printed = []
  const failed = []

  for (const station of stations) {
    try {
      await printOrderDocketStation(order, station)
      await clearFailedDocket({ orderId: order.id, station })
      printed.push(station)
    } catch (err) {
      const msg = err.message || 'Print failed'
      await enqueueFailedDocket({ orderId: order.id, station, errorMessage: msg })
      failed.push({ station, error: msg })
      console.error(`[printer] docket error ${station}:`, msg)
    }
  }

  return { printed, failed }
}

// Prints a full receipt on demand. The receipt goes to whichever printer has
// printReceipts enabled (falling back to FRONT) — this is what the printReceipts
// PrinterConfig flag controls.
export async function printReceipt(order) {
  let cardDetails = []
  if (order.paymentIntentId) {
    cardDetails = await getCardReceiptDetailsForOrder(order)
  }

  let configs = {}
  try {
    const rows = await prisma.printerConfig.findMany()
    configs = Object.fromEntries(rows.map((c) => [c.name, c]))
  } catch {
    // DB not ready — fall back to env vars only
  }

  const receiptConfig = Object.values(configs).find((c) => c.enabled && c.printReceipts)
    || configs['FRONT']

  const cfg = resolvePrinterConfig(receiptConfig, 'FRONT')
  if (!normalizePrinterConfig(cfg).ip) throw new Error('No receipt printer configured')

  await printDocket(cfg, buildReceiptLines(order, cardDetails))
}

export async function printTestDocket(printerName) {
  let config = null
  try {
    config = await prisma.printerConfig.findUnique({ where: { name: printerName } })
  } catch {
    throw new Error('Could not load printer config')
  }

  const cfg = resolvePrinterConfig(config, printerName)
  if (!normalizePrinterConfig(cfg).ip) throw new Error('Printer IP not configured')

  const brandName = process.env.DOCKET_BRAND_NAME ?? 'DreamyCafe'
  const typeLabel = config?.printerType === 'STAR' ? 'Star Micronics' : 'Generic ESC/POS'

  const lines = [
    { type: 'title', text: brandName },
    { type: 'text', text: 'TEST PRINT', align: 'ct', bold: true },
    { type: 'divider' },
    { type: 'text', text: `Printer: ${printerName}`, align: 'lt' },
    { type: 'text', text: `Type: ${typeLabel}`, align: 'lt' },
    { type: 'text', text: new Date().toLocaleString(), align: 'lt' },
    { type: 'feed', lines: 2 },
  ]

  await printDocket(cfg, lines)
}

async function loadPrinterConfigs() {
  try {
    const rows = await prisma.printerConfig.findMany()
    return Object.fromEntries(rows.map((c) => [c.name, c]))
  } catch {
    return {}
  }
}

function pickDrawerConfig(configs) {
  if (configs['FRONT']?.enabled && configs['FRONT']?.openDrawer) return configs['FRONT']
  if (configs['KITCHEN']?.enabled && configs['KITCHEN']?.openDrawer) return configs['KITCHEN']
  return Object.values(configs).find((c) => c.enabled && c.openDrawer) ?? null
}

export async function kickCashDrawer() {
  const configs = await loadPrinterConfigs()
  const drawerConfig = pickDrawerConfig(configs)
  if (!drawerConfig) return

  const cfg = resolvePrinterConfig(drawerConfig, drawerConfig.name)
  await kickDrawer(cfg)
}

export async function shouldAutoPrintCardReceipt() {
  try {
    const front = await prisma.printerConfig.findUnique({ where: { name: 'FRONT' } })
    return front?.autoPrintCardReceipts ?? true
  } catch {
    return true
  }
}

export async function shouldAutoPrintDockets() {
  try {
    const front = await prisma.printerConfig.findUnique({ where: { name: 'FRONT' } })
    return front?.autoPrintDockets ?? true
  } catch {
    return true
  }
}

export async function shouldAutoOpenDrawer() {
  try {
    const front = await prisma.printerConfig.findUnique({ where: { name: 'FRONT' } })
    return front?.autoOpenDrawer ?? true
  } catch {
    return true
  }
}

export async function printToReceiptPrinter(lines) {
  const configs = await loadPrinterConfigs()
  const receiptConfig = Object.values(configs).find((c) => c.enabled && c.printReceipts)
    || configs['FRONT']

  const cfg = resolvePrinterConfig(receiptConfig, 'FRONT')
  if (!normalizePrinterConfig(cfg).ip) throw new Error('No receipt printer configured')

  await printDocket(cfg, lines)
}
