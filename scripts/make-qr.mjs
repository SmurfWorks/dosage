// Draw the QR code that opens the welcome page, for printing or sharing.
// Usage: npm run qr            (the published welcome page)
//        npm run qr -- <url>   (any other address)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const url = process.argv[2] ?? 'https://smurfworks.github.io/dosage/welcome/'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'qr')
mkdirSync(out, { recursive: true })

// Quartile error correction survives a scuffed or partly covered print; the four-module margin is the quiet zone
// scanners need. Dark on white scans most reliably, whatever the page around it looks like.
const options = { errorCorrectionLevel: 'Q', margin: 4, color: { dark: '#1a2421', light: '#ffffff' } }

writeFileSync(join(out, 'welcome.svg'), await QRCode.toString(url, { ...options, type: 'svg' }))
writeFileSync(join(out, 'welcome.png'), await QRCode.toBuffer(url, { ...options, type: 'png', width: 1024 }))

console.log(`QR code for ${url} written to public/qr/welcome.svg and welcome.png`)
