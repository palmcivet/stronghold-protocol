export const compressibleExtensions: ReadonlySet<string> = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".map",
  ".webmanifest",
  ".txt",
  ".md",
  ".csv",
  ".xml",
  ".atlas",
  ".skel",
  ".bin",
  ".wasm",
  ".svg",
  ".ico",
  ".otf",
  ".ttf",
  ".wav",
])

export const gzipMinBytes: number = 512
export const gzipCacheMaxFile: number = 8 << 20
export const gzipCacheMaxTotal: number = 96 << 20

const longCache: string = "public, max-age=86400"
const immutableCache: string = "public, max-age=31536000, immutable"
const longCacheDirectories: readonly string[] = ["assets", "fonts", "vendor"]

export const mediaTypes: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".atlas": "text/plain; charset=utf-8",
  ".skel": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
}

export function mediaType(extension: string): string {
  return mediaTypes[extension.toLowerCase()] ?? "application/octet-stream"
}

/** Accept-Encoding 里 gzip 的 q 大于 0。 */
export function acceptsGzip(header: string | undefined): boolean {
  if (!header) return false
  let gzipQ: number | null = null
  let starQ: number | null = null
  for (const part of header.split(",")) {
    const [token, ...params] = part.trim().toLowerCase().split(";")
    let q = 1
    for (const param of params) {
      const match = /^\s*q=([0-9.]+)\s*$/.exec(param)
      if (match?.[1]) q = Number(match[1])
    }
    if (!Number.isFinite(q)) q = 0
    if (token === "gzip" || token === "x-gzip") gzipQ = q
    else if (token === "*") starQ = q
  }
  if (gzipQ !== null) return gzipQ > 0
  return starQ !== null && starQ > 0
}

export type ByteRange = { readonly start: number; readonly end: number } | "unsatisfiable" | null

/** 单个 `bytes=` 区间。多段或畸形返回 null，由调用方送整文件。 */
export function parseRange(header: string | undefined, size: number): ByteRange {
  if (typeof header !== "string") return null
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header)
  if (!match) return null
  const startText = match[1] ?? ""
  const endText = match[2] ?? ""
  if (startText === "" && endText === "") return null
  if (startText === "") {
    const suffix = Number(endText)
    if (suffix === 0 || size === 0) return "unsatisfiable"
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(startText)
  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1)
  if (endText !== "" && Number(endText) < start) return null
  if (start >= size) return "unsatisfiable"
  return { start, end }
}

export function fileEtag(size: number, mtimeMs: number, gzip: boolean): string {
  const base = `${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}`
  return `"${base}${gzip ? "-gz" : ""}"`
}

function stripWeak(tag: string): string {
  return tag.trim().replace(/^W\//, "")
}

export function isNotModified(ifNoneMatch: string | undefined, ifModifiedSince: string | undefined, etag: string, mtime: Date): boolean {
  if (typeof ifNoneMatch === "string") {
    if (ifNoneMatch.trim() === "*") return true
    return ifNoneMatch.split(",").some((tag) => stripWeak(tag) === etag)
  }
  if (typeof ifModifiedSince === "string") {
    const time = Date.parse(ifModifiedSince)
    if (Number.isFinite(time)) return Math.floor(mtime.getTime() / 1000) * 1000 <= time
  }
  return false
}

/** 页面短缓存。带 `v=` 的地址长期不可变。素材、字体和 vendor 缓存一天。 */
export function cacheControl(extension: string, segments: readonly string[], query: string): string {
  if (extension === ".html" || extension === ".htm") return "no-cache"
  if (/(^|&)v=/.test(query)) return immutableCache
  const first = segments[0]
  if (segments.length > 1 && first && longCacheDirectories.includes(first)) return longCache
  return "no-cache"
}

export function shouldGzip(extension: string, size: number, rangeHeader: string | undefined, acceptEncoding: string | undefined): boolean {
  return compressibleExtensions.has(extension) && size >= gzipMinBytes && !rangeHeader && acceptsGzip(acceptEncoding)
}
