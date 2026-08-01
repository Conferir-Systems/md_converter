// One-off generator for build/icon.ico — pure JS (pngjs + png-to-ico), no
// native canvas. Draws a rounded blue square with a white "download into a
// line" arrow, the app's convert-to-markdown metaphor.
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')
const pngToIcoModule = require('png-to-ico')
const pngToIco = pngToIcoModule.default ?? pngToIcoModule

const ACCENT = [47, 111, 237]
const WHITE = [255, 255, 255]

function drawIcon (size) {
  const png = new PNG({ width: size, height: size })
  const s = v => Math.round(v * size / 256)
  const radius = s(44)
  const shaft = { x0: s(114), x1: s(142), y0: s(52), y1: s(136) }
  const head = { yTop: s(136), yBottom: s(192), halfMax: s(46) }
  const base = { x0: s(58), x1: s(198), y0: s(204), y1: s(226) }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2

      const cx = Math.max(radius - x, x - (size - 1 - radius), 0)
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0)
      const inSquare = cx * cx + cy * cy <= radius * radius

      let color = null
      if (inSquare) {
        color = ACCENT
        const inShaft = x >= shaft.x0 && x < shaft.x1 && y >= shaft.y0 && y < shaft.y1
        const headProgress = (head.yBottom - y) / (head.yBottom - head.yTop)
        const inHead = y >= head.yTop && y < head.yBottom && Math.abs(x - size / 2) <= headProgress * head.halfMax
        const inBase = x >= base.x0 && x < base.x1 && y >= base.y0 && y < base.y1
        if (inShaft || inHead || inBase) color = WHITE
      }

      if (color) {
        png.data[idx] = color[0]
        png.data[idx + 1] = color[1]
        png.data[idx + 2] = color[2]
        png.data[idx + 3] = 255
      } else {
        png.data[idx + 3] = 0
      }
    }
  }
  return PNG.sync.write(png)
}

async function main () {
  const buildDir = path.join(__dirname, '..', 'build')
  fs.mkdirSync(buildDir, { recursive: true })
  const sizes = [16, 32, 48, 256]
  const ico = await pngToIco(sizes.map(drawIcon))
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  fs.writeFileSync(path.join(buildDir, 'icon-256.png'), drawIcon(256))
  console.log(`icon.ico written (${ico.length} bytes)`)
}

main()
