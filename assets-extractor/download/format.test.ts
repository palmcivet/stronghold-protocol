import { deflateSync } from "node:zlib"
import { expect, test } from "vitest"
import { isCompletePng, isMp3, pngSize, validate } from "#download/format.js"

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(300, 0)
ihdr.writeUInt32BE(150, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.alloc(10))),
  chunk("IEND", Buffer.alloc(0)),
])

test("PNG size and completeness", () => {
  expect(pngSize(png)).toEqual({ width: 300, height: 150 })
  expect(isCompletePng(png)).toBe(true)
  expect(isCompletePng(png.subarray(0, png.length - 6))).toBe(false)
  expect(pngSize(Buffer.from("<html>not found</html>"))).toBeNull()
  expect(validate("png", Buffer.from("404: Not Found"))).toBe(false)
})

test("MP3 and atlas sniffing", () => {
  expect(isMp3(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(200)]))).toBe(true)
  expect(isMp3(Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(200)]))).toBe(true)
  expect(isMp3(Buffer.from("404: Not Found".padEnd(200)))).toBe(false)
  expect(validate("atlas", Buffer.from("\nx.png\nformat: RGBA8888\n"))).toBe(true)
  expect(validate("atlas", Buffer.from("404: Not Found"))).toBe(false)
})
