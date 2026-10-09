// 用文件头判断上游文件是不是完整资源，挡住错误页、LFS 指针和截断内容。

import type { FileFormat } from "arknights-assets-catalog"

const PNG_SIGNATURE: Uint8Array = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface PngSize {
  readonly width: number
  readonly height: number
}

export function asBuffer(buf: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function pngSize(buf: Buffer | Uint8Array | null | undefined): PngSize | null {
  if (!buf || buf.length < 24) return null
  const bytes = asBuffer(buf)
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

/** 签名、IHDR 和末尾 IEND 都在，才算一张完整的 PNG。 */
export function isCompletePng(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!pngSize(buf)) return false
  if (!buf || buf.length < 12) return false
  const bytes = asBuffer(buf)
  return bytes.toString("latin1", bytes.length - 8, bytes.length - 4) === "IEND"
}

export function isWebp(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 16) return false
  const bytes = asBuffer(buf)
  return bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length
}

export function isMp3(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 128) return false
  const bytes = asBuffer(buf)
  if (bytes.toString("latin1", 0, 3) === "ID3") return true
  const second = bytes[1]
  return bytes[0] === 0xff && second !== undefined && (second & 0xe0) === 0xe0
}

export function isSfnt(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 12) return false
  const tag = asBuffer(buf).readUInt32BE(0)
  return tag === 0x00010000 || tag === 0x4f54544f || tag === 0x74727565
}

export function isWoff2(buf: Buffer | Uint8Array | null | undefined): boolean {
  return !!buf && buf.length >= 48 && asBuffer(buf).readUInt32BE(0) === 0x774f4632
}

export function isAtlasText(data: Buffer | Uint8Array | string | null | undefined): boolean {
  if (data === null || data === undefined) return false
  const text = typeof data === "string" ? data : asBuffer(data).toString("utf8")
  if (text.includes("\u0000")) return false
  return /^[^\s:][^\r\n:]*\.(png|webp|jpg)\s*$/im.test(text)
}

/** Spine 3.8 二进制以变长整数开头的哈希开头；这里只排除明显的 HTML、404 正文和 LFS 指针。 */
export function isSkelBinary(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 32) return false
  const head = asBuffer(buf).toString("latin1", 0, 16).toLowerCase()
  return !head.startsWith("<!doctype") && !head.startsWith("<html") && !head.startsWith("404") && !head.startsWith("version https:")
}

function isText(buf: Buffer | Uint8Array | null | undefined): boolean {
  return !!buf && buf.length > 0 && !asBuffer(buf).includes(0)
}

function isJson(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf) return false
  try {
    JSON.parse(asBuffer(buf).toString("utf8"))
    return true
  } catch {
    return false
  }
}

export function validate(format: FileFormat, buf: Buffer | Uint8Array | null | undefined): boolean {
  switch (format) {
    case "png":
      return isCompletePng(buf)
    case "webp":
      return isWebp(buf)
    case "mp3":
      return isMp3(buf)
    case "otf":
    case "ttf":
      return isSfnt(buf)
    case "woff2":
      return isWoff2(buf)
    case "atlas":
      return isAtlasText(buf)
    case "skel":
      return isSkelBinary(buf)
    case "obj":
      return isText(buf)
    case "json":
      return isJson(buf)
  }
}

const EXTENSION_FORMATS: Readonly<Record<string, FileFormat>> = {
  png: "png",
  webp: "webp",
  skel: "skel",
  atlas: "atlas",
  mp3: "mp3",
  woff2: "woff2",
  otf: "otf",
  ttf: "ttf",
  obj: "obj",
  json: "json",
}

/** File format from the extension of an upstream path, case-insensitive; null for an unknown extension. */
export function formatOfPath(path: string): FileFormat | null {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot < 0) return null
  return EXTENSION_FORMATS[name.slice(dot + 1).toLowerCase()] ?? null
}
