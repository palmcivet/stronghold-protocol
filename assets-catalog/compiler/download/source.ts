// 资源上游都是 raw.githubusercontent.com。镜像只在 GitHub raw 失败时用。
// ArknightsAssets 的 voice 分支保持原始 URL。

export interface RawBases {
  readonly yuanyan: string
  readonly fexli: string
  readonly arkModels: string
  readonly aa2: string
  readonly aa2voice: string
  readonly fonts: string
  readonly gamedata: string
}

export const RAW_BASES: RawBases = Object.freeze({
  yuanyan: "https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/",
  fexli: "https://raw.githubusercontent.com/fexli/ArknightsResource/main/",
  arkModels: "https://raw.githubusercontent.com/isHarryh/Ark-Models/main/",
  aa2: "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn/",
  aa2voice: "https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/",
  fonts: "https://raw.githubusercontent.com/TimWangZi/The-font-of-Arknights/master/font/",
  gamedata: "https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/",
})

const RAW_PATTERN: RegExp = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/

export function mirrorUrl(url: string): string | null {
  const match = RAW_PATTERN.exec(String(url))
  if (!match) return null
  const owner = match[1]
  const repo = match[2]
  const branch = match[3]
  const path = match[4]
  if (!owner || !repo || !branch || path === undefined) return null
  if (owner === "ArknightsAssets" && branch === "voice") return null
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`
}

/** 按路径段编码，保留斜杠。 */
export function encodePath(relPath: string): string {
  return String(relPath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function joinUrl(base: string, relPath: string): string {
  return base + encodePath(relPath)
}

export function safeName(name: string): string {
  const cleaned = String(name).replace(/[^A-Za-z0-9._-]/g, "_")
  return cleaned.length ? cleaned : "_"
}

export function assetUrl(rel: string): string {
  return "/assets/" + rel
}

export function urlDir(url: string): string {
  const text = String(url)
  const index = text.lastIndexOf("/")
  return index >= 0 ? text.slice(0, index + 1) : ""
}

export function urlBase(url: string): string {
  const text = String(url).split("?")[0] ?? ""
  const last = text.slice(text.lastIndexOf("/") + 1)
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
