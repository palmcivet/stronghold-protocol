/** 无扩展名音频路径。浏览器改写请求，静态站点按同一张扩展名表解析回文件。 */
export const MEDIA_PREFIX = "/media/"

export const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav"] as const

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number]

const AUDIO_PATH = /^\/assets\/audio\/(.+)$/i

/**
 * `/assets/audio/bgm/act1.mp3` → `/media/bgm/act1`。
 * 跨源地址、空段和点文件保持原样。
 */
export function mediaUrl(url: string, origin?: string): string {
  if (!url) return url
  let parsed: URL
  try {
    parsed = new URL(url, origin ?? "http://localhost")
  } catch {
    return url
  }
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")
  if (origin ? parsed.origin !== origin : absolute) return url
  const match = AUDIO_PATH.exec(parsed.pathname)
  if (!match?.[1]) return url
  let rest = match[1]
  const extension = AUDIO_EXTENSIONS.find((item) => rest.toLowerCase().endsWith(item))
  if (!extension) return url
  rest = rest.slice(0, -extension.length)
  const segments = rest.split("/")
  if (!rest || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) {
    return url
  }
  return `${MEDIA_PREFIX}${rest}${parsed.search}`
}

export interface AudioFileCandidate {
  readonly stem: string
  readonly extensions: readonly AudioExtension[]
}

/**
 * `/media/bgm/act1` 要尝试的文件名。显式扩展名排在前面，其余扩展名按表内顺序跟上。
 * 空段、`.`、`..` 和点文件返回 null。
 */
export function audioFileCandidates(rest: string): AudioFileCandidate | null {
  const segments = rest.split("/").filter((segment) => segment.length > 0)
  if (!segments.length || rest.endsWith("/")) return null
  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith(".") || segment.endsWith("."))) {
    return null
  }
  const last = segments[segments.length - 1]
  if (!last) return null
  const dot = last.lastIndexOf(".")
  const given = dot >= 0 ? last.slice(dot).toLowerCase() : ""
  const wanted = AUDIO_EXTENSIONS.find((item) => item === given)
  const stemName = wanted ? last.slice(0, -wanted.length) : last
  if (!stemName || stemName.startsWith(".")) return null
  const directory = segments.slice(0, -1).join("/")
  const stem = directory ? `${directory}/${stemName}` : stemName
  const extensions = wanted
    ? [wanted, ...AUDIO_EXTENSIONS.filter((item) => item !== wanted)]
    : [...AUDIO_EXTENSIONS]
  return { stem, extensions }
}
