// WOFF2 编码器只做空变换：glyf/loca 变换版本 3，其余表版本 0，整包用字体模式的 Brotli。
// 解码只接受这份编码器写出的文件，用来确认转码没有改表。

import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib"

const knownTags: readonly string[] = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
]

const round4 = (n: number): number => (n + 3) & ~3

export interface SfntTable {
  readonly tag: string
  readonly data: Buffer
}

export interface SfntFont {
  readonly flavor: number
  readonly tables: readonly SfntTable[]
}

export function uintBase128(n: number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError(`UIntBase128 out of range: ${n}`)
  const bytes: number[] = []
  let value = n
  do {
    bytes.unshift(value % 128)
    value = Math.floor(value / 128)
  } while (value > 0)
  for (let i = 0; i < bytes.length - 1; i++) {
    const current = bytes[i]
    if (current === undefined) break
    bytes[i] = current | 0x80
  }
  return bytes
}

function byteAt(buf: Buffer, index: number, what: string): number {
  const value = buf[index]
  if (value === undefined) throw new Error(what)
  return value
}

function readBase128(buf: Buffer, pos: { i: number }): number {
  let value = 0
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos.i]
    pos.i += 1
    if (byte === undefined) throw new Error("truncated UIntBase128")
    if (i === 0 && byte === 0x80) throw new Error("UIntBase128 leading zero")
    value = value * 128 + (byte & 0x7f)
    if (value > 0xffffffff) throw new Error("UIntBase128 overflow")
    if (!(byte & 0x80)) return value
  }
  throw new Error("UIntBase128 too long")
}

export function readSfnt(sfnt: Buffer): SfntFont {
  if (!Buffer.isBuffer(sfnt) || sfnt.length < 12) throw new Error("not an sfnt font")
  const flavor = sfnt.readUInt32BE(0)
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(flavor)) throw new Error("unsupported sfnt flavor (TTC/WOFF?)")
  const numTables = sfnt.readUInt16BE(4)
  if (12 + numTables * 16 > sfnt.length) throw new Error("truncated table directory")
  const tables: SfntTable[] = []
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = sfnt.toString("latin1", rec, rec + 4)
    const offset = sfnt.readUInt32BE(rec + 8)
    const length = sfnt.readUInt32BE(rec + 12)
    if (offset + length > sfnt.length) throw new Error(`table ${tag} out of bounds`)
    tables.push({ tag, data: sfnt.subarray(offset, offset + length) })
  }
  return { flavor, tables }
}

function orderTables(tables: readonly SfntTable[]): SfntTable[] {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const locaIndex = sorted.findIndex((table) => table.tag === "loca")
  const glyfIndex = sorted.findIndex((table) => table.tag === "glyf")
  if (locaIndex >= 0 && glyfIndex >= 0 && locaIndex !== glyfIndex + 1) {
    const loca = sorted[locaIndex]
    if (!loca) return sorted
    sorted.splice(locaIndex, 1)
    const glyfAt = sorted.findIndex((table) => table.tag === "glyf")
    sorted.splice(glyfAt + 1, 0, loca)
  }
  return sorted
}

export function encodeWoff2(sfnt: Buffer): Buffer {
  const { flavor, tables } = readSfnt(sfnt)
  const ordered = orderTables(tables)
  const hasGlyf = ordered.some((table) => table.tag === "glyf")
  const hasLoca = ordered.some((table) => table.tag === "loca")
  if (hasGlyf !== hasLoca) throw new Error("glyf and loca must both be present")
  const directory: number[] = []
  for (const table of ordered) {
    const index = knownTags.indexOf(table.tag)
    const transform = table.tag === "glyf" || table.tag === "loca" ? 3 : 0
    directory.push((transform << 6) | (index >= 0 ? index : 63))
    if (index < 0) {
      for (let i = 0; i < 4; i++) directory.push(table.tag.charCodeAt(i) & 0xff)
    }
    directory.push(...uintBase128(table.data.length))
  }
  const stream = Buffer.concat(ordered.map((table) => table.data))
  const compressed = brotliCompressSync(stream, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: stream.length,
    },
  })
  const totalSfntSize = 12 + 16 * ordered.length + ordered.reduce((sum, table) => sum + round4(table.data.length), 0)
  const length = round4(48 + directory.length + compressed.length)
  const out = Buffer.alloc(length)
  out.writeUInt32BE(0x774f4632, 0)
  out.writeUInt32BE(flavor, 4)
  out.writeUInt32BE(length, 8)
  out.writeUInt16BE(ordered.length, 12)
  out.writeUInt16BE(0, 14)
  out.writeUInt32BE(totalSfntSize, 16)
  out.writeUInt32BE(compressed.length, 20)
  out.writeUInt16BE(1, 24)
  out.writeUInt16BE(0, 26)
  Buffer.from(directory).copy(out, 48)
  compressed.copy(out, 48 + directory.length)
  return out
}

export function decodeWoff2Tables(woff2: Buffer): SfntFont {
  if (!Buffer.isBuffer(woff2) || woff2.length < 48 || woff2.readUInt32BE(0) !== 0x774f4632) throw new Error("not a WOFF2 file")
  const flavor = woff2.readUInt32BE(4)
  const length = woff2.readUInt32BE(8)
  if (length !== woff2.length || length % 4 !== 0) throw new Error("bad WOFF2 length")
  const numTables = woff2.readUInt16BE(12)
  const compressedLength = woff2.readUInt32BE(20)
  const pos = { i: 48 }
  const entries: { tag: string; origLength: number }[] = []
  for (let n = 0; n < numTables; n++) {
    const flags = byteAt(woff2, pos.i, "truncated WOFF2 directory")
    pos.i += 1
    const index = flags & 0x3f
    const transform = flags >> 6
    let tag: string
    if (index === 63) {
      tag = woff2.toString("latin1", pos.i, pos.i + 4)
      pos.i += 4
    } else {
      const known = knownTags[index]
      if (!known) throw new Error(`unknown WOFF2 table index ${index}`)
      tag = known
    }
    const origLength = readBase128(woff2, pos)
    const isGlyfLoca = tag === "glyf" || tag === "loca"
    if ((isGlyfLoca && transform !== 3) || (!isGlyfLoca && transform !== 0)) throw new Error(`transformed table ${tag} not supported`)
    entries.push({ tag, origLength })
  }
  const end = pos.i + compressedLength
  if (end > woff2.length || round4(end) !== length) throw new Error("bad compressed block size")
  const stream = brotliDecompressSync(woff2.subarray(pos.i, end))
  let offset = 0
  const tables: SfntTable[] = entries.map((entry) => {
    const data = stream.subarray(offset, offset + entry.origLength)
    offset += entry.origLength
    return { tag: entry.tag, data }
  })
  if (offset !== stream.length) throw new Error("stream length mismatch")
  return { flavor, tables }
}
