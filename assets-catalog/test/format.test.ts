import { deflateSync } from "node:zlib"
import { encodePath, mirrorUrl, safeName } from "#compiler/download/source.js"
import { expect, test } from "vitest"
import { isCompletePng, isMp3, pngSize, validate } from "#compiler/download/format.js"

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

test("mirror, path encoding and safe file names", () => {
  expect(mirrorUrl("https://raw.githubusercontent.com/fexli/ArknightsResource/main/spine/a/b.skel")).toBe(
    "https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@main/spine/a/b.skel",
  )
  expect(mirrorUrl("https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/x.mp3")).toBeNull()
  expect(mirrorUrl("https://example.com/x")).toBeNull()
  expect(encodePath("[uc]a/b c#.png")).toBe("%5Buc%5Da/b%20c%23.png")
  expect(safeName("skcom_charge_cost[3]")).toBe("skcom_charge_cost_3_")
  expect(safeName("bg_open 1")).toBe("bg_open_1")
})
