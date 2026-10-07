import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { catalogWorkspace } from "#compiler/workspace.js"
import { decodeWoff2Tables, encodeWoff2, readSfnt, uintBase128 } from "#compiler/font/woff2.js"

const fontDir = catalogWorkspace().fontDir

test("UIntBase128", () => {
  expect(uintBase128(0)).toEqual([0])
  expect(uintBase128(127)).toEqual([0x7f])
  expect(uintBase128(128)).toEqual([0x81, 0x00])
  expect(uintBase128(0xffffffff)).toHaveLength(5)
  expect(() => uintBase128(-1)).toThrow()
})

function makeSfnt(tables: readonly (readonly [string, Buffer])[]): Buffer {
  const count = tables.length
  const header = Buffer.alloc(12 + 16 * count)
  header.writeUInt32BE(0x4f54544f, 0)
  header.writeUInt16BE(count, 4)
  let offset = header.length
  const bodies: Buffer[] = []
  tables.forEach(([tag, data], index) => {
    const rec = 12 + 16 * index
    header.write(tag, rec, "latin1")
    header.writeUInt32BE(offset, rec + 8)
    header.writeUInt32BE(data.length, rec + 12)
    const padded = Buffer.alloc((data.length + 3) & ~3)
    data.copy(padded)
    bodies.push(padded)
    offset += padded.length
  })
  return Buffer.concat([header, ...bodies])
}

test("lossless round trip of a synthetic font including an unknown tag", () => {
  const sfnt = makeSfnt([
    ["CFF ", Buffer.from("cff data ".repeat(50))],
    ["head", Buffer.alloc(54, 7)],
    ["zzzz", Buffer.from([1, 2, 3])],
  ])
  const woff2 = encodeWoff2(sfnt)
  expect(woff2.readUInt32BE(0)).toBe(0x774f4632)
  expect(woff2.length % 4).toBe(0)
  const decoded = decodeWoff2Tables(woff2)
  const source = readSfnt(sfnt)
  for (const table of source.tables) {
    const found = decoded.tables.find((row) => row.tag === table.tag)
    expect(found?.data.equals(table.data), table.tag).toBe(true)
  }
})

const fontsReady = existsSync(join(fontDir, "fonts.css"))

test.skipIf(!fontsReady)("shipped fonts decode back to their sources", () => {
  for (const name of readdirSync(fontDir).filter((file) => /\.(otf|ttf)$/.test(file))) {
    const woff2 = join(fontDir, name.replace(/\.(otf|ttf)$/, ".woff2"))
    expect(existsSync(woff2), `${woff2} exists`).toBe(true)
    const source = readSfnt(readFileSync(join(fontDir, name)))
    const decoded = decodeWoff2Tables(readFileSync(woff2))
    expect(decoded.tables).toHaveLength(source.tables.length)
    for (const table of source.tables) {
      const found = decoded.tables.find((row) => row.tag === table.tag)
      expect(found?.data.equals(table.data), `${name} ${table.tag}`).toBe(true)
    }
  }
})
