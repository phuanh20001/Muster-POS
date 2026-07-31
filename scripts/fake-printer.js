// Dev-only fake ESC/POS printer. Listens on TCP 9100 and prints any docket it
// receives to the console, so printing can be tested without real hardware.
// Usage: node scripts/fake-printer.js  (then set PRINTER_*_IP=127.0.0.1 in .env)
const net = require('net')
const PORT = Number(process.env.FAKE_PRINTER_PORT) || 9100

net
  .createServer((socket) => {
    const chunks = []
    socket.on('data', (d) => chunks.push(d))
    socket.on('error', () => {})
    socket.on('close', () => {
      if (!chunks.length) return
      const buf = Buffer.concat(chunks)
      // Strip binary ESC/POS control bytes so the text is readable (keep newlines/tabs).
      const text = buf.toString('latin1').replace(/[\x00-\x09\x0b-\x1f]/g, '')
      console.log('\n========== PRINT JOB (' + buf.length + ' bytes) ==========')
      console.log(text)
      console.log('========== END JOB ==========\n')
    })
  })
  .listen(PORT, () => {
    console.log('Fake printer listening on 127.0.0.1:' + PORT)
    console.log('Set PRINTER_FRONT_IP=127.0.0.1 and PRINTER_KITCHEN_IP=127.0.0.1 in .env, then print.')
  })
