export const PRINTER_TYPES = [
  {
    id: 'GENERIC',
    label: 'Generic ESC/POS',
    hint: 'Epson, Bixolon, Citizen, and most network thermal printers (port 9100)',
  },
  {
    id: 'STAR',
    label: 'Star Micronics',
    hint: 'Star TSP100 / TSP143 / mC-Print — enable ESC/POS mode in printer settings for status checks and printing',
  },
]

export const PAPER_WIDTHS = [
  { id: 80, label: '80 mm (standard)' },
  { id: 58, label: '58 mm (compact)' },
]

export function normalizePrinterType(value) {
  return value === 'STAR' ? 'STAR' : 'GENERIC'
}

export function normalizePaperWidth(value) {
  return Number(value) === 58 ? 58 : 80
}

export function layoutForPaper(paperWidth) {
  if (normalizePaperWidth(paperWidth) === 58) {
    return { leftCol: 20, rightCol: 8, divider: '-'.repeat(32) }
  }
  return { leftCol: 24, rightCol: 8, divider: '-'.repeat(32) }
}

export function drawerPinForType(printerType) {
  return normalizePrinterType(printerType) === 'STAR' ? 0 : 2
}

export function normalizePrinterConfig(config) {
  return {
    ip: config?.ip || '',
    port: config?.port ?? parseInt(process.env.PRINTER_PORT ?? '9100', 10),
    printerType: normalizePrinterType(config?.printerType),
    paperWidth: normalizePaperWidth(config?.paperWidth),
  }
}
