import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(root, { recursive: true })

const TEAL = [19, 78, 74, 255]
const PAPER = [255, 253, 248, 255]
const AMBER = [231, 161, 90, 255]

function crc32(buffer) {
  let c = ~0
  for (const byte of buffer) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1)
    raw[start] = 0
    pixels.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function inRoundRect(x, y, size, radius) {
  const px = x + 0.5
  const py = y + 0.5
  const cx = Math.min(Math.max(px, radius), size - radius)
  const cy = Math.min(Math.max(py, radius), size - radius)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= radius * radius
}

function paint(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const radius = maskable ? 0 : size * 0.22
  const trackW = size * (maskable ? 0.42 : 0.56)
  const trackH = size * 0.125
  const cx = size / 2
  const cy = size / 2
  const dot = size * (maskable ? 0.075 : 0.09)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (!maskable && !inRoundRect(x, y, size, radius)) continue
      let color = TEAL
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const cap = trackH / 2
      const innerLeft = cx - trackW / 2 + cap
      const innerRight = cx + trackW / 2 - cap
      const inBody = x + 0.5 >= innerLeft && x + 0.5 <= innerRight && Math.abs(dy) <= cap
      const endX = x + 0.5 < cx ? innerLeft : innerRight
      const inCap = (x + 0.5 - endX) ** 2 + dy * dy <= cap * cap
      if (inBody || inCap) color = PAPER
      if (dx * dx + dy * dy <= dot * dot) color = AMBER
      pixels[i] = color[0]
      pixels[i + 1] = color[1]
      pixels[i + 2] = color[2]
      pixels[i + 3] = color[3]
    }
  }
  return png(size, size, pixels)
}

writeFileSync(join(root, 'icon-192.png'), paint(192))
writeFileSync(join(root, 'icon-512.png'), paint(512))
writeFileSync(join(root, 'apple-touch-icon.png'), paint(180))
writeFileSync(join(root, 'icon-maskable-512.png'), paint(512, { maskable: true }))
