import net from 'net'
import { normalizePrinterType } from '@/lib/printerTypes'

const STATUS_TIMEOUT_MS = 2000
const STATUS_CONNECT_MS = 5000

function readDleEotStatusByte(socket, statusType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeAllListeners('data')
      reject(new Error('Printer status timeout'))
    }, STATUS_TIMEOUT_MS)

    socket.once('data', (data) => {
      clearTimeout(timer)
      resolve(data.length > 0 ? data[0] : null)
    })

    socket.write(Buffer.from([0x10, 0x04, statusType]))
  })
}

function queryDleEotStatus(ip, port, parseStatus) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, async () => {
      try {
        const printer = await readDleEotStatusByte(socket, 1)
        const offline = await readDleEotStatusByte(socket, 2)
        const error = await readDleEotStatusByte(socket, 3)
        const paper = await readDleEotStatusByte(socket, 4)
        socket.destroy()

        const issues = parseStatus({ printer, offline, error, paper })
        if (issues.length > 0) {
          reject(new Error(issues.join('; ')))
          return
        }
        resolve()
      } catch (err) {
        socket.destroy()
        reject(err)
      }
    })

    socket.on('error', (err) => {
      socket.destroy()
      reject(new Error(err.message || 'Could not read printer status'))
    })

    socket.setTimeout(STATUS_CONNECT_MS, () => {
      socket.destroy()
      reject(new Error('Printer status connection timed out'))
    })
  })
}

export function parseGenericEscPosStatus({ printer, offline, error, paper }) {
  const issues = []

  if (printer != null && (printer & 0x08)) {
    issues.push('Printer offline')
  }

  if (offline != null && (offline & 0x04)) {
    issues.push('Cover open')
  }

  if (error != null) {
    if (error & 0x20) issues.push('Unrecoverable printer error')
    else if (error & 0x04 || error & 0x08 || error & 0x40) issues.push('Printer error')
  }

  if (paper != null) {
    const paperEnd = ((paper >> 5) & 0x03) === 0x03
    if (paperEnd) issues.push('Paper out')
  }

  return issues
}

export function parseStarEscPosStatus({ printer, offline, error, paper }) {
  const issues = []

  if (printer != null && (printer & 0x04)) {
    issues.push('Printer offline')
  }

  if (offline != null) {
    if (offline & 0x04) issues.push('Cover open')
    if (offline & 0x20) issues.push('Paper out')
    if (offline & 0x40) issues.push('Printer error')
  }

  if (error != null) {
    if (error & 0x20) issues.push('Unrecoverable printer error')
    else if (error & 0x40) issues.push('Printer error')
    else if (error & 0x08) issues.push('Auto-cutter error')
  }

  if (paper != null && ((paper & 0x20) || (paper & 0x40))) {
    issues.push('Paper out')
  }

  return issues
}

export function queryGenericEscPosStatus(ip, port) {
  return queryDleEotStatus(ip, port, parseGenericEscPosStatus)
}

export function queryStarEscPosStatus(ip, port) {
  return queryDleEotStatus(ip, port, parseStarEscPosStatus)
}

export function queryPrinterStatus(ip, port, printerType) {
  const type = normalizePrinterType(printerType)
  if (type === 'STAR') return queryStarEscPosStatus(ip, port)
  return queryGenericEscPosStatus(ip, port)
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
