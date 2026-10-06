import { asMap, type JsonMap } from "./json-map.js"

export interface SpineFile {
  readonly skel: string
  readonly atlas: string
  readonly anims: JsonMap
  readonly textures?: readonly string[]
  readonly pma?: boolean
  readonly animations?: unknown
  readonly events?: unknown
  readonly hits?: unknown
  readonly bounds?: unknown
  readonly local?: boolean
  readonly fallback?: SpineFile | null
}

export function validSpine(value: unknown): value is SpineFile {
  const map = asMap(value)
  if (!map) return false
  const skel = map["skel"]
  const atlas = map["atlas"]
  const anims = asMap(map["anims"])
  return typeof skel === "string" && /^\/[^\s]*\.skel$/.test(skel) && typeof atlas === "string" && anims !== null
}
