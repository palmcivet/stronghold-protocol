// 用文件头判断下载结果是不是完整资源，丢掉错误页和截断内容。

const pngSignature: Uint8Array = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export type AssetKind = "png" | "mp3" | "font" | "atlas" | "skel" | "json" | "bin"

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
  if (!bytes.subarray(0, 8).equals(pngSignature)) return null
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

/** 签名、IHDR 和末尾 IEND 都在，才算一张下完的 PNG。 */
export function isCompletePng(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!pngSize(buf)) return false
  if (!buf || buf.length < 12) return false
  const bytes = asBuffer(buf)
  return bytes.toString("latin1", bytes.length - 8, bytes.length - 4) === "IEND"
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

/** Spine 3.8 二进制以变长整数开头的哈希开头；这里只排除明显的 HTML / 404 正文。 */
export function isSkelBinary(buf: Buffer | Uint8Array | null | undefined): boolean {
  if (!buf || buf.length < 32) return false
  const head = asBuffer(buf).toString("latin1", 0, 16).toLowerCase()
  return !head.startsWith("<!doctype") && !head.startsWith("<html") && !head.startsWith("404")
}

export function validate(kind: AssetKind, buf: Buffer | Uint8Array | null | undefined): boolean {
  switch (kind) {
    case "png":
      return isCompletePng(buf)
    case "mp3":
      return isMp3(buf)
    case "font":
      return isSfnt(buf)
    case "atlas":
      return isAtlasText(buf)
    case "skel":
      return isSkelBinary(buf)
    case "json":
      try {
        JSON.parse(asBuffer(buf ?? new Uint8Array()).toString("utf8"))
        return true
      } catch {
        return false
      }
    case "bin":
      return !!buf && buf.length > 0
  }
}

export function kindOf(name: string): AssetKind {
  const ext = String(name).toLowerCase().split(".").pop() ?? ""
  if (ext === "png") return "png"
  if (ext === "mp3") return "mp3"
  if (ext === "otf" || ext === "ttf") return "font"
  if (ext === "atlas") return "atlas"
  if (ext === "skel") return "skel"
  if (ext === "json") return "json"
  return "bin"
}
